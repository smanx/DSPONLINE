package cn.dsponline.network;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureSessionStore {

    static final String PREFERENCES_NAME = "dsp_secure_session_v1";
    static final String KEY_ALIAS = "cn.dsponline.network.cloud_session.v1";
    private static final String KEY_VERSION = "version";
    private static final String KEY_HANDLE = "handle";
    private static final String KEY_ORIGIN = "origin";
    private static final String KEY_IV = "iv";
    private static final String KEY_CIPHERTEXT = "ciphertext";
    private static final int FORMAT_VERSION = 1;
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String CIPHER_TRANSFORMATION = "AES/GCM/NoPadding";

    static final class SessionRecord {
        final String handle;
        final String origin;
        final String token;

        SessionRecord(String handle, String origin, String token) {
            this.handle = handle;
            this.origin = origin;
            this.token = token;
        }
    }

    private final SharedPreferences preferences;
    private final String keyAlias;
    private final SecureRandom random = new SecureRandom();

    SecureSessionStore(Context context) {
        this(context, PREFERENCES_NAME, KEY_ALIAS);
    }

    SecureSessionStore(Context context, String preferencesName, String keyAlias) {
        this.preferences = context.getApplicationContext().getSharedPreferences(preferencesName, Context.MODE_PRIVATE);
        this.keyAlias = keyAlias;
    }

    synchronized SessionRecord adoptLegacyToken(String token, String requestedOrigin) throws GeneralSecurityException {
        if (!SecureSessionProtocol.isLegacyToken(token)) throw new GeneralSecurityException("Legacy session token is invalid");
        String origin = SecureSessionProtocol.normalizeHttpsOrigin(requestedOrigin);
        SessionRecord existing = null;
        try {
            existing = readRecord();
        } catch (GeneralSecurityException invalidStoredCredential) {
            resetStorage();
        }
        if (existing != null && existing.origin.equals(origin) && MessageDigest.isEqual(
            existing.token.getBytes(StandardCharsets.UTF_8),
            token.getBytes(StandardCharsets.UTF_8)
        )) {
            return existing;
        }

        byte[] handleBytes = new byte[32];
        random.nextBytes(handleBytes);
        String handle = SecureSessionProtocol.HANDLE_PREFIX + Base64.encodeToString(
            handleBytes,
            Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING
        );
        Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        cipher.updateAAD(additionalAuthenticatedData(handle, origin));
        byte[] ciphertext = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
        String iv = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP);
        String encodedCiphertext = Base64.encodeToString(ciphertext, Base64.NO_WRAP);
        boolean committed = preferences.edit()
            .clear()
            .putInt(KEY_VERSION, FORMAT_VERSION)
            .putString(KEY_HANDLE, handle)
            .putString(KEY_ORIGIN, origin)
            .putString(KEY_IV, iv)
            .putString(KEY_CIPHERTEXT, encodedCiphertext)
            .commit();
        if (!committed) throw new GeneralSecurityException("Secure session storage commit failed");

        SessionRecord verified = readRecord();
        if (verified == null || !verified.handle.equals(handle) || !MessageDigest.isEqual(
            verified.token.getBytes(StandardCharsets.UTF_8),
            token.getBytes(StandardCharsets.UTF_8)
        )) {
            resetStorage();
            throw new GeneralSecurityException("Secure session storage verification failed");
        }
        return verified;
    }

    synchronized String resolve(String handle, String requestedOrigin) throws GeneralSecurityException {
        if (!SecureSessionProtocol.isHandle(handle)) throw new GeneralSecurityException("Secure session handle is invalid");
        String origin = SecureSessionProtocol.normalizeHttpsOrigin(requestedOrigin);
        SessionRecord record = readRecord();
        if (record == null || !record.handle.equals(handle) || !record.origin.equals(origin)) {
            throw new GeneralSecurityException("Secure session handle is unavailable for this origin");
        }
        return record.token;
    }

    synchronized void clearIfHandle(String handle) {
        if (handle == null) return;
        String storedHandle = preferences.getString(KEY_HANDLE, null);
        if (handle.equals(storedHandle)) resetStorage();
    }

    synchronized void clear() {
        resetStorage();
    }

    synchronized SessionRecord currentForTests() throws GeneralSecurityException {
        return readRecord();
    }

    synchronized void destroyForTests() {
        resetStorage();
    }

    private SessionRecord readRecord() throws GeneralSecurityException {
        if (!preferences.contains(KEY_HANDLE)) return null;
        int version = preferences.getInt(KEY_VERSION, 0);
        String handle = preferences.getString(KEY_HANDLE, null);
        String origin = preferences.getString(KEY_ORIGIN, null);
        String iv = preferences.getString(KEY_IV, null);
        String ciphertext = preferences.getString(KEY_CIPHERTEXT, null);
        if (
            version != FORMAT_VERSION || !SecureSessionProtocol.isHandle(handle) || origin == null || iv == null || ciphertext == null
        ) {
            throw new GeneralSecurityException("Secure session record is incomplete");
        }
        origin = SecureSessionProtocol.normalizeHttpsOrigin(origin);
        try {
            Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, getExistingKey(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            cipher.updateAAD(additionalAuthenticatedData(handle, origin));
            String token = new String(cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP)), StandardCharsets.UTF_8);
            if (!SecureSessionProtocol.isLegacyToken(token)) throw new GeneralSecurityException("Secure session plaintext is invalid");
            return new SessionRecord(handle, origin, token);
        } catch (IllegalArgumentException error) {
            throw new GeneralSecurityException("Secure session encoding is invalid", error);
        }
    }

    private SecretKey getExistingKey() throws GeneralSecurityException {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        loadKeyStore(keyStore);
        KeyStore.Entry entry = keyStore.getEntry(keyAlias, null);
        if (!(entry instanceof KeyStore.SecretKeyEntry)) throw new GeneralSecurityException("Secure session key is unavailable");
        return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
    }

    private SecretKey getOrCreateKey() throws GeneralSecurityException {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        loadKeyStore(keyStore);
        KeyStore.Entry existing = keyStore.getEntry(keyAlias, null);
        if (existing instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) existing).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER);
        generator.init(new KeyGenParameterSpec.Builder(
            keyAlias,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private byte[] additionalAuthenticatedData(String handle, String origin) {
        return (FORMAT_VERSION + "\n" + handle + "\n" + origin).getBytes(StandardCharsets.UTF_8);
    }

    private void loadKeyStore(KeyStore keyStore) throws GeneralSecurityException {
        try {
            keyStore.load(null);
        } catch (IOException error) {
            throw new GeneralSecurityException("Secure session keystore could not be loaded", error);
        }
    }

    private void resetStorage() {
        preferences.edit().clear().commit();
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            loadKeyStore(keyStore);
            if (keyStore.containsAlias(keyAlias)) keyStore.deleteEntry(keyAlias);
        } catch (GeneralSecurityException ignored) {
            // A stale device-bound key is harmless without the excluded ciphertext.
        }
    }
}
