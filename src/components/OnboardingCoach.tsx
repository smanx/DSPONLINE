import { Check, ChevronRight, GraduationCap, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BASIC_ONBOARDING_EVENT, BASIC_ONBOARDING_STEPS, dismissOnboarding, getCurrentBasicOnboardingStep, getCurrentOnboardingStep, getOnboardingFocusTarget, isBasicOnboardingStepComplete, loadBasicOnboardingProgress, loadOnboardingDismissed, ONBOARDING_STEPS, type OnboardingActionId } from "../game/onboarding";
import type { GameState } from "../game/types";

export function OnboardingCoach({ game, onAction, compact = false }: { game: GameState; onAction: (stepId: OnboardingActionId) => void; compact?: boolean }) {
  const [dismissed, setDismissed] = useState(loadOnboardingDismissed);
  const [completed, setCompleted] = useState(false);
  const [basicProgress, setBasicProgress] = useState(loadBasicOnboardingProgress);
  const basicStep = getCurrentBasicOnboardingStep(basicProgress);
  const progressiveStep = basicStep ? null : getCurrentOnboardingStep(game);
  const step = basicStep ?? progressiveStep;
  const focusTarget = progressiveStep ? getOnboardingFocusTarget(game, progressiveStep) : null;
  const completedCount = BASIC_ONBOARDING_STEPS.filter((candidate) => isBasicOnboardingStepComplete(basicProgress, candidate)).length +
    ONBOARDING_STEPS.filter((candidate) => candidate.complete(game)).length;
  const totalSteps = BASIC_ONBOARDING_STEPS.length + ONBOARDING_STEPS.length;

  useEffect(() => {
    const update = () => setBasicProgress(loadBasicOnboardingProgress());
    window.addEventListener(BASIC_ONBOARDING_EVENT, update);
    return () => window.removeEventListener(BASIC_ONBOARDING_EVENT, update);
  }, []);

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
        <span><small>{completed ? "教学完成" : `${step?.phase ?? "教学"} ${completedCount}/${totalSteps}`}</small><strong>{completed ? "白糖工业链已上线" : step?.title}</strong></span>
        {!completed && step ? <button className="onboarding-coach__compact-action" type="button" onClick={() => onAction(step.id)}>{focusTarget ? "定位" : step.action}<ChevronRight size={14} /></button> : null}
        <button className="onboarding-coach__compact-close" type="button" onClick={() => { dismissOnboarding(); setDismissed(true); }} title="关闭渐进教学" aria-label="关闭启动引导"><X size={14} /></button>
      </aside>
    );
  }
  return (
    <aside className={`onboarding-coach${completed ? " onboarding-coach--complete" : ""}`} aria-live="polite">
      <header><i>{completed ? <Check size={15} /> : <GraduationCap size={15} />}</i><span><small>{completed ? "渐进教学完成" : `${step?.phase ?? "教学"} · 渐进教学 ${completedCount}/${totalSteps}`}</small><strong>{completed ? "白糖工业链已上线" : step?.title}</strong></span><button type="button" onClick={() => { dismissOnboarding(); setDismissed(true); }} title="跳过渐进教学" aria-label="跳过启动引导"><X size={13} /></button></header>
      {!completed && step ? <><p>{basicStep ? (compact ? basicStep.mobileDetail : basicStep.desktopDetail) : progressiveStep?.detail}{focusTarget ? <span>当前卡点 · {focusTarget.reason}</span> : null}</p><footer><i><b style={{ width: `${completedCount / totalSteps * 100}%` }} /></i><button type="button" onClick={() => onAction(step.id)}>{focusTarget ? "定位卡点" : step.action}<ChevronRight size={13} /></button></footer></> : <p>采集、矩阵、跨星物流与戴森云已经形成完整白糖闭环。</p>}
    </aside>
  );
}
