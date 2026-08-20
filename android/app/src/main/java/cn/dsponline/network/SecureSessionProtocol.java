package cn.dsponline.network;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.regex.Pattern;

final class SecureSessionProtocol {

    static final String HANDLE_PREFIX = "dsp_android_session_v1_";
    private static final Pattern HANDLE_PATTERN = Pattern.compile("^dsp_android_session_v1_[A-Za-z0-9_-]{32,96}$");
    private static final Pattern LEGACY_TOKEN_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{32,256}$");
    private static final Pattern REQUEST_ID_PATTERN = Pattern.compile("^android_[A-Za-z0-9_-]{8,120}$");

    private SecureSessionProtocol() {}

    static boolean isHandle(String value) {
        return value != null && HANDLE_PATTERN.matcher(value).matches();
    }

    static boolean looksLikeHandle(String value) {
        return value != null && value.startsWith(HANDLE_PREFIX);
    }

    static boolean isLegacyToken(String value) {
        return value != null && LEGACY_TOKEN_PATTERN.matcher(value).matches() && !looksLikeHandle(value);
    }

    static String bearerToken(String authorization) {
        if (authorization == null || authorization.length() < 8 || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return null;
        }
        String value = authorization.substring(7).trim();
        return value.isEmpty() ? null : value;
    }

    static String requestId(String value) {
        if (value == null || !REQUEST_ID_PATTERN.matcher(value).matches()) {
            throw new IllegalArgumentException("Secure request identifier is invalid");
        }
        return value;
    }

    static String normalizeHttpsOrigin(String input) {
        try {
            URI uri = new URI(input);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null) {
                throw new IllegalArgumentException("Secure sessions require an HTTPS origin");
            }
            String host = uri.getHost().toLowerCase(Locale.ROOT);
            if (host.indexOf(':') >= 0) host = "[" + host + "]";
            int port = uri.getPort();
            return "https://" + host + (port < 0 || port == 443 ? "" : ":" + port);
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("Secure session origin is invalid", error);
        }
    }

    static String requestPath(String input) {
        try {
            URI uri = new URI(input);
            normalizeHttpsOrigin(input);
            String path = uri.getPath();
            return path == null || path.isEmpty() ? "/" : path;
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("Secure request URL is invalid", error);
        }
    }

    static boolean createsSession(String path) {
        return "/api/auth/register".equals(path) || "/api/auth/login".equals(path) || "/api/auth/reset-password".equals(path);
    }

    static boolean clearsSessionAfterAttempt(String path) {
        return "/api/auth/logout".equals(path);
    }

    static boolean clearsSessionAfterSuccess(String path) {
        return "/api/account/delete".equals(path);
    }

    static boolean responseRevokesSession(String path, int status, String code, boolean currentSessionRevoked) {
        if (currentSessionRevoked) return true;
        if (status < 200 || status >= 300) {
            return code != null && (
                "SESSION_EXPIRED".equals(code)
                    || "SESSION_REVOKED".equals(code)
                    || "AUTH_REQUIRED".equals(code)
            );
        }
        return clearsSessionAfterSuccess(path);
    }
}
