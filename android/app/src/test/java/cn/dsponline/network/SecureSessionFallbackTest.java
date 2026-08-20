package cn.dsponline.network;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import org.junit.Test;

public class SecureSessionFallbackTest {

    private static final String TOKEN = "synthetic_fallback_token_" + "a".repeat(32);

    @Test
    public void exposesOnlyAnOriginBoundOpaqueHandleForTheProcessLifetime() throws Exception {
        SecureRandom deterministic = SecureRandom.getInstance("SHA1PRNG");
        deterministic.setSeed(new byte[] { 1, 2, 3, 4 });
        SecureSessionFallback fallback = new SecureSessionFallback(deterministic);
        SecureSessionStore.SessionRecord first = fallback.adopt(TOKEN, "https://api.example.test/api/login");
        SecureSessionStore.SessionRecord repeated = fallback.adopt(TOKEN, "https://api.example.test/api/account");

        assertTrue(SecureSessionProtocol.isHandle(first.handle));
        assertEquals(first.handle, repeated.handle);
        assertEquals(TOKEN, fallback.resolve(first.handle, "https://api.example.test/api/account"));
        assertThrows(
            GeneralSecurityException.class,
            () -> fallback.resolve(first.handle, "https://other.example.test/api/account")
        );
        fallback.clearIfHandle(first.handle);
        assertThrows(
            GeneralSecurityException.class,
            () -> fallback.resolve(first.handle, "https://api.example.test/api/account")
        );
    }
}
