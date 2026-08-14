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
    const authoritativeSave = await import("/src/game/authoritativeSaveClient.ts");
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
    const response = await authoritativeSave.serializeAuthoritativeCheckpointInWorker({
        formatVersion: 2,
        savedAt,
        kind: "primary",
        slot: "main",
        stateTransfer: transfer,
        stateRevision: revision,
        contentPackRegistry: registry,
    });
    const raw = response.raw;
    const inspection = storage.inspectSave(raw);
    const compatibilityRaw = storage.serializeEnvelope(state, savedAt, "primary", undefined, registry, "main");
    const returnedCheckpoint = structuredClone(response.stateTransfer, { transfer: [response.stateTransfer.buffer] });
    const recovered = protocol.deserializeSimulationStateTransfer(returnedCheckpoint);
    return {
      sourceDetached: transfer.buffer.byteLength === 0,
      returnedSourceDetachedAfterNextTransfer: response.stateTransfer.buffer.byteLength === 0,
      originalByteLength,
      responseByteLength: response.verification.byteLength,
      actualByteLength: new TextEncoder().encode(raw).byteLength,
      sourceStateRevision: response.stateRevision,
      valid: inspection.valid,
      checksum: inspection.checksum,
      stateChecksum: response.summary.stateChecksum,
      integrity: response.summary.integrity,
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
