import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const deployDirectory = path.dirname(fileURLToPath(import.meta.url));
const standaloneConfigs = [
  "nginx-dsp-idle.conf",
  "nginx-dsp-idle-bootstrap.conf",
  "nginx-dsp-idle-hk-bootstrap.conf",
];
const activeCloudProxyTemplates = [
  "nginx-dsp-idle-app.conf",
  ...standaloneConfigs,
];

const readDeployFile = (file) => readFile(path.join(deployDirectory, file), "utf8");

function readNginxDurationMs(value, unit) {
  const multipliers = {
    ms: 1,
    s: 1_000,
    m: 60_000,
  };
  return Number(value) * multipliers[unit];
}

test("active Nginx templates compress static assets while preserving cache boundaries", async () => {
  const configs = await Promise.all(activeCloudProxyTemplates.map(readDeployFile));
  for (const config of configs) {
    assert.match(config, /gzip\s+on;/);
    assert.match(config, /gzip_vary\s+on;/);
    assert.match(config, /gzip_types[^;]*text\/css[^;]*application\/javascript[^;]*application\/json[^;]*image\/svg\+xml;/s);
    assert.match(config, /location \/assets\/[^}]*immutable/s);
    assert.match(config, /location @archived_immutable_asset[^}]*\/var\/www\/dsp-idle\/shared/s);
    assert.match(config, /location = \/version\.json[^}]*no-cache, no-store/s);
    assert.match(config, /location = \/sw\.js[^}]*no-cache, no-store/s);
    assert.match(config, /proxy_pass http:\/\/127\.0\.0\.1:4320/);
  }
  const domain = await readFile(path.join(deployDirectory, "nginx-dsp-idle-domain.conf"), "utf8");
  assert.match(domain, /include \/etc\/nginx\/snippets\/dsp-idle-app\.conf;/);
  assert.match(domain, /location \/downloads\/[^}]*return 302 https:\/\/download\.dsponline\.cn\$request_uri;/s);

  const download = await readFile(path.join(deployDirectory, "nginx-dsp-idle-download-shanghai.conf"), "utf8");
  assert.match(download, /server_name download\.dsponline\.cn;/);
  assert.match(download, /location \/downloads\/[^}]*try_files \$uri =404;[^}]*immutable/s);
  assert.match(download, /location = \/version\.json[^}]*no-cache, no-store/s);
  assert.match(download, /location = \/downloads\/android\/stable\.json[^}]*no-cache, no-store/s);
});

test("active Nginx cloud proxies cover the shared maximum transfer timeout", async () => {
  const contract = JSON.parse(await readFile(path.join(deployDirectory, "..", "cloud-transfer-contract.json"), "utf8"));
  assert.equal(Number.isSafeInteger(contract.maximumTimeoutMs), true);
  assert.equal(contract.maximumTimeoutMs > 0, true);

  const requiredSafetyMarginMs = 10_000;
  const configuredTimeouts = new Set();
  for (const file of activeCloudProxyTemplates) {
    const config = await readDeployFile(file);
    const apiLocation = config.match(/location \/api\/ \{(?<body>[^}]*)\}/s)?.groups?.body;
    assert.ok(apiLocation, `${file} must define the active /api/ proxy`);

    const timeout = apiLocation.match(/proxy_read_timeout\s+(\d+)(ms|s|m);/);
    assert.ok(timeout, `${file} must define proxy_read_timeout`);
    const timeoutMs = readNginxDurationMs(timeout[1], timeout[2]);
    configuredTimeouts.add(timeoutMs);
    assert.ok(
      timeoutMs >= contract.maximumTimeoutMs + requiredSafetyMarginMs,
      `${file} proxy_read_timeout must cover maximumTimeoutMs plus the safety margin`,
    );
    assert.match(apiLocation, /client_max_body_size\s+70m;/);
  }

  assert.deepEqual([...configuredTimeouts], [70_000]);
});

test("Hong Kong cloud service authorizes the packaged Android WebView origin", async () => {
  const service = await readFile(path.join(deployDirectory, "dsp-idle-cloud-hk.service"), "utf8");
  const allowedOriginLine = service.split(/\r?\n/).find((line) => line.startsWith("Environment=DSP_ALLOWED_ORIGIN="));
  assert.ok(allowedOriginLine);
  const allowedOrigins = new Set(allowedOriginLine.slice("Environment=DSP_ALLOWED_ORIGIN=".length).split(","));
  assert.equal(allowedOrigins.has("https://dsponline.cn"), true);
  assert.equal(allowedOrigins.has("https://localhost"), true);
  assert.equal(allowedOrigins.has("https://attacker.invalid"), false);
});
