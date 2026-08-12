const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

function availableElectron() {
  const configured = process.env.DSP_ELECTRON_BINARY;
  const candidates = [
    configured,
    path.resolve("node_modules/electron/dist/electron.exe"),
    path.resolve("release-tools/electron-v43.1.1-win32-x64/electron.exe"),
    path.resolve("../DSPidle2/release-tools/electron-v43.1.1-win32-x64/electron.exe"),
  ].filter(Boolean);
  return candidates.find(existsSync) ?? null;
}

test("Electron MessagePort streams a 30 MiB binary payload with ACK backpressure in both directions", { skip: process.platform !== "win32" || !availableElectron() }, () => {
  const electron = availableElectron();
  assert.ok(electron);
  const result = spawnSync(electron, [path.resolve("desktop/message-port-transfer-smoke.cjs")], {
    encoding: "utf8",
    timeout: 45_000,
    env: { ...process.env, DSP_ELECTRON_TRANSFER_SMOKE_BYTES: String(30 * 1024 * 1024) },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
