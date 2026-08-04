export type SaveWorkspaceTab = string;

/**
 * Save summaries are expensive because they inspect every local slot and snapshot.
 * Keep the periodic refresh limited to the workspace where those summaries are visible.
 */
export function shouldRefreshSaveSummaries(operationsOpen: boolean, operationsTab: SaveWorkspaceTab): boolean {
  return operationsOpen && operationsTab === "saves";
}

export function getSaveSummaryRefreshIntervalMs(coarsePointer: boolean): number {
  return coarsePointer ? 30_000 : 5_000;
}
