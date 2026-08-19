export interface TimedPeriodicProgressSample {
  atMs: number;
  aria: number;
  text: number;
  fill: number;
}

export type PeriodicProgressValidationIssueCode =
  | "invalid-sample"
  | "non-monotonic-clock"
  | "aria-text-mismatch"
  | "aria-fill-mismatch"
  | "non-wrap-backstep"
  | "phase-mismatch"
  | "insufficient-transitions"
  | "missing-wrap";

export interface PeriodicProgressValidationIssue {
  code: PeriodicProgressValidationIssueCode;
  sampleIndex: number;
  detail: string;
}

export interface PeriodicProgressValidationResult {
  issues: PeriodicProgressValidationIssue[];
  transitionCount: number;
  wrapCount: number;
}

export interface PeriodicProgressValidationOptions {
  cyclesPerSecond: number;
  refreshIntervalMs: number;
  minimumTransitions?: number;
  minimumWraps?: number;
  ariaFillTolerance?: number;
  authorityPublicationIntervalMs?: number;
}

/**
 * Validates a modulo-one progress display from timestamps captured in the page.
 *
 * A visible delta is unfolded by the number of complete cycles implied by the
 * measured elapsed time. A sparse authority may legitimately publish progress
 * computed during its known publication window, so that window is part of the
 * upper time bound as well. This makes a delayed 89 -> 59 sample a forward move
 * only when some whole-cycle unfolding fits those clocks; a short, impossible
 * drop remains an illegal backstep. No drop-size threshold is involved.
 */
