package cn.dsponline.network;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.system.ErrnoException;
import android.system.Os;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

@CapacitorPlugin(name = "DspAccountArchive")
public class AccountArchivePlugin extends Plugin {

    private static final long CACHE_RETENTION_MILLIS = 24L * 60L * 60L * 1000L;
    private static final int CONNECT_TIMEOUT_MILLIS = 60_000;
    private static final int READ_TIMEOUT_MILLIS = 300_000;
    private static final long SHARE_GRANT_RETENTION_MILLIS = 15L * 60L * 1000L;

    private static final class ActiveDownload {
        final String requestId;
        final AccountArchiveDownloadState state = new AccountArchiveDownloadState();
        volatile HttpsURLConnection connection;

        ActiveDownload(String requestId) {
            this.requestId = requestId;
        }

        synchronized AccountArchiveDownloadState.CancelResult cancel() {
            AccountArchiveDownloadState.CancelResult result = state.cancel();
            if (result != AccountArchiveDownloadState.CancelResult.CANCELLED) return result;
            HttpsURLConnection activeConnection = connection;
            if (activeConnection != null) activeConnection.disconnect();
            return result;
        }

        synchronized void beginSharing() throws AccountArchiveProtocol.ArchiveException {
            state.beginSharing();
        }
    }

    private final Object registryLock = new Object();
    private final Map<String, ActiveDownload> activeDownloads = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private SecureSessionStore sessionStore;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        sessionStore = new SecureSessionStore(getContext());
        cleanupExpiredArchives();
        super.load();
    }

    @Override
    protected void handleOnDestroy() {
        for (ActiveDownload download : activeDownloads.values()) download.cancel();
        activeDownloads.clear();
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void downloadAndShare(final PluginCall call) {
        final String requestId;
        final ActiveDownload download;
        try {
            requestId = AccountArchiveProtocol.requiredRequestId(call.getString("requestId"));
            synchronized (registryLock) {
                if (activeDownloads.containsKey(requestId)) {
                    throw new AccountArchiveProtocol.ArchiveException(
                        "ACCOUNT_ARCHIVE_REQUEST_DUPLICATE",
                        "账号归档请求标识重复"
                    );
                }
                if (!activeDownloads.isEmpty()) {
                    throw new AccountArchiveProtocol.ArchiveException(
                        "ACCOUNT_ARCHIVE_DOWNLOAD_BUSY",
                        "已有账号归档正在下载，请稍后重试"
                    );
                }
                download = new ActiveDownload(requestId);
                activeDownloads.put(requestId, download);
            }
        } catch (AccountArchiveProtocol.ArchiveException error) {
            reject(call, error);
            return;
        }

        if (executor.isShutdown()) {
            activeDownloads.remove(requestId, download);
            call.reject("Android 账号归档组件不可用", "ACCOUNT_ARCHIVE_BRIDGE_CLOSED");
            return;
        }
        Runnable task = () -> {
            File requestDirectory = null;
            File finalFile = null;
            boolean chooserOpened = false;
            try {
                AccountArchiveProtocol.throwIfCancelled(download.state::isCancelled);
                URI endpoint = AccountArchiveProtocol.archiveEndpoint(call.getString("apiBase"));
                String origin = SecureSessionProtocol.normalizeHttpsOrigin(endpoint.toString());
                String handle = call.getString("sessionHandle");
                if (!SecureSessionProtocol.isHandle(handle)) {
                    throw new AccountArchiveProtocol.ArchiveException(
                        "ACCOUNT_ARCHIVE_SECURE_SESSION_REQUIRED",
                        "请先完成 Android 安全会话迁移后再导出账号归档"
                    );
                }
                String token;
                try {
                    token = sessionStore.resolve(handle, origin);
                } catch (GeneralSecurityException error) {
                    sessionStore.clearIfHandle(handle);
                    throw new AccountArchiveProtocol.ArchiveException(
                        "ACCOUNT_ARCHIVE_AUTH_REQUIRED",
                        "账号安全会话已失效，请重新登录"
                    );
                }

                requestDirectory = createRequestDirectory(requestId);
                String fileName = AccountArchiveProtocol.safeArchiveFileName(call.getString("suggestedName"));
                finalFile = new File(requestDirectory, fileName);
                long byteLength = downloadArchive(endpoint, token, requestDirectory, finalFile, download);
                download.state.markReady();
                download.beginSharing();
                shareArchive(finalFile);
                chooserOpened = true;
                download.state.markCompleted();
                scheduleArchiveCleanup(requestDirectory, finalFile);
                call.resolve(new JSObject()
                    .put("requestId", requestId)
                    .put("fileName", fileName)
                    .put("byteLength", byteLength)
                    .put("archiveVersion", AccountArchiveProtocol.ARCHIVE_VERSION)
                    .put("chooserOpened", true));
            } catch (AccountArchiveProtocol.ArchiveException error) {
                reject(call, error);
            } catch (Exception error) {
                if (download.state.isCancelled() || Thread.currentThread().isInterrupted()) {
                    reject(call, new AccountArchiveProtocol.ArchiveException(
                        "ACCOUNT_ARCHIVE_CANCELLED",
                        "账号归档下载已取消"
                    ));
                } else {
                    call.reject("账号归档下载失败，未保留不完整文件", "ACCOUNT_ARCHIVE_DOWNLOAD_FAILED");
                }
            } finally {
                HttpsURLConnection connection = download.connection;
                if (connection != null) connection.disconnect();
                download.connection = null;
                activeDownloads.remove(requestId, download);
                if (!chooserOpened) deleteTree(requestDirectory);
            }
        };
        try {
            executor.submit(task);
        } catch (RuntimeException error) {
            activeDownloads.remove(requestId, download);
            call.reject("Android 账号归档组件不可用", "ACCOUNT_ARCHIVE_BRIDGE_CLOSED");
        }
    }

    @PluginMethod
    public void cancel(final PluginCall call) {
        String requestId;
        try {
            requestId = AccountArchiveProtocol.requiredRequestId(call.getString("requestId"));
        } catch (AccountArchiveProtocol.ArchiveException error) {
            reject(call, error);
            return;
        }
        ActiveDownload download = activeDownloads.get(requestId);
        AccountArchiveDownloadState.CancelResult result = download == null
            ? AccountArchiveDownloadState.CancelResult.COMPLETED
            : download.cancel();
        call.resolve(new JSObject()
            .put("cancelled", result == AccountArchiveDownloadState.CancelResult.CANCELLED)
            .put("tooLate", result == AccountArchiveDownloadState.CancelResult.TOO_LATE));
    }

    private long downloadArchive(
        URI endpoint,
        String token,
        File requestDirectory,
        File finalFile,
        ActiveDownload download
    ) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) endpoint.toURL().openConnection();
        download.connection = connection;
        connection.setRequestMethod("GET");
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(CONNECT_TIMEOUT_MILLIS);
        connection.setReadTimeout(READ_TIMEOUT_MILLIS);
        connection.setUseCaches(false);
        connection.setRequestProperty("Accept", AccountArchiveProtocol.CONTENT_TYPE);
        connection.setRequestProperty("Accept-Encoding", "identity");
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.connect();

        int status = connection.getResponseCode();
        if (status != HttpURLConnection.HTTP_OK) {
            String serverCode = readBoundedServerCode(connection.getErrorStream());
            throw AccountArchiveProtocol.httpError(status, serverCode);
        }
        AccountArchiveProtocol.validateResponseMetadata(
            connection.getHeaderField("Content-Type"),
            connection.getHeaderField("X-DSP-Account-Archive-Version")
        );
        long expectedBytes = AccountArchiveProtocol.requiredContentLength(connection.getHeaderField("Content-Length"));
        File partFile = File.createTempFile(".archive-", ".part", requestDirectory);
        boolean renamed = false;
        try (
            InputStream input = connection.getInputStream();
            FileOutputStream output = new FileOutputStream(partFile, false)
        ) {
            long written = AccountArchiveProtocol.copyExact(input, output, expectedBytes, download.state::isCancelled);
            output.flush();
            output.getFD().sync();
            AccountArchiveProtocol.throwIfCancelled(download.state::isCancelled);
            atomicRename(partFile, finalFile);
            fsyncDirectory(requestDirectory);
            renamed = true;
            return written;
        } catch (IOException error) {
            if (download.state.isCancelled()) {
                throw new AccountArchiveProtocol.ArchiveException(
                    "ACCOUNT_ARCHIVE_CANCELLED",
                    "账号归档下载已取消"
                );
            }
            throw new AccountArchiveProtocol.ArchiveException(
                "ACCOUNT_ARCHIVE_STREAM_FAILED",
                "云端账号归档下载中断",
                error
            );
        } finally {
            if (!renamed && partFile.exists()) partFile.delete();
        }
    }

    private void shareArchive(File file) throws AccountArchiveProtocol.ArchiveException {
        if (!file.isFile() || file.length() <= 0) {
            throw new AccountArchiveProtocol.ArchiveException(
                "ACCOUNT_ARCHIVE_SHARE_FILE_INVALID",
                "账号归档文件无法分享"
            );
        }
        final Uri uri;
        try {
            uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".secureexportprovider",
                file
            );
        } catch (RuntimeException error) {
            throw new AccountArchiveProtocol.ArchiveException(
                "ACCOUNT_ARCHIVE_SHARE_UNAVAILABLE",
                "账号归档无法交给系统分享",
                error
            );
        }
        Intent share = new Intent(Intent.ACTION_SEND)
            .setType(AccountArchiveProtocol.CONTENT_TYPE)
            .putExtra(Intent.EXTRA_STREAM, uri);
        share.setClipData(ClipData.newRawUri(file.getName(), uri));
        share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(share, "保存或分享 DSP 账号归档");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getContext().startActivity(chooser);
        } catch (RuntimeException error) {
            throw new AccountArchiveProtocol.ArchiveException(
                "ACCOUNT_ARCHIVE_SHARE_UNAVAILABLE",
                "当前设备没有可用的文件保存或分享目标",
                error
            );
        }
    }

    private void scheduleArchiveCleanup(File directory, File file) {
        if (directory == null || file == null) return;
        final Uri uri;
        try {
            uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".secureexportprovider",
                file
            );
        } catch (RuntimeException ignored) {
            return;
        }
        mainHandler.postDelayed(() -> {
            getContext().revokeUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            deleteTree(directory);
        }, SHARE_GRANT_RETENTION_MILLIS);
    }

    private File createRequestDirectory(String requestId) throws AccountArchiveProtocol.ArchiveException {
        File root = archiveRoot();
        if ((!root.exists() && !root.mkdirs()) || !root.isDirectory()) {
            throw new AccountArchiveProtocol.ArchiveException(
                "ACCOUNT_ARCHIVE_TEMP_CREATE_FAILED",
                "无法创建账号归档缓存目录"
            );
        }
        File directory = new File(root, requestId + "-" + UUID.randomUUID().toString().replace("-", ""));
        if (!directory.mkdir()) {
            throw new AccountArchiveProtocol.ArchiveException(
                "ACCOUNT_ARCHIVE_TEMP_CREATE_FAILED",
                "无法创建账号归档临时目录"
            );
        }
        return directory;
    }

    private void atomicRename(File source, File target) throws AccountArchiveProtocol.ArchiveException {
        if (!source.getParentFile().equals(target.getParentFile()) || target.exists()) {
            throw new AccountArchiveProtocol.ArchiveException(
                "ACCOUNT_ARCHIVE_RENAME_FAILED",
                "账号归档无法原子完成写入"
            );
        }
        try {
            Os.rename(source.getAbsolutePath(), target.getAbsolutePath());
        } catch (ErrnoException error) {
            throw new AccountArchiveProtocol.ArchiveException(
                "ACCOUNT_ARCHIVE_RENAME_FAILED",
                "账号归档无法原子完成写入",
                error
            );
        }
    }

    private void fsyncDirectory(File directory) throws AccountArchiveProtocol.ArchiveException {
        FileDescriptor descriptor = null;
        try {
            descriptor = Os.open(directory.getAbsolutePath(), android.system.OsConstants.O_RDONLY, 0);
            Os.fsync(descriptor);
        } catch (ErrnoException error) {
            throw new AccountArchiveProtocol.ArchiveException(
                "ACCOUNT_ARCHIVE_SYNC_FAILED",
                "账号归档无法完成持久化校验",
                error
            );
        } finally {
            if (descriptor != null) {
                try { Os.close(descriptor); } catch (ErrnoException ignored) {}
            }
        }
    }

    private String readBoundedServerCode(InputStream input) {
        if (input == null) return null;
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            while (output.size() < AccountArchiveProtocol.MAXIMUM_ERROR_BYTES) {
                int read = stream.read(buffer, 0, Math.min(buffer.length, AccountArchiveProtocol.MAXIMUM_ERROR_BYTES - output.size()));
                if (read < 0) break;
                if (read > 0) output.write(buffer, 0, read);
            }
            JSONObject parsed = new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
            return AccountArchiveProtocol.safeServerCode(parsed.optString("code", null));
        } catch (Exception ignored) {
            return null;
        }
    }

    private void cleanupExpiredArchives() {
        File root = archiveRoot();
        File[] entries = root.listFiles();
        if (entries == null) return;
        long cutoff = System.currentTimeMillis() - CACHE_RETENTION_MILLIS;
        for (File entry : entries) {
            if (entry.lastModified() < cutoff) deleteTree(entry);
        }
    }

    private void deleteTree(File target) {
        if (target == null || !target.exists()) return;
        File root = archiveRoot();
        try {
            String rootPath = root.getCanonicalPath() + File.separator;
            String targetPath = target.getCanonicalPath();
            if (!targetPath.startsWith(rootPath)) return;
        } catch (IOException ignored) {
            return;
        }
        File[] children = target.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        target.delete();
    }

    private File archiveRoot() {
        return new File(getContext().getFilesDir(), "private-exports/account-archives");
    }

    private void reject(PluginCall call, AccountArchiveProtocol.ArchiveException error) {
        JSObject detail = new JSObject();
        if (error.status > 0) detail.put("status", error.status);
        if (error.serverCode != null) detail.put("serverCode", error.serverCode);
        call.reject(error.getMessage(), error.code, detail);
    }
}
