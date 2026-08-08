import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateLeaderboardIntegrity } from "./leaderboard-integrity.mjs";

test("freezes only high-confidence cumulative or time rollback evidence", () => {
  const previous = { version: 46, elapsedSeconds: 100, entities: [{}], totalProduced: { iron_ingot: 1_000 } };
  assert.equal(evaluateLeaderboardIntegrity({ ...previous, elapsedSeconds: 99 }, previous).freeze, true);
  assert.equal(evaluateLeaderboardIntegrity({ ...previous, elapsedSeconds: 101, totalProduced: { iron_ingot: 999 } }, previous).freeze, true);
  assert.equal(evaluateLeaderboardIntegrity({ ...previous, elapsedSeconds: 101, totalProduced: { iron_ingot: 1_001 } }, previous).freeze, false);
});

test("does not apply v46 monotonic assumptions to legacy save versions", () => {
  const result = evaluateLeaderboardIntegrity(
    { version: 24, elapsedSeconds: 120, totalProduced: { universe_matrix: 900 }, entities: [] },
    { version: 24, elapsedSeconds: 100, totalProduced: { universe_matrix: 1_000 }, entities: [] },
  );
  assert.equal(result.freeze, false);
});

test("flags impossible current saves without applying a theoretical production cap", () => {
  const impossible = evaluateLeaderboardIntegrity({ version: 46, elapsedSeconds: 10_000, entities: [], totalProduced: { universe_matrix: 1_000_000_000_000 } });
  assert.equal(impossible.freeze, true);
  assert.equal(impossible.findings[0].code, "EXTREME_PRODUCTION_WITHOUT_ENTITIES");
  const terminal = evaluateLeaderboardIntegrity({ version: 46, elapsedSeconds: 10_000, entities: [{ id: "factory" }], totalProduced: { universe_matrix: Number.MAX_VALUE } });
  assert.equal(terminal.freeze, false);
});
