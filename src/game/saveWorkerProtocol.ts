import type { ContentPackRegistry } from "./contentPacks";
import type { SimulationStateTransfer } from "./simulationRuntimeProtocol";

export interface SaveWorkerRequest {
  id: number;
  formatVersion: number;
  savedAt: number;
  kind: "primary" | "slot" | "snapshot";
  slot: "main" | 1 | 2 | 3;
  reason?: string;
  state?: unknown;
  /** Authoritative runtime checkpoint; transferred without cloning GameState on the UI thread. */
  stateTransfer?: SimulationStateTransfer;
  sourceStateRevision?: number;
  contentPackRegistry: ContentPackRegistry;
  includePayloadSha256?: boolean;
}

export interface SaveWorkerSummary {
  stateVersion: number;
  savedAt: number;
  elapsedSeconds: number;
  activePlanetId: string;
  entityCount: number;
  completedTechCount: number;
  structurePoints: number;
  uploadedWhiteMatrix: number;
  stateChecksum: string;
  computedStateChecksum: string;
  integrity: "valid";
}

export interface SaveWorkerResponse {
  id: number;
  bytes?: ArrayBuffer;
  payloadChecksum?: string;
  payloadSha256?: string;
  byteLength?: number;
  durationMs?: number;
  sourceStateRevision?: number;
  /** Returned so the coordinator can transfer the same owned buffer to recovery. */
  sourceStateTransfer?: SimulationStateTransfer;
  summary?: SaveWorkerSummary;
  error?: string;
}
