const MAIL_TIMEOUT_MS = 8_000;

export function createWebhookMailer({ url, token, publicBaseUrl, fetchImpl = fetch, logger = console } = {}) {
  const endpoint = typeof url === "string" ? url.trim() : "";
  const secret = typeof token === "string" ? token.trim() : "";
  const baseUrl = typeof publicBaseUrl === "string" ? publicBaseUrl.replace(/\/$/, "") : "";
  if (!endpoint || !baseUrl) return null;

  return async function sendAccountEmail({ kind, email, actionToken }) {
    const actionPath = kind === "verify" ? "verify" : "reset";
    const actionUrl = `${baseUrl}/?${actionPath}=${encodeURIComponent(actionToken)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MAIL_TIMEOUT_MS);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(secret ? { authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({
          template: kind === "verify" ? "dsp-account-verification" : "dsp-password-reset",
          to: email,
          subject: kind === "verify" ? "验证 DSP极简网络云账户" : "重置 DSP极简网络云账户密码",
          actionUrl,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`mail webhook returned ${response.status}`);
      return true;
    } catch (error) {
      logger.error?.("account email delivery failed", error);
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
}
