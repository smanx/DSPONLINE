import tencentcloudSes from "tencentcloud-sdk-nodejs-ses";

const MAIL_TIMEOUT_MS = 8_000;
const TENCENT_SES_ENDPOINT = "ses.tencentcloudapi.com";
const TENCENT_SES_REGIONS = new Set(["ap-guangzhou", "ap-hongkong"]);

function normalizedPublicBaseUrl(value) {
  return typeof value === "string" ? value.trim().replace(/\/$/, "") : "";
}

function accountEmailDetails(kind, publicBaseUrl, actionToken) {
  const actionPath = kind === "verify" ? "verify" : "reset";
  return {
    actionUrl: `${publicBaseUrl}/?${actionPath}=${encodeURIComponent(actionToken)}`,
    subject: kind === "verify" ? "验证 DSP极简网络云账户" : "重置 DSP极简网络云账户密码",
  };
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeTencentError(error) {
  return {
    provider: "tencent-ses",
    code: typeof error?.code === "string" ? error.code.slice(0, 120) : "UNKNOWN",
    requestId: typeof error?.requestId === "string" ? error.requestId.slice(0, 120) : null,
  };
}

export function createTencentSesMailer({
  secretId,
  secretKey,
  region = "ap-hongkong",
  fromEmailAddress,
  verificationTemplateId,
  resetTemplateId,
  replyToAddresses = "",
  publicBaseUrl,
  client,
  logger = console,
} = {}) {
  const credentialId = typeof secretId === "string" ? secretId.trim() : "";
  const credentialKey = typeof secretKey === "string" ? secretKey.trim() : "";
  const sender = typeof fromEmailAddress === "string" ? fromEmailAddress.trim() : "";
  const replyTo = typeof replyToAddresses === "string" ? replyToAddresses.trim() : "";
  const baseUrl = normalizedPublicBaseUrl(publicBaseUrl);
  const normalizedRegion = typeof region === "string" && TENCENT_SES_REGIONS.has(region.trim()) ? region.trim() : "";
  const templateIds = {
    verify: positiveInteger(verificationTemplateId),
    reset: positiveInteger(resetTemplateId),
  };
  if (!credentialId || !credentialKey || !normalizedRegion || !sender || !baseUrl ||
    !templateIds.verify || !templateIds.reset) return null;

  const SesClient = tencentcloudSes.ses.v20201002.Client;
  const sesClient = client ?? new SesClient({
    credential: { secretId: credentialId, secretKey: credentialKey },
    region: normalizedRegion,
    profile: {
      signMethod: "TC3-HMAC-SHA256",
      httpProfile: {
        endpoint: TENCENT_SES_ENDPOINT,
        reqMethod: "POST",
        reqTimeout: Math.ceil(MAIL_TIMEOUT_MS / 1000),
      },
    },
  });

  return async function sendAccountEmail({ kind, email, actionToken }) {
    const { subject } = accountEmailDetails(kind, baseUrl, actionToken);
    try {
      await sesClient.SendEmail({
        FromEmailAddress: sender,
        Destination: [email],
        Subject: subject,
        Template: {
          TemplateID: kind === "verify" ? templateIds.verify : templateIds.reset,
          TemplateData: JSON.stringify({ actionToken }),
        },
        TriggerType: 1,
        Unsubscribe: "0",
        ...(replyTo ? { ReplyToAddresses: replyTo } : {}),
      });
      return true;
    } catch (error) {
      logger.error?.("account email delivery failed", safeTencentError(error));
      return false;
    }
  };
}

export function createWebhookMailer({ url, token, publicBaseUrl, fetchImpl = fetch, logger = console } = {}) {
  const endpoint = typeof url === "string" ? url.trim() : "";
  const secret = typeof token === "string" ? token.trim() : "";
  const baseUrl = normalizedPublicBaseUrl(publicBaseUrl);
  if (!endpoint || !baseUrl) return null;

  return async function sendAccountEmail({ kind, email, actionToken }) {
    const { actionUrl, subject } = accountEmailDetails(kind, baseUrl, actionToken);
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
          subject,
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
