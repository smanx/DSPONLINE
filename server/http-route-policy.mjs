import {
  accountArchiveBodyCapability,
  cloudSaveBodyCapability,
  createBodyCapability,
  noBodyCapability,
} from "./http-security.mjs";

export const HTTP_BODY_LIMITS = Object.freeze({
  auth: 8 * 1024,
  presence: 4 * 1024,
  analytics: 64 * 1024,
  feedback: 64 * 1024,
  administrative: 16 * 1024,
  ordinary: 32 * 1024,
});

const SESSION_HEADERS = Object.freeze(["x-dsp-session-mode", "x-dsp-csrf-token"]);
const READ_HEADERS = Object.freeze(["x-dsp-session-mode", "x-dsp-save-mode"]);
const JSON_HEADERS = Object.freeze([...SESSION_HEADERS, "x-dsp-save-mode"]);
const EMPTY_BODY_ROUTES = new Set([
  "POST /api/auth/resend-verification",
  "POST /api/auth/web-session/migrate",
]);
const OPTIONAL_EMPTY_JSON_ROUTES = new Set([
  "POST /api/auth/logout",
  "POST /api/account/sessions/revoke-all",
]);

function jsonCapability(name, maximumBytes) {
  return createBodyCapability({
    name,
    mediaTypeLimits: { "application/json": maximumBytes },
    contentEncodings: ["identity", "gzip"],
    allowedCustomHeaders: JSON_HEADERS,
  });
}

/**
 * Select the narrowest request-body capability before a byte is consumed.
 * Unknown routes deliberately get the ordinary bounded policy: this keeps
 * error handling finite without granting cloud/archive-sized bodies.
 */
export function bodyCapabilityForRoute(methodValue, pathname, {
  cloudTransferContract,
  maximumArchiveBytes,
  maximumLegacyJsonBytes,
} = {}) {
  const method = typeof methodValue === "string" ? methodValue.toUpperCase() : "GET";
  const key = `${method} ${pathname}`;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return noBodyCapability({ allowedCustomHeaders: READ_HEADERS });
  }
  if (key === "PUT /api/cloud-save") return cloudSaveBodyCapability(cloudTransferContract);
  if (key === "POST /api/account/import/archive") return accountArchiveBodyCapability(maximumArchiveBytes);
  if (key === "POST /api/account/import/legacy-json") {
    return createBodyCapability({
      name: "account-legacy-json-import",
      mediaTypeLimits: { "application/vnd.dspidle.account-export+json": maximumLegacyJsonBytes },
      contentEncodings: ["identity"],
      requireContentLength: true,
      allowedCustomHeaders: [
        "x-dsp-account-import-guard",
        "x-dsp-account-import-confirmation",
        ...SESSION_HEADERS,
      ],
      contentTypeParameters: {
        "application/vnd.dspidle.account-export+json": { charset: ["utf-8"] },
      },
    });
  }
  if (EMPTY_BODY_ROUTES.has(key)) return noBodyCapability({ allowedCustomHeaders: SESSION_HEADERS });
  if (OPTIONAL_EMPTY_JSON_ROUTES.has(key)) {
    return createBodyCapability({
      name: "optional-empty-json",
      mediaTypeLimits: { "application/json": HTTP_BODY_LIMITS.auth },
      contentEncodings: ["identity"],
      allowEmpty: true,
      allowedCustomHeaders: SESSION_HEADERS,
    });
  }
  if (pathname.startsWith("/api/auth/")) return jsonCapability("account-auth", HTTP_BODY_LIMITS.auth);
  if (pathname === "/api/presence") return jsonCapability("presence", HTTP_BODY_LIMITS.presence);
  if (pathname === "/api/analytics") return jsonCapability("analytics", HTTP_BODY_LIMITS.analytics);
  if (pathname === "/api/feedback" || pathname === "/api/errors") {
    return jsonCapability("client-report", HTTP_BODY_LIMITS.feedback);
  }
  if (pathname.startsWith("/api/admin/")) return jsonCapability("administrative", HTTP_BODY_LIMITS.administrative);
  return jsonCapability("ordinary", HTTP_BODY_LIMITS.ordinary);
}
