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
});