export function validateTimedPeriodicProgress(
  samples: readonly TimedPeriodicProgressSample[],
  options: PeriodicProgressValidationOptions,
): PeriodicProgressValidationResult {
  const issues: PeriodicProgressValidationIssue[] = [];
  const cyclesPerSecond = options.cyclesPerSecond;
  const refreshIntervalMs = options.refreshIntervalMs;
  const ariaFillTolerance = options.ariaFillTolerance ?? 1.1;
  const authorityPublicationIntervalMs = options.authorityPublicationIntervalMs ?? 0;
  const minimumTransitions = options.minimumTransitions ?? 1;
  const minimumWraps = options.minimumWraps ?? 1;

  if (!Number.isFinite(cyclesPerSecond) || cyclesPerSecond <= 0 ||
    !Number.isFinite(refreshIntervalMs) || refreshIntervalMs <= 0 ||
    !Number.isFinite(ariaFillTolerance) || ariaFillTolerance < 0 ||
    !Number.isFinite(authorityPublicationIntervalMs) || authorityPublicationIntervalMs < 0) {
    return {
      issues: [{ code: "invalid-sample", sampleIndex: 0, detail: "周期速率、刷新周期与显示容差必须是有效正数。" }],
      transitionCount: 0,
      wrapCount: 0,
    };
  }

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (![sample.atMs, sample.aria, sample.text, sample.fill].every(Number.isFinite) ||
      sample.aria < 0 || sample.aria > 100 || sample.text < 0 || sample.text > 100 ||
      sample.fill < 0 || sample.fill > 100) {
      issues.push({ code: "invalid-sample", sampleIndex: index, detail: `无效进度样本：${JSON.stringify(sample)}` });
      continue;
    }
    if (index > 0 && sample.atMs < samples[index - 1].atMs) {
      issues.push({ code: "non-monotonic-clock", sampleIndex: index, detail: "performance.now 时间戳发生倒退。" });
    }
    if (sample.text !== sample.aria) {
      issues.push({ code: "aria-text-mismatch", sampleIndex: index, detail: `aria=${sample.aria}，text=${sample.text}` });
    }
    if (Math.abs(sample.fill - sample.aria) > ariaFillTolerance) {
      issues.push({ code: "aria-fill-mismatch", sampleIndex: index, detail: `aria=${sample.aria}，fill=${sample.fill}` });
    }
  }

  const distinct: Array<{ sample: TimedPeriodicProgressSample; index: number }> = [];
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (![sample.atMs, sample.aria, sample.text, sample.fill].every(Number.isFinite)) continue;
    const previous = distinct.at(-1)?.sample;
    if (!previous || Math.abs(sample.fill - previous.fill) > 1e-6 || sample.aria !== previous.aria || sample.text !== previous.text) {
      distinct.push({ sample, index });
    }
  }

  let wrapCount = 0;
  let transitionCount = 0;
  const percentPerMillisecond = cyclesPerSecond * 100 / 1_000;
  // One refresh can separate the clock tick from the React commit at either
  // endpoint, so two refresh windows bound timestamp-to-render uncertainty.
  const phaseTolerance = ariaFillTolerance + percentPerMillisecond * refreshIntervalMs * 2;
  for (let index = 1; index < distinct.length; index += 1) {
    const previous = distinct[index - 1].sample;
    const current = distinct[index].sample;
    const elapsedMs = current.atMs - previous.atMs;
    if (elapsedMs <= 0) continue;
    transitionCount += 1;
    const visibleAdvance = current.fill - previous.fill;
    const expectedAdvance = elapsedMs * percentPerMillisecond;
    const minimumPlausibleAdvance = Math.max(0, expectedAdvance - phaseTolerance);
    const maximumPlausibleAdvance = expectedAdvance + phaseTolerance +
      percentPerMillisecond * authorityPublicationIntervalMs;
    const firstCandidateWrap = visibleAdvance < -1e-6 ? 1 : 0;
    const lastCandidateWrap = Math.max(
      firstCandidateWrap,
      Math.ceil((maximumPlausibleAdvance - visibleAdvance) / 100),
    );
    let inferredWraps: number | null = null;
    let smallestPhaseError = Number.POSITIVE_INFINITY;
    for (let candidateWraps = firstCandidateWrap; candidateWraps <= lastCandidateWrap; candidateWraps += 1) {
      const unfoldedAdvance = visibleAdvance + candidateWraps * 100;
      if (unfoldedAdvance + 1e-6 < minimumPlausibleAdvance || unfoldedAdvance - 1e-6 > maximumPlausibleAdvance) continue;
      const phaseError = Math.abs(unfoldedAdvance - expectedAdvance);
      if (phaseError < smallestPhaseError) {
        inferredWraps = candidateWraps;
        smallestPhaseError = phaseError;
      }
    }

    if (visibleAdvance < -1e-6 && inferredWraps === null) {
      issues.push({
        code: "non-wrap-backstep",
        sampleIndex: distinct[index].index,
        detail: `在视觉与权威时钟范围内无法回绕，却从 ${previous.fill.toFixed(3)} 倒退到 ${current.fill.toFixed(3)}（${elapsedMs.toFixed(1)} ms）。`,
      });
    }
    if (inferredWraps === null) {
      issues.push({
        code: "phase-mismatch",
        sampleIndex: distinct[index].index,
        detail: `可见推进 ${visibleAdvance.toFixed(3)}，实际间隔 ${elapsedMs.toFixed(1)} ms，无法落入 ${minimumPlausibleAdvance.toFixed(3)}..${maximumPlausibleAdvance.toFixed(3)} 的前向区间。`,
      });
    } else {
      wrapCount += inferredWraps;
    }
  }

  if (transitionCount < minimumTransitions) {
    issues.push({ code: "insufficient-transitions", sampleIndex: Math.max(0, samples.length - 1), detail: `仅捕获 ${transitionCount} 次可见变化，要求至少 ${minimumTransitions} 次。` });
  }
  if (wrapCount < minimumWraps) {
    issues.push({ code: "missing-wrap", sampleIndex: Math.max(0, samples.length - 1), detail: `仅确认 ${wrapCount} 次自然回绕，要求至少 ${minimumWraps} 次。` });
  }

  return { issues, transitionCount, wrapCount };
}
