export const TUTORIAL_CONTENT_REVISION = "2026-08-14-r1";
export const TUTORIAL_PROGRESS_KEY = `dspidle:tutorial-progress:${TUTORIAL_CONTENT_REVISION}`;

const LEGACY_TUTORIAL_PROGRESS_KEYS = ["dspidle:tutorial-progress:1.0.15"] as const;

function parseProgress(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((id): id is string => typeof id === "string"))]
      : null;
  } catch {
    return null;
  }
}

/**
 * Tutorial progress follows content revisions, not application versions.
 * A legacy key is copied only when the current revision does not exist, so
 * rerunning the migration can never overwrite newer player progress.
 */
export function readTutorialProgress(storage: Pick<Storage, "getItem" | "setItem">): Set<string> {
  const current = parseProgress(storage.getItem(TUTORIAL_PROGRESS_KEY));
  if (current) return new Set(current);
  for (const legacyKey of LEGACY_TUTORIAL_PROGRESS_KEYS) {
    const legacy = parseProgress(storage.getItem(legacyKey));
    if (!legacy) continue;
    storage.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify(legacy));
    return new Set(legacy);
  }
  return new Set();
}

export function writeTutorialProgress(
  storage: Pick<Storage, "setItem">,
  completed: Iterable<string>,
): void {
  storage.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify([...new Set(completed)]));
}
