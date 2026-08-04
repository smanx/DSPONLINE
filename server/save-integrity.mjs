export function computeSaveStateChecksum(formatVersion, state) {
  const payload = JSON.stringify({ formatVersion, state });
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function inspectSavePayloadIntegrity(payload) {
  try {
    const parsed = JSON.parse(payload);
    const formatVersion = Number.isInteger(parsed?.formatVersion) ? parsed.formatVersion : null;
    const state = parsed?.state && typeof parsed.state === "object" && !Array.isArray(parsed.state) ? parsed.state : null;
    const recordedChecksum = typeof parsed?.checksum === "string" ? parsed.checksum : null;
    const computedChecksum = formatVersion !== null && state ? computeSaveStateChecksum(formatVersion, state) : null;
    return {
      parsed,
      formatVersion,
      state,
      recordedChecksum,
      computedChecksum,
      valid: Boolean(state && formatVersion !== null && /^[a-f0-9]{8}$/i.test(recordedChecksum ?? "") && recordedChecksum === computedChecksum),
    };
  } catch {
    return { parsed: null, formatVersion: null, state: null, recordedChecksum: null, computedChecksum: null, valid: false };
  }
}
