import { Component, useSyncExternalStore, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  getDynamicImportRecoveryState,
  isDynamicImportFailure,
  reloadLatestBuild,
  runtimeErrorDiagnosticCode,
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

interface BoundaryState {
  error: Error | null;
  dynamicImportFailure: boolean;
}

export class DynamicImportBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null, dynamicImportFailure: false };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error, dynamicImportFailure: isDynamicImportFailure(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (!isDynamicImportFailure(error)) {
      // Keep the useful React component stack for local debugging without
      // serializing the runtime message, save body, cloud payload, or props.
      console.error("[DSP runtime render error]", {
        name: error.name || "Error",
        componentStack: info.componentStack,
      });
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const dynamicImportFailure = this.state.dynamicImportFailure;
    return <main className="dynamic-import-fatal" role="alert">
      <AlertTriangle size={28} />
      <strong>{dynamicImportFailure ? "页面模块未能载入" : "页面运行时发生错误"}</strong>
      <p>{dynamicImportFailure
        ? "本地存档仍保留在设备中。重新加载最新版即可继续。"
        : "本地存档未被修改。重新加载后可以继续；若持续发生，请提供下方诊断码。"}</p>
      {!dynamicImportFailure ? <small>诊断码：{runtimeErrorDiagnosticCode(this.state.error)}</small> : null}
      <button type="button" onClick={reloadLatestBuild}><RefreshCw size={17} />{dynamicImportFailure ? "重新加载最新版" : "重新加载页面"}</button>
    </main>;
  }
}
