import { Check, ChevronRight, GraduationCap, X } from "lucide-react";
import { useEffect, useState } from "react";
import { dismissOnboarding, getCurrentOnboardingStep, getOnboardingFocusTarget, loadOnboardingDismissed, ONBOARDING_STEPS, type OnboardingStepId } from "../game/onboarding";
import type { GameState } from "../game/types";

export function OnboardingCoach({ game, onAction, compact = false }: { game: GameState; onAction: (stepId: OnboardingStepId) => void; compact?: boolean }) {
  const [dismissed, setDismissed] = useState(loadOnboardingDismissed);
  const [completed, setCompleted] = useState(false);
  const step = getCurrentOnboardingStep(game);
  const focusTarget = step ? getOnboardingFocusTarget(game, step) : null;
  const completedCount = ONBOARDING_STEPS.filter((candidate) => candidate.complete(game)).length;

  useEffect(() => {
    if (!step && !dismissed) {
      setCompleted(true);
      const timer = window.setTimeout(() => {
        dismissOnboarding();
        setDismissed(true);
      }, 2800);
      return () => window.clearTimeout(timer);
    }
  }, [dismissed, step]);

  if (dismissed) return null;
  if (compact) {
    return (
      <aside className={`onboarding-coach onboarding-coach--compact${completed ? " onboarding-coach--complete" : ""}`} aria-live="polite">
        <i>{completed ? <Check size={16} /> : <GraduationCap size={16} />}</i>
        <span><small>{completed ? "教学完成" : `${step?.phase ?? "教学"} ${completedCount}/${ONBOARDING_STEPS.length}`}</small><strong>{completed ? "白糖工业链已上线" : step?.title}</strong></span>
        {!completed && step ? <button className="onboarding-coach__compact-action" type="button" onClick={() => onAction(step.id)}>{focusTarget ? "定位" : step.action}<ChevronRight size={14} /></button> : null}
        <button className="onboarding-coach__compact-close" type="button" onClick={() => { dismissOnboarding(); setDismissed(true); }} title="关闭渐进教学" aria-label="关闭启动引导"><X size={14} /></button>
      </aside>
    );
  }
  return (
    <aside className={`onboarding-coach${completed ? " onboarding-coach--complete" : ""}`} aria-live="polite">
      <header><i>{completed ? <Check size={15} /> : <GraduationCap size={15} />}</i><span><small>{completed ? "渐进教学完成" : `${step?.phase ?? "教学"} · 渐进教学 ${completedCount}/${ONBOARDING_STEPS.length}`}</small><strong>{completed ? "白糖工业链已上线" : step?.title}</strong></span><button type="button" onClick={() => { dismissOnboarding(); setDismissed(true); }} title="关闭渐进教学" aria-label="关闭启动引导"><X size={13} /></button></header>
      {!completed && step ? <><p>{step.detail}{focusTarget ? <span>当前卡点 · {focusTarget.reason}</span> : null}</p><footer><i><b style={{ width: `${completedCount / ONBOARDING_STEPS.length * 100}%` }} /></i><button type="button" onClick={() => onAction(step.id)}>{focusTarget ? "定位卡点" : step.action}<ChevronRight size={13} /></button></footer></> : <p>采集、矩阵、跨星物流与戴森云已经形成完整白糖闭环。</p>}
    </aside>
  );
}
