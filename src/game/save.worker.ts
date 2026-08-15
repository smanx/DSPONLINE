/// <reference lib="webworker" />

import { serializeSaveEnvelopeToTransfer } from "./saveTransfer";
import { projectPersistentSaveState } from "./saveProjection";
import { deserializeSimulationStateTransfer } from "./simulationRuntimeProtocol";
import { sha256Bytes } from "./payloadDigest";
import {
  canonicalAuthoritativeSaveJson,
  canonicalizeAuthoritativeSaveSettings,
  computeAuthoritativeSaveProofBindingSha256,
} from "./authoritativeSaveProof";
import type {
  AuthoritativeSaveCatalogSeed,
  AuthoritativeSavePayloadProof,
} from "./authoritativeSavePersistenceProtocol";
import type {
  AuthoritativeSaveSerializationRequest,
  AuthoritativeSaveSerializationResponse,
  AuthoritativeSaveSerializationSummary,
} from "./authoritativeSaveSerializationProtocol";
import type { SaveWorkerRequest, SaveWorkerResponse } from "./saveWorkerProtocol";
import type { GameState } from "./types";

const SETTINGS_MAX_BYTES = 2 * 1024;

type SaveSerializationRequest = SaveWorkerRequest | AuthoritativeSaveSerializationRequest;

