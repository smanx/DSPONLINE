export const LEADERBOARD_INTEGRITY_VERSION = "leaderboard-integrity-v1";

function finiteNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function productionRecord(state) {
  return state?.totalProduced && typeof state.totalProduced === "object" && !Array.isArray(state.totalProduced)
    ? state.totalProduced
    : {};
}

function elapsed(state) {
  return finiteNonNegativeNumber(state?.elapsedSeconds) ? state.elapsedSeconds : 0;
}

export function evaluateLeaderboardIntegrity(currentState, previousState = null) {
  const findings = [];
  const currentProduced = productionRecord(currentState);
  for (const [itemId, amount] of Object.entries(currentProduced)) {
    if (!finiteNonNegativeNumber(amount)) findings.push({ code: "CUMULATIVE_VALUE_INVALID", field: itemId, severity: "freeze" });
  }
  const comparableCurrentStates = currentState?.version === 46 && previousState?.version === 46;
  if (comparableCurrentStates && elapsed(currentState) + 0.000001 < elapsed(previousState)) {
    findings.push({ code: "SIMULATION_TIME_ROLLBACK", severity: "freeze" });
  }
  if (comparableCurrentStates) {
    const previousProduced = productionRecord(previousState);
    for (const [itemId, before] of Object.entries(previousProduced)) {
      const after = currentProduced[itemId];
      if (finiteNonNegativeNumber(before) && finiteNonNegativeNumber(after) && after + 0.000001 < before) {
        findings.push({ code: "CUMULATIVE_PRODUCTION_ROLLBACK", field: itemId, severity: "freeze" });
      }
    }
  }
  // Only current v46 saves are eligible for this high-confidence structural
  // check. Older fixtures and legacy imports can legitimately lack the modern
  // entity model and are reviewed by the existing compatibility path.
  if (currentState?.version === 46 && Array.isArray(currentState.entities) && currentState.entities.length === 0) {
    const cumulative = Object.values(currentProduced).reduce((sum, amount) => finiteNonNegativeNumber(amount) ? Math.min(Number.MAX_VALUE, sum + amount) : sum, 0);
    if (cumulative >= 1_000_000_000_000) findings.push({ code: "EXTREME_PRODUCTION_WITHOUT_ENTITIES", severity: "freeze" });
  }
  const unique = [...new Map(findings.map((finding) => [`${finding.code}:${finding.field ?? ""}`, finding])).values()];
  return {
    version: LEADERBOARD_INTEGRITY_VERSION,
    freeze: unique.some((finding) => finding.severity === "freeze"),
    findings: unique,
  };
}
