import type { SimulationRuntimeDurableOperationIntent } from "./simulationRuntimeDurableRecovery";

export type SimulationRuntimeDurableDispatchPhase =
  | "created"
  | "stage-retry"
  | "staged"
  | "dispatched"
  | "finalizing"
  | "acknowledged"
  | "complete"
  | "recovery-required";

export interface SimulationRuntimeDurableIntentProof {
  sessionId: string;
  generation: number;
  sequence: number;
  intentSha256: string;
  status: "pending" | "finalized";
  resultStateRevision?: number;
}

export interface SimulationRuntimeDurableDispatchState {
  phase: SimulationRuntimeDurableDispatchPhase;
  intent: SimulationRuntimeDurableOperationIntent;
  stageProof: SimulationRuntimeDurableIntentProof | null;
  resultStateRevision: number | null;
  finalProof: SimulationRuntimeDurableIntentProof | null;
  failure: string | null;
}

function proofMatchesIntent(
  intent: SimulationRuntimeDurableOperationIntent,
  proof: SimulationRuntimeDurableIntentProof,
): boolean {
  return proof.sessionId === intent.sessionId && proof.generation === intent.generation &&
    proof.sequence === intent.sequence && proof.intentSha256 === intent.intentSha256;
}

function sameProof(
  left: SimulationRuntimeDurableIntentProof | null,
  right: SimulationRuntimeDurableIntentProof,
): boolean {
  return Boolean(left) && left!.sessionId === right.sessionId && left!.generation === right.generation &&
    left!.sequence === right.sequence && left!.intentSha256 === right.intentSha256 &&
    left!.status === right.status && left!.resultStateRevision === right.resultStateRevision;
}

export function createSimulationRuntimeDurableDispatch(
  intent: SimulationRuntimeDurableOperationIntent,
): SimulationRuntimeDurableDispatchState {
  return {
    phase: "created",
    intent,
    stageProof: null,
    resultStateRevision: null,
    finalProof: null,
    failure: null,
  };
}

/** Apply only after the IDB WAL transaction and exact read-back have succeeded. */
export function markSimulationRuntimeDurableIntentStaged(
  state: SimulationRuntimeDurableDispatchState,
  proof: SimulationRuntimeDurableIntentProof,
): SimulationRuntimeDurableDispatchState {
  if (state.phase === "staged" && sameProof(state.stageProof, proof)) return state;
  if (state.phase !== "created" && state.phase !== "stage-retry") throw new Error(`durable intent cannot stage from ${state.phase}`);
  if (!proofMatchesIntent(state.intent, proof) || proof.status !== "pending" || proof.resultStateRevision !== undefined) {
    throw new Error("durable stage proof does not match intent");
  }
  return { ...state, phase: "staged", stageProof: proof, failure: null };
}

/** A failed WAL write retains the exact operation and must not contact Worker. */
export function markSimulationRuntimeDurableStageFailed(
  state: SimulationRuntimeDurableDispatchState,
  failure: string,
): SimulationRuntimeDurableDispatchState {
  if (state.phase !== "created" && state.phase !== "stage-retry") throw new Error(`durable stage cannot fail from ${state.phase}`);
  return { ...state, phase: "stage-retry", failure };
}

/** This transition is the sole gate that authorizes worker.postMessage. */
export function markSimulationRuntimeDurableWorkerDispatched(
  state: SimulationRuntimeDurableDispatchState,
): SimulationRuntimeDurableDispatchState {
  if (state.phase !== "staged" || !state.stageProof) throw new Error("Worker dispatch requires a read-back-verified WAL intent");
  return { ...state, phase: "dispatched" };
}

/** Worker output remains invisible to the UI until its revision is finalized. */
export function markSimulationRuntimeDurableWorkerResult(
  state: SimulationRuntimeDurableDispatchState,
  resultStateRevision: number,
): SimulationRuntimeDurableDispatchState {
  if (state.phase === "finalizing" && state.resultStateRevision === resultStateRevision) return state;
  if (state.phase !== "dispatched") throw new Error(`durable Worker result cannot arrive from ${state.phase}`);
  if (!Number.isSafeInteger(resultStateRevision) || resultStateRevision < state.intent.baseStateRevision) {
    throw new Error("durable Worker result revision is invalid");
  }
  return { ...state, phase: "finalizing", resultStateRevision };
}

/** Apply only after finalize CAS and exact read-back; this unlocks one UI ACK. */
export function markSimulationRuntimeDurableIntentFinalized(
  state: SimulationRuntimeDurableDispatchState,
  proof: SimulationRuntimeDurableIntentProof,
): SimulationRuntimeDurableDispatchState {
  if (state.phase === "acknowledged" && sameProof(state.finalProof, proof)) return state;
  if (state.phase !== "finalizing" || state.resultStateRevision === null) throw new Error(`durable intent cannot finalize from ${state.phase}`);
  if (!proofMatchesIntent(state.intent, proof) || proof.status !== "finalized" ||
    proof.resultStateRevision !== state.resultStateRevision) throw new Error("durable finalize proof does not match Worker result");
  return { ...state, phase: "acknowledged", finalProof: proof, failure: null };
}

/**
 * Once a staged request may have reached Worker, retrying it against that same
 * volatile runtime could double-apply time or a command. Rebuild from the
 * durable checkpoint+journal instead.
 */
export function requireSimulationRuntimeDurableRecovery(
  state: SimulationRuntimeDurableDispatchState,
  failure: string,
): SimulationRuntimeDurableDispatchState {
  if (state.phase !== "staged" && state.phase !== "dispatched" && state.phase !== "finalizing") {
    throw new Error(`durable recovery is not valid from ${state.phase}`);
  }
  return { ...state, phase: "recovery-required", failure };
}

/** Return true exactly once, after finalize durability and never before it. */
export function consumeSimulationRuntimeDurableUiAcknowledgement(
  state: SimulationRuntimeDurableDispatchState,
): { state: SimulationRuntimeDurableDispatchState; acknowledge: boolean } {
  if (state.phase === "complete") return { state, acknowledge: false };
  if (state.phase !== "acknowledged") throw new Error(`UI acknowledgement is blocked in ${state.phase}`);
  return { state: { ...state, phase: "complete" }, acknowledge: true };
}