function isAuthoritativeProofRequest(request: SaveSerializationRequest): request is AuthoritativeSaveSerializationRequest {
  return ("includeAuthoritativeProof" in request && request.includeAuthoritativeProof === true) ||
    "expectedStateIdentity" in request;
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function catalogSettings(value: unknown): AuthoritativeSaveCatalogSeed["settings"] {
  try {
    const settings = canonicalizeAuthoritativeSaveSettings(value);
    return settings && new TextEncoder().encode(canonicalAuthoritativeSaveJson(settings)).byteLength <= SETTINGS_MAX_BYTES
      ? settings
      : null;
  } catch {
    return null;
  }
}

function sourceTransferables(request: SaveSerializationRequest): Transferable[] {
  return request.stateTransfer ? [request.stateTransfer.buffer] : [];
}

self.onmessage = async (event: MessageEvent<SaveSerializationRequest>) => {
  const startedAt = performance.now();
  const request = event.data;
  const authoritativeProof = isAuthoritativeProofRequest(request);
  try {
    if ((request.state === undefined) === (request.stateTransfer === undefined)) {
      throw new Error("后台存档必须且只能提供一个权威状态来源");
    }
    const sourceTransfer = request.stateTransfer;
    const sourceState = sourceTransfer
      ? deserializeSimulationStateTransfer(sourceTransfer)
      : request.state as GameState;
    const persistent = projectPersistentSaveState(sourceState, request.contentPackRegistry);
    const mode = persistent.mode === "speedrun" ? "speedrun" : "normal";
    if (authoritativeProof) {
      const expected = request.expectedStateIdentity;
      if (expected && (
        expected.mode !== mode ||
        expected.version !== persistent.version ||
        expected.activePlanetId !== persistent.activePlanetId ||
        expected.entityCount !== persistent.entities.length ||
        expected.beltCount !== persistent.belts.length ||
        expected.elapsedSeconds !== persistent.elapsedSeconds
      )) {
        throw new Error("save Worker state transfer 与请求保存状态身份不一致");
      }
    }
    const serialized = serializeSaveEnvelopeToTransfer(persistent, {
      formatVersion: request.formatVersion,
      kind: request.kind,
      ...(request.reason ? { reason: request.reason } : {}),
      mode,
      slot: request.slot,
      savedAt: request.savedAt,
    });
    const needsPayloadSha256 = request.includePayloadSha256 || authoritativeProof;
    const payloadSha256 = needsPayloadSha256 ? await sha256Bytes(serialized.bytes) : undefined;
    const summary: AuthoritativeSaveSerializationSummary = {
      stateVersion: integer(persistent.version),
      savedAt: request.savedAt,
      mode,
      kind: request.kind,
      slot: request.slot,
      reason: request.reason?.slice(0, 256) ?? null,
      elapsedSeconds: integer(persistent.elapsedSeconds),
      activePlanetId: typeof persistent.activePlanetId === "string" ? persistent.activePlanetId : "home",
      entityCount: Array.isArray(persistent.entities) ? persistent.entities.length : 0,
      beltCount: Array.isArray(persistent.belts) ? persistent.belts.length : 0,
      completedTechCount: Array.isArray(persistent.research?.completedTechIds) ? persistent.research.completedTechIds.length : 0,
      structurePoints: integer(persistent.dysonSphere?.structurePoints),
      uploadedWhiteMatrix: integer(persistent.totalProduced?.universe_matrix),
      stateChecksum: serialized.stateChecksum,
      computedStateChecksum: serialized.stateChecksum,
      integrity: "valid",
    };
    if (!authoritativeProof) {
      const response: SaveWorkerResponse = {
        id: request.id,
        bytes: serialized.bytes,
        payloadChecksum: serialized.payloadChecksum,
        ...(payloadSha256 ? { payloadSha256 } : {}),
        byteLength: serialized.byteLength,
        durationMs: Math.max(0, performance.now() - startedAt),
        ...(Number.isSafeInteger(request.sourceStateRevision) ? { sourceStateRevision: request.sourceStateRevision } : {}),
        ...(sourceTransfer ? { sourceStateTransfer: sourceTransfer } : {}),
        summary,
      };
      self.postMessage(response, [serialized.bytes, ...sourceTransferables(request)]);
      return;
    }

    const catalogSeed: AuthoritativeSaveCatalogSeed = {
      mode,
      kind: request.kind,
      slot: request.slot,
      savedAt: request.savedAt,
      stateVersion: summary.stateVersion,
      entityCount: summary.entityCount,
      beltCount: summary.beltCount,
      elapsedSeconds: summary.elapsedSeconds,
      completedTechCount: summary.completedTechCount,
      activePlanetId: summary.activePlanetId,
      structurePoints: summary.structurePoints,
      stateChecksum: serialized.stateChecksum,
      reason: summary.reason,
      settings: catalogSettings(persistent.settings),
    };
    const proofWithoutBinding: Omit<AuthoritativeSavePayloadProof, "bindingSha256"> = {
      integrity: "valid",
      payloadChecksum: serialized.payloadChecksum,
      payloadSha256: payloadSha256!,
      byteLength: serialized.byteLength,
      stateChecksum: serialized.stateChecksum,
    };
    const proof: AuthoritativeSavePayloadProof = {
      ...proofWithoutBinding,
      bindingSha256: await computeAuthoritativeSaveProofBindingSha256(proofWithoutBinding, catalogSeed),
    };
    const response: AuthoritativeSaveSerializationResponse = {
      id: request.id,
      bytes: serialized.bytes,
      ...(sourceTransfer ? { sourceStateTransfer: sourceTransfer.buffer } : {}),
      payloadChecksum: serialized.payloadChecksum,
      ...(payloadSha256 ? { payloadSha256 } : {}),
      byteLength: serialized.byteLength,
      durationMs: Math.max(0, performance.now() - startedAt),
      summary,
      catalogSeed,
      proof,
    };
    self.postMessage(response, [serialized.bytes, ...sourceTransferables(request)]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "后台生成存档失败";
    if (authoritativeProof) {
      const response: AuthoritativeSaveSerializationResponse = {
        id: request.id,
        error: message,
        ...(request.stateTransfer ? { sourceStateTransfer: request.stateTransfer.buffer } : {}),
      };
      self.postMessage(response, sourceTransferables(request));
      return;
    }
    const response: SaveWorkerResponse = {
      id: request.id,
      error: message,
      ...(request.stateTransfer ? { sourceStateTransfer: request.stateTransfer } : {}),
    };
    self.postMessage(response, sourceTransferables(request));
  }
};

export {};
