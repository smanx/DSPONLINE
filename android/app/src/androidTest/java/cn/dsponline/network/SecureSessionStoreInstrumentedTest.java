package cn.dsponline.network;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.security.GeneralSecurityException;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class SecureSessionStoreInstrumentedTest {

    private static final String PREFERENCES = "dsp_secure_session_instrumentation";
    private static final String KEY_ALIAS = "cn.dsponline.network.test.cloud_session";
    private static final String TOKEN = "synthetic_android_token_" + "a".repeat(32);
    private Context context;
    private SecureSessionStore store;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        store = new SecureSessionStore(context, PREFERENCES, KEY_ALIAS);
        store.destroyForTests();
    }

    @After
    public void tearDown() {
        store.destroyForTests();
    }

    @Test
    public void encryptsTokenAndReturnsOnlyOriginBoundHandle() throws Exception {
        SecureSessionStore.SessionRecord first = store.adoptLegacyToken(TOKEN, "https://api.example.test/api/account");
        SecureSessionStore.SessionRecord repeated = store.adoptLegacyToken(TOKEN, "https://api.example.test/api/cloud-save");

        assertTrue(SecureSessionProtocol.isHandle(first.handle));
        assertEquals(first.handle, repeated.handle);
        assertEquals(TOKEN, store.resolve(first.handle, "https://api.example.test/api/account"));
        assertThrows(GeneralSecurityException.class, () -> store.resolve(first.handle, "https://other.example.test/api/account"));

        Map<String, ?> storedValues = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getAll();
        assertFalse(storedValues.values().contains(TOKEN));
        assertFalse(storedValues.toString().contains(TOKEN));
        assertNotEquals(TOKEN, storedValues.get("ciphertext"));
    }

    @Test
    public void corruptedDeviceCredentialRecoversWithoutClearingOtherAppData() throws Exception {
        SharedPreferences unrelated = context.getSharedPreferences("dsp_player_data_fixture", Context.MODE_PRIVATE);
        unrelated.edit().putString("save", "synthetic-player-save").commit();
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit()
            .putInt("version", 1)
            .putString("handle", SecureSessionProtocol.HANDLE_PREFIX + "b".repeat(43))
            .putString("origin", "https://api.example.test")
            .putString("iv", "broken")
            .putString("ciphertext", "broken")
            .commit();

        SecureSessionStore.SessionRecord recovered = store.adoptLegacyToken(TOKEN, "https://api.example.test/api/account");
        assertEquals(TOKEN, store.resolve(recovered.handle, "https://api.example.test/api/account"));
        assertEquals("synthetic-player-save", unrelated.getString("save", null));
        unrelated.edit().clear().commit();
    }

    @Test
    public void clearingHandleRevokesOnlyMatchingDeviceCredential() throws Exception {
        SecureSessionStore.SessionRecord record = store.adoptLegacyToken(TOKEN, "https://api.example.test/api/account");
        store.clearIfHandle(SecureSessionProtocol.HANDLE_PREFIX + "c".repeat(43));
        assertEquals(TOKEN, store.resolve(record.handle, "https://api.example.test/api/account"));
        store.clearIfHandle(record.handle);
        assertThrows(GeneralSecurityException.class, () -> store.resolve(record.handle, "https://api.example.test/api/account"));
    }
}
