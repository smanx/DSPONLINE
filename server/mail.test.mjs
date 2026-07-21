import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebhookMailer } from "./mail.mjs";

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
