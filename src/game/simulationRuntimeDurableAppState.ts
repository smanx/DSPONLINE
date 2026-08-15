import { validateContentPackRuntimeSnapshot, type ContentPackRuntimeSnapshot } from "./contentPacks";
import type { MulticoreSimulationOptions } from "./multicoreSimulation";
import type { SimulationRuntimeRecoveryBaseIdentity } from "./simulationRuntimeRecovery";
import type {
  SimulationRuntimeDurableOperationIntent,
  SimulationRuntimeDurablePrimaryCheckpoint,
} from "./simulationRuntimeDurableRecovery";
import type { SimulationRuntimeRecoveryDurableProof } from "./simulationRuntimeRecoveryStore";
import type { SimulationCommandPatch } from "./simulationRuntimeProtocol";

export type SimulationRuntimeDurableUnsignedIntent = Omit<SimulationRuntimeDurableOperationIntent, "intentSha256">;

export interface SimulationRuntimeDurableAppHead {
  baseIdentity: SimulationRuntimeRecoveryBaseIdentity;
  sessionId: string;
  generation: number;
  sequence: number;
  stateRevision: number;
  registryFingerprint: string;
}

export interface SimulationRuntimeDurableOperationInput {
  command: SimulationCommandPatch | null;
  simulationSeconds: number;
  wallSeconds: number;
  multicore: MulticoreSimulationOptions | undefined;
  approximate: boolean;
  registry: ContentPackRuntimeSnapshot;
  committedAtMs: number;
}

function assertSafeNonnegative(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} 无效`);
}

function validBaseIdentity(value: SimulationRuntimeRecoveryBaseIdentity): boolean {
  return (value.mode === "normal" || value.mode === "speedrun") && Number.isFinite(value.savedAt) && value.savedAt >= 0 &&
    typeof value.checksum === "string" && value.checksum.length > 0 && value.checksum.length <= 256 &&
    Number.isSafeInteger(value.revision) && value.revision >= 0;
}

export function createSimulationRuntimeDurablePrimaryCheckpoint(input: {
  baseIdentity: SimulationRuntimeRecoveryBaseIdentity;
  sessionId: string;
  stateRevision: number;
  registry: ContentPackRuntimeSnapshot;
  committedAtMs: number;
}): SimulationRuntimeDurablePrimaryCheckpoint {
  assertSafeNonnegative(input.stateRevision, "runtime recovery state revision");
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(input.sessionId)) throw new Error("runtime recovery session id 无效");
  if (!validBaseIdentity(input.baseIdentity)) throw new Error("runtime recovery base identity 无效");
  if (!validateContentPackRuntimeSnapshot(input.registry) || input.registry.fingerprint.length === 0) {
    throw new Error("runtime recovery registry 无效");
  }
  if (!Number.isFinite(input.committedAtMs) || input.committedAtMs < 0) throw new Error("runtime recovery commit time 无效");
  return {
    schemaVersion: 1,
    sessionId: input.sessionId,
    generation: 1,
    lastSequence: 0,
    stateRevision: input.stateRevision,
    registryFingerprint: input.registry.fingerprint,
    registry: input.registry,
    committedAtMs: input.committedAtMs,
    baseIdentity: input.baseIdentity,
    source: "primary",
    primaryStateChecksum: input.baseIdentity.checksum,
    primaryRevision: input.baseIdentity.revision,
  };
}

export function createSimulationRuntimeDurableAppHead(
  checkpoint: SimulationRuntimeDurablePrimaryCheckpoint,
  proof: SimulationRuntimeRecoveryDurableProof,
): SimulationRuntimeDurableAppHead {
  if (proof.sessionId !== checkpoint.sessionId || proof.generation !== checkpoint.generation ||
    proof.sequence !== checkpoint.lastSequence || proof.stateRevision !== checkpoint.stateRevision ||
    proof.checkpointSource !== "primary" || proof.primaryStateChecksum !== checkpoint.primaryStateChecksum ||
    proof.primaryRevision !== checkpoint.primaryRevision || proof.pending || !proof.finalized) {
    throw new Error("runtime recovery initialize proof 与主存档检查点不匹配");
  }
  return {
    baseIdentity: checkpoint.baseIdentity,
    sessionId: proof.sessionId,
    generation: proof.generation,
    sequence: proof.sequence,
    stateRevision: proof.stateRevision,
    registryFingerprint: checkpoint.registryFingerprint,
  };
}

export function createSimulationRuntimeDurableUnsignedIntent(
  head: SimulationRuntimeDurableAppHead,
  operation: SimulationRuntimeDurableOperationInput,
): SimulationRuntimeDurableUnsignedIntent {
  if (operation.registry.fingerprint !== head.registryFingerprint) {
    throw new Error("runtime recovery registry 与当前 head 不匹配");
  }
  if (!Number.isFinite(operation.simulationSeconds) || operation.simulationSeconds < 0 ||
    !Number.isFinite(operation.wallSeconds) || operation.wallSeconds < 0) {
    throw new Error("runtime recovery operation 时间无效");
  }
  return {
    schemaVersion: 1,
    sessionId: head.sessionId,
    generation: head.generation,
    sequence: head.sequence + 1,
    baseStateRevision: head.stateRevision,
    command: operation.command,
    simulationSeconds: operation.simulationSeconds,
    wallSeconds: operation.wallSeconds,
    multicore: operation.multicore,
    approximate: operation.approximate,
    registry: operation.registry,
    committedAtMs: operation.committedAtMs,
  };
}

export function advanceSimulationRuntimeDurableAppHead(
  head: SimulationRuntimeDurableAppHead,
  intent: SimulationRuntimeDurableOperationIntent,
  proof: SimulationRuntimeRecoveryDurableProof,
): SimulationRuntimeDurableAppHead {
  const bindingMatches = proof.checkpointSource === "primary"
    ? proof.primaryStateChecksum === head.baseIdentity.checksum && proof.primaryRevision === head.baseIdentity.revision
    : proof.checkpointSource === "transfer";
  if (intent.sessionId !== head.sessionId || intent.generation !== head.generation ||
    intent.sequence !== head.sequence + 1 || intent.baseStateRevision !== head.stateRevision ||
    proof.sessionId !== intent.sessionId || proof.generation !== intent.generation ||
    proof.sequence !== intent.sequence || proof.intentSha256 !== intent.intentSha256 ||
    !bindingMatches ||
    proof.pending || !proof.finalized || proof.resultStateRevision === undefined ||
    proof.stateRevision !== proof.resultStateRevision) {
    throw new Error("runtime recovery finalize proof 与 staged intent 不匹配");
  }
  return {
    ...head,
    sequence: proof.sequence,
    stateRevision: proof.resultStateRevision,
    registryFingerprint: intent.registry.fingerprint,
  };
}
