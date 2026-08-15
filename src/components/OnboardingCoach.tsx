import { Check, ChevronRight, GraduationCap, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BASIC_ONBOARDING_EVENT, BASIC_ONBOARDING_STEPS, dismissOnboarding, getCurrentBasicOnboardingStep, getOnboardingFocusTarget, isBasicOnboardingStepComplete, loadBasicOnboardingProgress, loadOnboardingDismissed, ONBOARDING_STEPS, type OnboardingActionId } from "../game/onboarding";
import type { GameState } from "../game/types";

interface OnboardingCoachProps {
  game: GameState;
  onAction: (stepId: OnboardingActionId) => void;
  compact?: boolean;
}

interface ActiveOnboardingCoachProps extends OnboardingCoachProps {
  onDismiss: () => void;
}

export function OnboardingCoach(props: OnboardingCoachProps) {
  const [dismissed, setDismissed] = useState(loadOnboardingDismissed);
  const handleDismiss = useCallback(() => {
    dismissOnboarding();
    setDismissed(true);
  }, []);

  return dismissed ? null : <ActiveOnboardingCoach {...props} onDismiss={handleDismiss} />;
}

function ActiveOnboardingCoach({ game, onAction, compact = false, onDismiss }: ActiveOnboardingCoachProps) {
  const [completed, setCompleted] = useState(false);
  const [basicProgress, setBasicProgress] = useState(loadBasicOnboardingProgress);
  const manualMiningComplete = game.manualMined >= 1;
  const beltComplete = game.belts.length > 0;
  const researchComplete = game.research.completedTechIds.length > 0 || Boolean(game.research.selectedTechId);
  const blueMatrixComplete = (game.totalProduced.electromagnetic_matrix ?? 0) >= 1;
  const refinedOilComplete = (game.totalProduced.refined_oil ?? 0) >= 1;
  const plasticComplete = (game.totalProduced.plastic ?? 0) >= 1;
  const redMatrixComplete = (game.totalProduced.energy_matrix ?? 0) >= 1;
  const yellowMatrixComplete = (game.totalProduced.structure_matrix ?? 0) >= 1;
  const dysonSwarmComplete = game.dysonSwarm.totalLaunched >= 1;
  const criticalPhotonComplete = (game.totalProduced.critical_photon ?? 0) >= 1;
  const whiteMatrixComplete = (game.totalProduced.universe_matrix ?? 0) >= 1;
  const { basicStep, progressiveStep, completedCount } = useMemo(() => {
    const nextBasicStep = getCurrentBasicOnboardingStep(basicProgress);
    const progressiveCompletion = ONBOARDING_STEPS.map((candidate) => candidate.complete(game));
    return {
      basicStep: nextBasicStep,
      progressiveStep: nextBasicStep
        ? null
        : ONBOARDING_STEPS.find((_candidate, index) => !progressiveCompletion[index]) ?? null,
      completedCount: BASIC_ONBOARDING_STEPS.filter((candidate) => isBasicOnboardingStepComplete(basicProgress, candidate)).length +
        progressiveCompletion.filter(Boolean).length,
    };
  }, [
    basicProgress,
    beltComplete,
    blueMatrixComplete,
    criticalPhotonComplete,
    dysonSwarmComplete,
    game.entities,
    manualMiningComplete,
    plasticComplete,
    redMatrixComplete,
    refinedOilComplete,
    researchComplete,
    whiteMatrixComplete,
    yellowMatrixComplete,
  ]);
  const step = basicStep ?? progressiveStep;
  const focusTarget = useMemo(
    () => progressiveStep ? getOnboardingFocusTarget(game, progressiveStep) : null,
    [game, progressiveStep],
  );
  const totalSteps = BASIC_ONBOARDING_STEPS.length + ONBOARDING_STEPS.length;

  useEffect(() => {
    const update = () => setBasicProgress(loadBasicOnboardingProgress());
    window.addEventListener(BASIC_ONBOARDING_EVENT, update);
    return () => window.removeEventListener(BASIC_ONBOARDING_EVENT, update);
  }, []);

  useEffect(() => {
    if (!step) {
      setCompleted(true);
      const timer = window.setTimeout(() => {
        onDismiss();
      }, 2800);
      return () => window.clearTimeout(timer);
    }
  }, [onDismiss, step]);

  if (compact) {
    return (
      <aside className={`onboarding-coach onboarding-coach--compact${completed ? " onboarding-coach--complete" : ""}`} aria-live="polite">
        <i>{completed ? <Check size={16} /> : <GraduationCap size={16} />}</i>
        <span><small>{completed ? "教学完成" : `${step?.phase ?? "教学"} ${completedCount}/${totalSteps}`}</small><strong>{completed ? "白糖工业链已上线" : step?.title}</strong></span>
        {!completed && step ? <button className="onboarding-coach__compact-action" type="button" onClick={() => onAction(step.id)}>{focusTarget ? "定位" : step.action}<ChevronRight size={14} /></button> : null}
        <button className="onboarding-coach__compact-close" type="button" onClick={onDismiss} title="关闭渐进教学" aria-label="关闭启动引导"><X size={14} /></button>
      </aside>
    );
  }
  return (
    <aside className={`onboarding-coach${completed ? " onboarding-coach--complete" : ""}`} aria-live="polite">
      <header><i>{completed ? <Check size={15} /> : <GraduationCap size={15} />}</i><span><small>{completed ? "渐进教学完成" : `${step?.phase ?? "教学"} · 渐进教学 ${completedCount}/${totalSteps}`}</small><strong>{completed ? "白糖工业链已上线" : step?.title}</strong></span><button type="button" onClick={onDismiss} title="跳过渐进教学" aria-label="跳过启动引导"><X size={13} /></button></header>
      {!completed && step ? <><p>{basicStep ? (compact ? basicStep.mobileDetail : basicStep.desktopDetail) : progressiveStep?.detail}{focusTarget ? <span>当前卡点 · {focusTarget.reason}</span> : null}</p><footer><i><b style={{ width: `${completedCount / totalSteps * 100}%` }} /></i><button type="button" onClick={() => onAction(step.id)}>{focusTarget ? "定位卡点" : step.action}<ChevronRight size={13} /></button></footer></> : <p>采集、矩阵、跨星物流与戴森云已经形成完整白糖闭环。</p>}
    </aside>
  );
}
