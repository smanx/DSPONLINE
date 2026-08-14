import { expect, test } from "@playwright/test";

test("save Worker consumes an authoritative checkpoint without changing v2 envelope and v46 state semantics", async ({ page }) => {
  await page.route("**/__v144_authoritative_save_transfer.html", (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: "<!doctype html><html><body>authoritative save transfer</body></html>",
  }));
  await page.goto("/__v144_authoritative_save_transfer.html");
  const result = await page.evaluate(async () => {
    const engine = await import("/src/game/engine.ts");
    const protocol = await import("/src/game/simulationRuntimeProtocol.ts");
    const contentPacks = await import("/src/game/contentPacks.ts");
    const storage = await import("/src/game/storage.ts");
    const state = engine.createInitialState(44_144);
    state.paused = false;
    state.entities[0].inputs.iron_ore = 137;
    const registry = contentPacks.createContentPackRegistry();
    const savedAt = 1_786_700_000_000;
    const revision = 73;
    const transfer = protocol.serializeSimulationStateForTransfer(state);
    const originalByteLength = transfer.byteLength;
    const worker = new Worker(new URL("/src/game/save.worker.ts", location.origin), { type: "module", name: "save-serialization" });
    const response = await new Promise<{
      bytes?: ArrayBuffer;
      byteLength?: number;
      payloadChecksum?: string;
      sourceStateRevision?: number;
      sourceStateTransfer?: import("../../src/game/simulationRuntimeProtocol").SimulationStateTransfer;
      summary?: { stateChecksum?: string; integrity?: string };
      error?: string;
    }>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("save Worker timeout")), 15_000);
      worker.onmessage = (event) => {
        window.clearTimeout(timeout);
        resolve(event.data);
      };
      worker.onerror = () => reject(new Error("save Worker crashed"));
      worker.postMessage({
        id: 1,
        formatVersion: 2,
        savedAt,
        kind: "primary",
        slot: "main",
        stateTransfer: transfer,
        sourceStateRevision: revision,
        contentPackRegistry: registry,
      }, [transfer.buffer]);
    });
    worker.terminate();
    if (response.error || !(response.bytes instanceof ArrayBuffer)) throw new Error(response.error ?? "missing save bytes");
    if (!response.sourceStateTransfer) throw new Error("save Worker did not return checkpoint ownership");
    const raw = new TextDecoder().decode(response.bytes);
    const inspection = storage.inspectSave(raw);
    const compatibilityRaw = storage.serializeEnvelope(state, savedAt, "primary", undefined, registry, "main");
    const returnedCheckpoint = structuredClone(response.sourceStateTransfer, { transfer: [response.sourceStateTransfer.buffer] });
    const recovered = protocol.deserializeSimulationStateTransfer(returnedCheckpoint);
    return {
      sourceDetached: transfer.buffer.byteLength === 0,
      returnedSourceDetachedAfterNextTransfer: response.sourceStateTransfer.buffer.byteLength === 0,
      originalByteLength,
      responseByteLength: response.byteLength,
      actualByteLength: response.bytes.byteLength,
      sourceStateRevision: response.sourceStateRevision,
      valid: inspection.valid,
      checksum: inspection.checksum,
      stateChecksum: response.summary?.stateChecksum,
      integrity: response.summary?.integrity,
      exactCompatibilityBytes: raw === compatibilityRaw,
      restoredInput: inspection.state?.entities[0]?.inputs.iron_ore,
      recoveredInput: recovered.entities[0].inputs.iron_ore,
    };
  });
  expect(result).toMatchObject({
    sourceDetached: true,
    returnedSourceDetachedAfterNextTransfer: true,
    sourceStateRevision: 73,
    valid: true,
    checksum: "valid",
    integrity: "valid",
    exactCompatibilityBytes: true,
    restoredInput: 137,
    recoveredInput: 137,
  });
  expect(result.originalByteLength).toBeGreaterThan(0);
  expect(result.responseByteLength).toBe(result.actualByteLength);
});
