package cn.dsponline.network;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.plugin.util.CapacitorHttpUrlConnection;
import com.getcapacitor.plugin.util.HttpRequestHandler;
import java.security.GeneralSecurityException;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

@CapacitorPlugin(name = "DspSecureSession")
public class SecureSessionPlugin extends Plugin {

    private static final String RESULT_SESSION_HANDLE = "dspSessionHandle";
    private static final String RESULT_SESSION_CLEARED = "dspSessionCleared";
    private static final String RESULT_SESSION_CLEARED_HANDLE = "dspSessionClearedHandle";
    private static final String RESULT_SECURE_FALLBACK = "dspSecureSessionVolatile";

    private static final class AuthorizationContext {
        final String secureHandle;
        final boolean unavailable;

        AuthorizationContext(String secureHandle, boolean unavailable) {
            this.secureHandle = secureHandle;
            this.unavailable = unavailable;
        }
    }

    private static final class ActiveRequest {
        final PluginCall call;
        final AtomicBoolean cancelled = new AtomicBoolean(false);

        ActiveRequest(PluginCall call) {
            this.call = call;
        }

        void cancel() {
            cancelled.set(true);
            if (call.getData().has("activeCapacitorHttpUrlConnection")) {
                try {
                    CapacitorHttpUrlConnection connection = (CapacitorHttpUrlConnection) call
                        .getData()
                        .get("activeCapacitorHttpUrlConnection");
                    connection.disconnect();
                    call.getData().remove("activeCapacitorHttpUrlConnection");
                } catch (Exception ignored) {}
            }
        }
    }

    private final Map<String, ActiveRequest> activeRequests = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final SecureSessionFallback fallback = new SecureSessionFallback();
    private SecureSessionStore store;

    @Override
    public void load() {
        store = new SecureSessionStore(getContext());
        super.load();
    }

