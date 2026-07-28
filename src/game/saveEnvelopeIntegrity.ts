export type SaveEnvelopeChecksumStatus = "valid" | "missing" | "invalid";

export interface SaveEnvelopeChecksumInspection {
  parsed: Record<string, unknown> | null;
  formatVersion: number | null;
  state: Record<string, unknown> | null;
  recordedChecksum: string | null;
  computedChecksum: string | null;
  status: SaveEnvelopeChecksumStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Save envelope v2 uses FNV-1a over JavaScript UTF-16 code units. */
export function computeSaveStateChecksum(formatVersion: number, state: unknown): string {
  const payload = JSON.stringify({ formatVersion, state });
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function inspectSaveEnvelopeChecksum(raw: string): SaveEnvelopeChecksumInspection {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return { parsed: null, formatVersion: null, state: null, recordedChecksum: null, computedChecksum: null, status: "invalid" };
    }
    const state = isRecord(parsed.state) ? parsed.state : null;
    const formatVersion = typeof parsed.formatVersion === "number" && Number.isFinite(parsed.formatVersion)
      ? Math.floor(parsed.formatVersion)
      : null;
    const recordedChecksum = typeof parsed.checksum === "string" && parsed.checksum.length > 0 ? parsed.checksum : null;
    if (!state || formatVersion === null) {
      return { parsed, formatVersion, state, recordedChecksum, computedChecksum: null, status: recordedChecksum ? "invalid" : "missing" };
    }
    const computedChecksum = computeSaveStateChecksum(formatVersion, state);
    return {
      parsed,
      formatVersion,
      state,
      recordedChecksum,
      computedChecksum,
      status: recordedChecksum === null ? "missing" : recordedChecksum === computedChecksum ? "valid" : "invalid",
    };
  } catch {
    return { parsed: null, formatVersion: null, state: null, recordedChecksum: null, computedChecksum: null, status: "invalid" };
  }
}
