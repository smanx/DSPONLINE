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

test("active Nginx templates compress static assets while preserving cache boundaries", async () => {
  const snippet = await readFile(path.join(deployDirectory, "nginx-dsp-idle-app.conf"), "utf8");
  const configs = [snippet, ...await Promise.all(standaloneConfigs.map((file) => readFile(path.join(deployDirectory, file), "utf8")))];
  for (const config of configs) {
    assert.match(config, /gzip\s+on;/);
    assert.match(config, /gzip_vary\s+on;/);
    assert.match(config, /gzip_types[^;]*text\/css[^;]*application\/javascript[^;]*application\/json[^;]*image\/svg\+xml;/s);
    assert.match(config, /location \/assets\/[^}]*immutable/s);
    assert.match(config, /location = \/sw\.js[^}]*no-cache, no-store/s);
    assert.match(config, /proxy_pass http:\/\/127\.0\.0\.1:4320/);
  }
  const domain = await readFile(path.join(deployDirectory, "nginx-dsp-idle-domain.conf"), "utf8");
  assert.match(domain, /include \/etc\/nginx\/snippets\/dsp-idle-app\.conf;/);
  assert.match(domain, /location \/downloads\/[^}]*return 302 https:\/\/download\.dsponline\.cn\$request_uri;/s);

  const download = await readFile(path.join(deployDirectory, "nginx-dsp-idle-download-shanghai.conf"), "utf8");
  assert.match(download, /server_name download\.dsponline\.cn;/);
  assert.match(download, /location \/downloads\/[^}]*try_files \$uri =404;[^}]*immutable/s);
  assert.match(download, /location = \/downloads\/android\/stable\.json[^}]*no-cache, no-store/s);
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