    @Override
    protected void handleOnDestroy() {
        for (ActiveRequest request : activeRequests.values()) {
            request.cancel();
            getBridge().releaseCall(request.call);
        }
        activeRequests.clear();
        fallback.clear();
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void request(final PluginCall call) {
        final String requestId;
        try {
            requestId = SecureSessionProtocol.requestId(call.getString("requestId"));
        } catch (IllegalArgumentException error) {
            call.reject("Android secure API request identifier is invalid", "SECURE_SESSION_REQUEST_ID_INVALID");
            return;
        }
        final ActiveRequest active = new ActiveRequest(call);
        if (activeRequests.putIfAbsent(requestId, active) != null) {
            call.reject("Android secure API request identifier is already active", "SECURE_SESSION_REQUEST_DUPLICATE");
            return;
        }
        Runnable job = new Runnable() {
            @Override
            public void run() {
                String requestPath = null;
                AuthorizationContext authorization = new AuthorizationContext(null, false);
                try {
                    String url = call.getString("url", "");
                    String origin = SecureSessionProtocol.normalizeHttpsOrigin(url);
                    requestPath = SecureSessionProtocol.requestPath(url);
                    JSObject headers = call.getObject("headers", new JSObject());
                    authorization = prepareAuthorization(headers, origin);
                    if (authorization.unavailable) {
                        call.resolve(unavailableResponse(authorization.secureHandle));
                        return;
                    }
                    if (active.cancelled.get()) throw new InterruptedException("secure request cancelled");
                    call.getData().put("headers", headers);
                    JSObject response = HttpRequestHandler.request(call, null, getBridge());
                    if (active.cancelled.get()) throw new InterruptedException("secure request cancelled");
                    processResponse(response, requestPath, origin, authorization);
                    call.resolve(response);
                } catch (Exception error) {
                    if (active.cancelled.get() || error instanceof InterruptedException) {
                        call.reject("Android secure API request cancelled", "SECURE_SESSION_REQUEST_CANCELLED");
                    } else {
                        call.reject("Android secure API request failed", "SECURE_SESSION_REQUEST_FAILED");
                    }
                } finally {
                    removeAuthorization(call);
                    if (requestPath != null && SecureSessionProtocol.clearsSessionAfterAttempt(requestPath)) {
                        store.clearIfHandle(authorization.secureHandle);
                    }
                    activeRequests.remove(requestId, active);
                }
            }
        };
        if (executor.isShutdown()) {
            activeRequests.remove(requestId, active);
            call.reject("Android secure API bridge is unavailable", "SECURE_SESSION_BRIDGE_CLOSED");
            return;
        }
        try {
            executor.submit(job);
        } catch (RuntimeException error) {
            activeRequests.remove(requestId, active);
            call.reject("Android secure API bridge is unavailable", "SECURE_SESSION_BRIDGE_CLOSED");
        }
    }

    @PluginMethod
    public void cancel(final PluginCall call) {
        final String requestId;
        try {
            requestId = SecureSessionProtocol.requestId(call.getString("requestId"));
        } catch (IllegalArgumentException error) {
            call.reject("Android secure API request identifier is invalid", "SECURE_SESSION_REQUEST_ID_INVALID");
            return;
        }
        ActiveRequest active = activeRequests.get(requestId);
        if (active != null) active.cancel();
        call.resolve(new JSObject().put("cancelled", active != null));
    }

    private AuthorizationContext prepareAuthorization(JSObject headers, String origin) {
        String key = headerKey(headers, "authorization");
        if (key == null) return new AuthorizationContext(null, false);
        String supplied = SecureSessionProtocol.bearerToken(headers.optString(key, null));
        if (supplied == null) return new AuthorizationContext(null, false);
        if (SecureSessionProtocol.isHandle(supplied)) {
            try {
                String token = store.resolve(supplied, origin);
                headers.put(key, "Bearer " + token);
                return new AuthorizationContext(supplied, false);
            } catch (GeneralSecurityException unavailable) {
                try {
                    String token = fallback.resolve(supplied, origin);
                    headers.put(key, "Bearer " + token);
                    return new AuthorizationContext(supplied, false);
                } catch (GeneralSecurityException missingFallback) {
                    store.clearIfHandle(supplied);
                    fallback.clearIfHandle(supplied);
                    return new AuthorizationContext(supplied, true);
                }
            }
        }
        if (SecureSessionProtocol.looksLikeHandle(supplied)) {
            return new AuthorizationContext(supplied, true);
        }
        if (!SecureSessionProtocol.isLegacyToken(supplied)) return new AuthorizationContext(null, false);
        try {
            SecureSessionStore.SessionRecord migrated = store.adoptLegacyToken(supplied, origin);
            return new AuthorizationContext(migrated.handle, false);
        } catch (GeneralSecurityException unavailable) {
            try {
                SecureSessionStore.SessionRecord volatileSession = fallback.adopt(supplied, origin);
                headers.put(key, "Bearer " + supplied);
                return new AuthorizationContext(volatileSession.handle, false);
            } catch (GeneralSecurityException fallbackUnavailable) {
                return new AuthorizationContext(null, false);
            }
        }
    }

    private void processResponse(JSObject response, String path, String origin, AuthorizationContext authorization) {
        int status = response.getInteger("status", 0);
        boolean success = status >= 200 && status < 300;
        JSONObject data = response.opt("data") instanceof JSONObject ? (JSONObject) response.opt("data") : null;
        String responseHandle = authorization.secureHandle;

        if (success && SecureSessionProtocol.createsSession(path) && data != null) {
            String token = data.optString("token", null);
            if (SecureSessionProtocol.isLegacyToken(token)) {
                try {
                    SecureSessionStore.SessionRecord created = store.adoptLegacyToken(token, origin);
                    data.put("token", created.handle);
                    responseHandle = created.handle;
                } catch (Exception unavailable) {
                    try {
                        SecureSessionStore.SessionRecord volatileSession = fallback.adopt(token, origin);
                        data.put("token", volatileSession.handle);
                        responseHandle = volatileSession.handle;
                        response.put(RESULT_SECURE_FALLBACK, true);
                    } catch (Exception fallbackUnavailable) {
                        data.remove("token");
                        response.put("status", 503);
                        try {
                            data.put("error", "设备安全会话暂时不可用，请重试");
                            data.put("code", "ANDROID_SECURE_SESSION_STORAGE_UNAVAILABLE");
                        } catch (Exception ignored) {
                            response.put("data", new JSObject()
                                .put("error", "设备安全会话暂时不可用，请重试")
                                .put("code", "ANDROID_SECURE_SESSION_STORAGE_UNAVAILABLE"));
                        }
                        responseHandle = null;
                    }
                }
            }
        }

        boolean currentSessionRevoked = data != null && data.optBoolean("currentSessionRevoked", false);
        String responseCode = data == null ? null : data.optString("code", null);
        boolean clear = SecureSessionProtocol.responseRevokesSession(path, status, responseCode, success && currentSessionRevoked);
        if (clear) {
            store.clearIfHandle(responseHandle);
            fallback.clearIfHandle(responseHandle);
            if (responseHandle != null) response.put(RESULT_SESSION_CLEARED_HANDLE, responseHandle);
            responseHandle = null;
            response.put(RESULT_SESSION_CLEARED, true);
        }
        if (responseHandle != null) response.put(RESULT_SESSION_HANDLE, responseHandle);
    }

    private JSObject unavailableResponse(String handle) {
        JSObject headers = new JSObject().put("content-type", "application/json; charset=utf-8");
        JSObject data = new JSObject()
            .put("error", "Android 安全会话已失效，请重新登录")
            .put("code", "ANDROID_SECURE_SESSION_UNAVAILABLE");
        return new JSObject()
            .put("status", 401)
            .put("headers", headers)
            .put("data", data)
            .put(RESULT_SESSION_CLEARED, true)
            .put(RESULT_SESSION_CLEARED_HANDLE, handle);
    }

    private String headerKey(JSObject headers, String requested) {
        Iterator<String> keys = headers.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if (requested.equalsIgnoreCase(key)) return key;
        }
        return null;
    }

    private void removeAuthorization(PluginCall call) {
        JSObject headers = call.getObject("headers", null);
        if (headers == null) return;
        String key = headerKey(headers, "authorization");
        if (key != null) headers.remove(key);
    }
}
