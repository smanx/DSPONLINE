import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createTencentSesMailer, createWebhookMailer } from "./mail.mjs";

async function readMailTemplate(filename) {
  const candidates = [
    new URL(`../deploy/mail-templates/${filename}`, import.meta.url),
    new URL(`./deploy/mail-templates/${filename}`, import.meta.url),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error(`Missing mail template: ${filename}`);
}

test("keeps account email disabled without an endpoint and public base URL", () => {
  assert.equal(createWebhookMailer({ url: "", publicBaseUrl: "https://dsponline.cn" }), null);
  assert.equal(createWebhookMailer({ url: "https://mail.example.test", publicBaseUrl: "" }), null);
});

test("sends verification and reset links through the configured webhook", async () => {
  const requests = [];
  const mailer = createWebhookMailer({
    url: "https://mail.example.test/send",
    token: "mail-secret",
    publicBaseUrl: "https://dsponline.cn/",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response("{}", { status: 202 });
    },
    logger: { error() {} },
  });
  assert.equal(await mailer({ kind: "verify", email: "pilot@example.com", actionToken: "verify-token" }), true);
  assert.equal(await mailer({ kind: "reset", email: "pilot@example.com", actionToken: "reset-token" }), true);
  assert.equal(requests[0].url, "https://mail.example.test/send");
  assert.equal(requests[0].options.headers.authorization, "Bearer mail-secret");
  assert.equal(JSON.parse(requests[0].options.body).actionUrl, "https://dsponline.cn/?verify=verify-token");
  assert.equal(JSON.parse(requests[1].options.body).actionUrl, "https://dsponline.cn/?reset=reset-token");
});

test("reports webhook delivery failures without pretending the message was sent", async () => {
  const errors = [];
  const mailer = createWebhookMailer({
    url: "https://mail.example.test/send",
    publicBaseUrl: "https://dsponline.cn",
    fetchImpl: async () => new Response("{}", { status: 503 }),
    logger: { error: (...values) => errors.push(values) },
  });
  assert.equal(await mailer({ kind: "verify", email: "pilot@example.com", actionToken: "token" }), false);
  assert.equal(errors.length, 1);
});

test("keeps Tencent SES disabled until every credential and template is configured", () => {
  const complete = {
    secretId: "secret-id",
    secretKey: "secret-key",
    region: "ap-hongkong",
    fromEmailAddress: "DSP极简网络 <no-reply@mail.dsponline.cn>",
    verificationTemplateId: "1001",
    resetTemplateId: "1002",
    publicBaseUrl: "https://dsponline.cn",
    client: { SendEmail() {} },
  };
  for (const key of ["secretId", "secretKey", "fromEmailAddress", "verificationTemplateId", "resetTemplateId", "publicBaseUrl"]) {
    assert.equal(createTencentSesMailer({ ...complete, [key]: "" }), null, `${key} must be required`);
  }
  assert.equal(createTencentSesMailer({ ...complete, region: "ap-shanghai" }), null);
  assert.equal(typeof createTencentSesMailer(complete), "function");
});

test("sends verification and reset links through approved Tencent SES templates", async () => {
  const requests = [];
  const mailer = createTencentSesMailer({
    secretId: "secret-id",
    secretKey: "secret-key",
    region: "ap-hongkong",
    fromEmailAddress: "DSP极简网络 <no-reply@mail.dsponline.cn>",
    verificationTemplateId: 1001,
    resetTemplateId: 1002,
    replyToAddresses: "support@example.com",
    publicBaseUrl: "https://dsponline.cn/",
    client: { async SendEmail(request) { requests.push(request); return { MessageId: `message-${requests.length}` }; } },
    logger: { error() {} },
  });

  assert.equal(await mailer({ kind: "verify", email: "pilot@example.com", actionToken: "verify token" }), true);
  assert.equal(await mailer({ kind: "reset", email: "pilot@example.com", actionToken: "reset-token" }), true);
  assert.deepEqual(requests[0], {
    FromEmailAddress: "DSP极简网络 <no-reply@mail.dsponline.cn>",
    Destination: ["pilot@example.com"],
    Subject: "验证 DSP极简网络云账户",
    Template: { TemplateID: 1001, TemplateData: JSON.stringify({ actionUrl: "https://dsponline.cn/?verify=verify%20token" }) },
    TriggerType: 1,
    Unsubscribe: "0",
    ReplyToAddresses: "support@example.com",
  });
  assert.equal(requests[1].Template.TemplateID, 1002);
  assert.equal(JSON.parse(requests[1].Template.TemplateData).actionUrl, "https://dsponline.cn/?reset=reset-token");
});

test("redacts Tencent SES recipients and action tokens from delivery errors", async () => {
  const errors = [];
  const mailer = createTencentSesMailer({
    secretId: "secret-id",
    secretKey: "secret-key",
    fromEmailAddress: "no-reply@mail.dsponline.cn",
    verificationTemplateId: 1001,
    resetTemplateId: 1002,
    publicBaseUrl: "https://dsponline.cn",
    client: { async SendEmail() { throw Object.assign(new Error("pilot@example.com reset-token"), { code: "FailedOperation.SendEmailErr", requestId: "request-1" }); } },
    logger: { error: (...values) => errors.push(values) },
  });

  assert.equal(await mailer({ kind: "reset", email: "pilot@example.com", actionToken: "reset-token" }), false);
  const serialized = JSON.stringify(errors);
  assert.equal(serialized.includes("pilot@example.com"), false);
  assert.equal(serialized.includes("reset-token"), false);
  assert.match(serialized, /FailedOperation\.SendEmailErr/);
});

test("keeps uploaded Tencent SES templates to the single approved actionUrl variable", async () => {
  for (const filename of ["account-verification.html", "password-reset.html"]) {
    const content = await readMailTemplate(filename);
    const variables = [...content.matchAll(/{{\s*([^}]+?)\s*}}/g)].map((match) => match[1]);
    assert.deepEqual(variables, ["actionUrl"], filename);
    assert.match(content, /href="{{actionUrl}}"/);
  }
});
