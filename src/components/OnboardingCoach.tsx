import { Check, ChevronRight, GraduationCap, X } from "lucide-react";
import { useEffect, useState } from "react";
import { dismissOnboarding, getCurrentOnboardingStep, loadOnboardingDismissed, ONBOARDING_STEPS, type OnboardingStepId } from "../game/onboarding";
import type { GameState } from "../game/types";

export function OnboardingCoach({ game, onAction }: { game: GameState; onAction: (stepId: OnboardingStepId) => void }) {
  const [dismissed, setDismissed] = useState(loadOnboardingDismissed);
  const [completed, setCompleted] = useState(false);
  const step = getCurrentOnboardingStep(game);
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
  return (
    <aside className={`onboarding-coach${completed ? " onboarding-coach--complete" : ""}`} aria-live="polite">
      <header><i>{completed ? <Check size={15} /> : <GraduationCap size={15} />}</i><span><small>启动引导 {completedCount}/{ONBOARDING_STEPS.length}</small><strong>{completed ? "基础工厂已上线" : step?.title}</strong></span><button type="button" onClick={() => { dismissOnboarding(); setDismissed(true); }} title="关闭启动引导" aria-label="关闭启动引导"><X size={13} /></button></header>
      {!completed && step ? <><p>{step.detail}</p><footer><i><b style={{ width: `${completedCount / ONBOARDING_STEPS.length * 100}%` }} /></i><button type="button" onClick={() => onAction(step.id)}>{step.action}<ChevronRight size={13} /></button></footer></> : <p>采集、加工、物流与科研已经形成基础闭环。</p>}
    </aside>
  );
}
