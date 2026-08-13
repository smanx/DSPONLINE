package cn.dsponline.network;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.regex.Pattern;

final class AccountArchiveProtocol {

    static final int ARCHIVE_VERSION = 2;
    static final String CONTENT_TYPE = "application/vnd.dspidle.account-archive+zip";
    static final String FILE_SUFFIX = ".dspaccount.zip";
    static final long MAXIMUM_ARCHIVE_BYTES = 2L * 1024L * 1024L * 1024L;
    static final int MAXIMUM_ERROR_BYTES = 64 * 1024;
    static final String ARCHIVE_PATH = "/api/account/export/archive";

    private static final Pattern REQUEST_ID_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{8,120}$");
    private static final Pattern SAFE_SERVER_CODE_PATTERN = Pattern.compile("^[A-Z0-9_]{1,80}$");

    interface CancellationCheck {
        boolean isCancelled();
    }

    static final class ArchiveException extends Exception {
        final String code;
        final int status;
        final String serverCode;

        ArchiveException(String code, String message) {
            this(code, message, 0, null, null);
        }

        ArchiveException(String code, String message, Throwable cause) {
            this(code, message, 0, null, cause);
        }

        ArchiveException(String code, String message, int status, String serverCode) {
            this(code, message, status, serverCode, null);
        }

        private ArchiveException(String code, String message, int status, String serverCode, Throwable cause) {
            super(message, cause);
            this.code = code;
            this.status = status;
            this.serverCode = safeServerCode(serverCode);
        }
    }

    private AccountArchiveProtocol() {}

    static URI archiveEndpoint(String apiBase) throws ArchiveException {
        if (apiBase == null || apiBase.length() > 2048 || apiBase.indexOf('\r') >= 0 || apiBase.indexOf('\n') >= 0) {
            throw new ArchiveException("ACCOUNT_ARCHIVE_API_BASE_INVALID", "账号归档云服务地址无效");
        }
        try {
            URI base = new URI(apiBase.trim());
            String rawPath = base.getRawPath();
            if (
                !"https".equalsIgnoreCase(base.getScheme())
                    || base.getHost() == null
                    || base.getRawUserInfo() != null
                    || base.getRawQuery() != null
                    || base.getRawFragment() != null
                    || !("/api".equals(rawPath) || "/api/".equals(rawPath))
            ) {
                throw new ArchiveException("ACCOUNT_ARCHIVE_API_BASE_INVALID", "账号归档云服务地址必须是 HTTPS /api 入口");
            }
            int normalizedPort = base.getPort() == 443 ? -1 : base.getPort();
            return new URI("https", null, base.getHost().toLowerCase(Locale.ROOT), normalizedPort, ARCHIVE_PATH, null, null);
        } catch (URISyntaxException error) {
            throw new ArchiveException("ACCOUNT_ARCHIVE_API_BASE_INVALID", "账号归档云服务地址无效", error);
        }
    }

    static String requiredRequestId(String value) throws ArchiveException {
        if (value == null || !REQUEST_ID_PATTERN.matcher(value).matches()) {
            throw new ArchiveException("ACCOUNT_ARCHIVE_REQUEST_ID_INVALID", "账号归档请求标识无效");
        }
        return value;
    }

