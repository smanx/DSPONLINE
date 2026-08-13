package cn.dsponline.network;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SecureSessionProtocolTest {

    @Test
    public void acceptsOnlyBoundedOpaqueHandlesAndLegacyTokens() {
        String handle = SecureSessionProtocol.HANDLE_PREFIX + "A".repeat(43);
        assertTrue(SecureSessionProtocol.isHandle(handle));
        assertTrue(SecureSessionProtocol.looksLikeHandle(handle));
        assertFalse(SecureSessionProtocol.isLegacyToken(handle));
        assertFalse(SecureSessionProtocol.isHandle(SecureSessionProtocol.HANDLE_PREFIX + "short"));
        assertFalse(SecureSessionProtocol.isHandle(SecureSessionProtocol.HANDLE_PREFIX + "A".repeat(43) + "."));

        String legacyToken = "legacy_" + "b".repeat(40);
        assertTrue(SecureSessionProtocol.isLegacyToken(legacyToken));
        assertFalse(SecureSessionProtocol.isLegacyToken("short"));
        assertFalse(SecureSessionProtocol.isLegacyToken("token with whitespace" + "x".repeat(32)));
    }

    @Test
    public void normalizesOnlyHttpsOriginsWithoutCredentials() {
        assertEquals("https://api.example.test", SecureSessionProtocol.normalizeHttpsOrigin("https://API.Example.Test:443/api/account"));
        assertEquals("https://api.example.test:8443", SecureSessionProtocol.normalizeHttpsOrigin("https://api.example.test:8443/api/account"));
        assertThrows(IllegalArgumentException.class, () -> SecureSessionProtocol.normalizeHttpsOrigin("http://api.example.test/api/account"));
        assertThrows(IllegalArgumentException.class, () -> SecureSessionProtocol.normalizeHttpsOrigin("https://user@api.example.test/api/account"));
        assertThrows(IllegalArgumentException.class, () -> SecureSessionProtocol.normalizeHttpsOrigin("not a url"));
    }

    @Test
    public void exposesOnlyExactSessionLifecycleEndpoints() {
        assertTrue(SecureSessionProtocol.createsSession("/api/auth/register"));
        assertTrue(SecureSessionProtocol.createsSession("/api/auth/login"));
        assertTrue(SecureSessionProtocol.createsSession("/api/auth/reset-password"));
        assertFalse(SecureSessionProtocol.createsSession("/proxy/api/auth/login"));
        assertTrue(SecureSessionProtocol.clearsSessionAfterAttempt("/api/auth/logout"));
        assertTrue(SecureSessionProtocol.clearsSessionAfterSuccess("/api/account/delete"));
        assertTrue(SecureSessionProtocol.responseRevokesSession("/api/account", 401, "SESSION_EXPIRED", false));
        assertTrue(SecureSessionProtocol.responseRevokesSession("/api/account/sessions/revoke", 200, null, true));
        assertTrue(SecureSessionProtocol.responseRevokesSession("/api/account/delete", 200, null, false));
        assertFalse(SecureSessionProtocol.responseRevokesSession("/api/account/password", 401, "CURRENT_PASSWORD_INVALID", false));
        assertFalse(SecureSessionProtocol.responseRevokesSession("/api/auth/login", 401, "INVALID_CREDENTIALS", false));
    }

    @Test
    public void extractsBearerValuesWithoutAcceptingOtherSchemes() {
        assertEquals("synthetic_token_" + "x".repeat(32), SecureSessionProtocol.bearerToken("Bearer synthetic_token_" + "x".repeat(32)));
        assertEquals("abc", SecureSessionProtocol.bearerToken("bearer   abc  "));
        assertNull(SecureSessionProtocol.bearerToken("Basic abc"));
        assertNull(SecureSessionProtocol.bearerToken("Bearer   "));
        assertNull(SecureSessionProtocol.bearerToken(null));
    }

    @Test
    public void acceptsOnlyBoundedNativeRequestIdentifiers() {
        assertEquals("android_request_0001", SecureSessionProtocol.requestId("android_request_0001"));
        assertThrows(IllegalArgumentException.class, () -> SecureSessionProtocol.requestId("../escape"));
        assertThrows(IllegalArgumentException.class, () -> SecureSessionProtocol.requestId("short"));
        assertThrows(IllegalArgumentException.class, () -> SecureSessionProtocol.requestId(null));
    }
}
