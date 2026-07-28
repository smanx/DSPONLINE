import { Component, useSyncExternalStore, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  getDynamicImportRecoveryState,
  isDynamicImportFailure,
  reloadLatestBuild,
  subscribeDynamicImportRecovery,
} from "../game/dynamicImportRecovery";

export function DynamicImportRecoveryNotice() {
  const state = useSyncExternalStore(subscribeDynamicImportRecovery, getDynamicImportRecoveryState, getDynamicImportRecoveryState);
  if (state.status === "idle") return null;
  return <aside className={`dynamic-import-recovery dynamic-import-recovery--${state.status}`} role={state.status === "retrying" ? "status" : "alert"}>
    <AlertTriangle size={18} />
    <span><strong>{state.status === "retrying" ? "正在恢复模块" : "页面资源需要恢复"}</strong><small>{state.message}</small></span>
    {state.status !== "retrying" ? <button type="button" onClick={reloadLatestBuild}><RefreshCw size={16} />重新加载最新版</button> : null}
  </aside>;
}

interface BoundaryState { error: Error | null }

export class DynamicImportBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    if (!isDynamicImportFailure(error)) console.error(error);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <main className="dynamic-import-fatal" role="alert">
      <AlertTriangle size={28} />
      <strong>页面模块未能载入</strong>
      <p>本地存档仍保留在设备中。重新加载最新版即可继续。</p>
      <button type="button" onClick={reloadLatestBuild}><RefreshCw size={17} />重新加载最新版</button>
    </main>;
  }
}