    static String safeArchiveFileName(String suggestedName) {
        String fallback = "dsp-idle-account-" + new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date()) + FILE_SUFFIX;
        if (suggestedName == null) return fallback;
        String leaf = suggestedName.replace('\\', '/');
        int slash = leaf.lastIndexOf('/');
        if (slash >= 0) leaf = leaf.substring(slash + 1);
        leaf = leaf
            .replaceAll("[\\x00-\\x1f\\x7f<>:\"/\\\\|?*]", "_")
            .replaceAll("[. ]+$", "")
            .trim();
        String lower = leaf.toLowerCase(Locale.ROOT);
        if (lower.endsWith(FILE_SUFFIX)) {
            leaf = leaf.substring(0, leaf.length() - FILE_SUFFIX.length());
        } else if (lower.endsWith(".zip")) {
            leaf = leaf.substring(0, leaf.length() - 4);
        }
        leaf = leaf.replaceAll("[. ]+$", "").trim();
        if (leaf.isEmpty() || ".".equals(leaf) || "..".equals(leaf)) return fallback;
        if (leaf.matches("(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\..*)?$")) leaf = "_" + leaf;
        int maximumStem = 120 - FILE_SUFFIX.length();
        if (leaf.length() > maximumStem) leaf = leaf.substring(0, maximumStem).replaceAll("[. ]+$", "");
        return leaf.isEmpty() ? fallback : leaf + FILE_SUFFIX;
    }

    static long requiredContentLength(String value) throws ArchiveException {
        if (value == null || !value.matches("^[1-9][0-9]*$")) {
            throw new ArchiveException("ACCOUNT_ARCHIVE_LENGTH_INVALID", "云端账号归档缺少有效的文件长度");
        }
        try {
            long length = Long.parseLong(value);
            if (length <= 0 || length > MAXIMUM_ARCHIVE_BYTES) {
                throw new ArchiveException("ACCOUNT_ARCHIVE_LENGTH_INVALID", "云端账号归档文件长度超出安全范围");
            }
            return length;
        } catch (NumberFormatException error) {
            throw new ArchiveException("ACCOUNT_ARCHIVE_LENGTH_INVALID", "云端账号归档文件长度超出安全范围", error);
        }
    }

    static void validateResponseMetadata(String contentType, String archiveVersion) throws ArchiveException {
        String normalizedType = contentType == null ? "" : contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        if (!CONTENT_TYPE.equals(normalizedType)) {
            throw new ArchiveException("ACCOUNT_ARCHIVE_CONTENT_TYPE_INVALID", "云端返回的账号归档文件类型无效");
        }
        if (!Integer.toString(ARCHIVE_VERSION).equals(archiveVersion == null ? "" : archiveVersion.trim())) {
            throw new ArchiveException("ACCOUNT_ARCHIVE_VERSION_UNSUPPORTED", "云端账号归档版本不受支持");
        }
    }

    static long copyExact(
        InputStream input,
        OutputStream output,
        long expectedBytes,
        CancellationCheck cancellation
    ) throws IOException, ArchiveException {
        if (expectedBytes <= 0 || expectedBytes > MAXIMUM_ARCHIVE_BYTES) {
            throw new ArchiveException("ACCOUNT_ARCHIVE_LENGTH_INVALID", "云端账号归档文件长度超出安全范围");
        }
        byte[] buffer = new byte[64 * 1024];
        long total = 0;
        while (true) {
            throwIfCancelled(cancellation);
            int maximumRead = (int) Math.min(buffer.length, expectedBytes - total + 1);
            int read = input.read(buffer, 0, maximumRead);
            if (read < 0) break;
            if (read == 0) continue;
            total += read;
            if (total > expectedBytes) {
                throw new ArchiveException("ACCOUNT_ARCHIVE_BODY_TOO_LONG", "云端账号归档正文超过声明长度");
            }
            output.write(buffer, 0, read);
        }
        throwIfCancelled(cancellation);
        if (total != expectedBytes) {
            throw new ArchiveException("ACCOUNT_ARCHIVE_BODY_TRUNCATED", "云端账号归档正文长度不足");
        }
        return total;
    }

    static ArchiveException httpError(int status, String serverCode) {
        if (status == 401 || status == 403) {
            return new ArchiveException("ACCOUNT_ARCHIVE_AUTH_REQUIRED", "账号安全会话已失效，请重新登录", status, serverCode);
        }
        if (status == 404 || status == 501) {
            return new ArchiveException("ACCOUNT_ARCHIVE_UNSUPPORTED", "当前云服务不支持流式账号归档", status, serverCode);
        }
        if (status == 507) {
            return new ArchiveException("ACCOUNT_ARCHIVE_QUOTA_EXCEEDED", "云端账号归档暂时无法生成", status, serverCode);
        }
        return new ArchiveException("ACCOUNT_ARCHIVE_HTTP_ERROR", "云服务拒绝账号归档下载（HTTP " + status + "）", status, serverCode);
    }

    static String safeServerCode(String value) {
        return value != null && SAFE_SERVER_CODE_PATTERN.matcher(value).matches() ? value : null;
    }

    static void throwIfCancelled(CancellationCheck cancellation) throws ArchiveException {
        if (Thread.currentThread().isInterrupted() || cancellation != null && cancellation.isCancelled()) {
            throw new ArchiveException("ACCOUNT_ARCHIVE_CANCELLED", "账号归档下载已取消");
        }
    }
}
