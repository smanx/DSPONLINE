package cn.dsponline.network;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Process-local fallback used only when Android Keystore cannot persist a new
 * session. The WebView still receives an opaque handle, never the Bearer
 * token. The session intentionally expires when the process exits.
 */
final class SecureSessionFallback {

    private final SecureRandom random;
    private SecureSessionStore.SessionRecord current;

    SecureSessionFallback() {
        this(new SecureRandom());
    }

    SecureSessionFallback(SecureRandom random) {
        this.random = random;
    }

    synchronized SecureSessionStore.SessionRecord adopt(String token, String requestedOrigin) throws GeneralSecurityException {
        if (!SecureSessionProtocol.isLegacyToken(token)) throw new GeneralSecurityException("Fallback session token is invalid");
        String origin = SecureSessionProtocol.normalizeHttpsOrigin(requestedOrigin);
        if (
            current != null
                && current.origin.equals(origin)
                && MessageDigest.isEqual(current.token.getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8))
        ) return current;
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String encoded = SecureSessionProtocol.HANDLE_PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        current = new SecureSessionStore.SessionRecord(encoded, origin, token);
        return current;
    }

    synchronized String resolve(String handle, String requestedOrigin) throws GeneralSecurityException {
        String origin = SecureSessionProtocol.normalizeHttpsOrigin(requestedOrigin);
        if (current == null || !current.handle.equals(handle) || !current.origin.equals(origin)) {
            throw new GeneralSecurityException("Fallback session handle is unavailable for this origin");
        }
        return current.token;
    }

    synchronized void clearIfHandle(String handle) {
        if (current != null && current.handle.equals(handle)) current = null;
    }

    synchronized void clear() {
        current = null;
    }
}
