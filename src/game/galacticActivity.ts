import type { CloudPublicStatus } from "./cloud";
import type { ActivityMaterialId, GameState } from "./types";

export type GalacticActivityPublicStatus = NonNullable<CloudPublicStatus["activity"]>;

const MATERIAL_IDS: ActivityMaterialId[] = ["universe_matrix", "solar_sail", "small_carrier_rocket", "antimatter_fuel_rod"];

function amountRecord(value?: Partial<Record<ActivityMaterialId, number>>): Record<ActivityMaterialId, number> {
  return Object.fromEntries(MATERIAL_IDS.map((itemId) => [
    itemId,
    Math.max(0, Math.floor(value?.[itemId] ?? 0)),
  ])) as Record<ActivityMaterialId, number>;
}

export function synchronizeGalacticActivity(
  state: GameState,
  status: GalacticActivityPublicStatus,
  participantId: string,
): GameState {
  if (!status.enabled || !status.id || !status.revision || !Number.isFinite(status.serverNow) ||
    !Number.isFinite(status.startsAtMs) || !Number.isFinite(status.endsAtMs) || !status.personalTargets || !status.globalTargets) return state;
  const serverNow = Math.floor(status.serverNow);
  const startsAtMs = Math.floor(status.startsAtMs!);
  const endsAtMs = Math.floor(status.endsAtMs!);
  const previous = state.endgame.constructionActivity;
  const newActivity = previous.activityId !== status.id;
  const activityClockMs = newActivity
    ? Math.max(0, serverNow)
    : Math.max(previous.activityClockMs, serverNow);
  return {
    ...state,
    endgame: {
      ...state.endgame,
      constructionActivity: {
        activityId: status.id,
        participantId: newActivity ? participantId : previous.participantId ?? participantId,
        configRevision: status.revision,
        startsAtMs: Math.max(0, startsAtMs),
        endsAtMs: Math.max(0, endsAtMs),
        serverTimeAnchorMs: Math.max(previous.serverTimeAnchorMs, serverNow),
        activityClockMs,
        personalTargets: amountRecord(status.personalTargets),
        globalTargets: amountRecord(status.globalTargets),
        personalDelivered: newActivity ? amountRecord() : amountRecord(previous.personalDelivered),
        pendingBatches: newActivity ? {} : { ...previous.pendingBatches },
        nextBatchSequence: newActivity ? 0 : previous.nextBatchSequence,
      },
    },
  };
}

export function activityOverallProgress(values: Record<ActivityMaterialId, number>, targets: Record<ActivityMaterialId, number>): number {
  return MATERIAL_IDS.reduce((sum, itemId) => sum + Math.min(1, values[itemId] / Math.max(1, targets[itemId])), 0) / MATERIAL_IDS.length;
}

export function activityCountdownLabel(status: GalacticActivityPublicStatus, now: number): string {
  if (!status.enabled || !status.startsAtMs || !status.endsAtMs) return "活动未开放";
  const target = now < status.startsAtMs ? status.startsAtMs : status.endsAtMs;
  const remaining = Math.max(0, target - now);
  const totalSeconds = Math.floor(remaining / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor(totalSeconds % 86_400 / 3_600);
  const minutes = Math.floor(totalSeconds % 3_600 / 60);
  const seconds = totalSeconds % 60;
  if (status.status === "ended") return "活动已结束";
  const prefix = status.status === "scheduled" ? "距开始" : "剩余";
  return `${prefix} ${days}天 ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
