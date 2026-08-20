import { AlertTriangle, HelpCircle, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibleDialog } from "./AccessibleDialog";

export const GAME_DIALOG_CLOSED_EVENT = "dsp-game-dialog-closed";

export interface GameDialogOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  defaultValue?: string;
  placeholder?: string;
}

interface DialogRequest {
  id: number;
  kind: "alert" | "confirm" | "prompt";
  message: string;
  options: GameDialogOptions;
  returnFocus: HTMLElement | null;
  resolve: (value: boolean | string | null) => void;
}

interface GameDialogApi {
  alert: (message: string, options?: GameDialogOptions) => Promise<void>;
  confirm: (message: string, options?: GameDialogOptions) => Promise<boolean>;
  prompt: (message: string, options?: GameDialogOptions) => Promise<string | null>;
}

const GameDialogContext = createContext<GameDialogApi | null>(null);

export function useGameDialog(): GameDialogApi {
  const context = useContext(GameDialogContext);
  if (!context) throw new Error("GameDialogProvider is missing");
  return context;
}

export function GameDialogProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<DialogRequest | null>(null);
  const [inputValue, setInputValue] = useState("");
  const queueRef = useRef<DialogRequest[]>([]);
  const activeRef = useRef<DialogRequest | null>(null);
  const sequenceRef = useRef(0);
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const compositionRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const publish = useCallback((request: DialogRequest) => {
    activeRef.current = request;
    setInputValue(request.options.defaultValue ?? "");
    setActive(request);
  }, []);

  const enqueue = useCallback(<T extends boolean | string | null>(kind: DialogRequest["kind"], message: string, options: GameDialogOptions = {}) => new Promise<T>((resolve) => {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusedInsideDialog = Boolean(focused?.closest(".game-dialog"));
    const returnFocus = focusedInsideDialog || !focused?.isConnected
      ? returnFocusRef.current
      : focused;
    if (!activeRef.current && !returnFocusRef.current) returnFocusRef.current = returnFocus;
    const request: DialogRequest = {
      id: ++sequenceRef.current,
      kind,
      message,
      options,
      returnFocus,
      resolve: resolve as DialogRequest["resolve"],
    };
    if (activeRef.current) queueRef.current.push(request);
    else publish(request);
  }), [publish]);

  const finish = useCallback((value: boolean | string | null) => {
    const request = activeRef.current;
    if (!request) return;
    request.resolve(value);
    const next = queueRef.current.shift() ?? null;
    activeRef.current = next;
    window.dispatchEvent(new Event(GAME_DIALOG_CLOSED_EVENT));
    if (next) {
      setInputValue(next.options.defaultValue ?? "");
      setActive(next);
    } else {
      setActive(null);
      window.requestAnimationFrame(() => {
        if (activeRef.current) return;
        const target = returnFocusRef.current ?? request.returnFocus;
        if (target?.isConnected && !target.hasAttribute("disabled")) target.focus({ preventScroll: true });
        returnFocusRef.current = null;
      });
    }
  }, []);

  const api = useMemo<GameDialogApi>(() => ({
    alert: async (message, options) => { await enqueue<boolean>("alert", message, options); },
    confirm: (message, options) => enqueue<boolean>("confirm", message, options),
    prompt: (message, options) => enqueue<string | null>("prompt", message, options),
  }), [enqueue]);

  const title = active?.options.title ?? (active?.kind === "alert" ? "提示" : active?.kind === "prompt" ? "请输入" : "确认操作");
  const Icon = active?.options.danger ? AlertTriangle : active?.kind === "alert" ? Info : HelpCircle;

  return <GameDialogContext.Provider value={api}>
    {children}
    {active ? <AccessibleDialog
      open
      className={`game-dialog${active.options.danger ? " game-dialog--danger" : ""}`}
      layout="bare"
      // Existing consumers route irreversible confirmations through this API
      // without always supplying `danger`; keep its long-standing alertdialog
      // contract while the shared modal now supplies focus containment.
      role="alertdialog"
      riskPolicy={active.kind === "alert" ? "explicit" : "dismissible"}
      ariaLabelledBy="game-dialog-title"
      ariaDescribedBy="game-dialog-message"
      title={title}
      description={active.message}
      initialFocusRef={active.kind === "prompt" ? inputRef : primaryButtonRef}
      onRequestClose={() => finish(active.kind === "prompt" ? null : false)}
    >
        <header><i><Icon size={19} /></i><strong id="game-dialog-title">{title}</strong>{active.kind !== "alert" ? <button type="button" onClick={() => finish(active.kind === "prompt" ? null : false)} aria-label="关闭确认框" title="取消"><X size={17} /></button> : null}</header>
        <p id="game-dialog-message">{active.message}</p>
        {active.kind === "prompt" ? <input ref={inputRef} value={inputValue} placeholder={active.options.placeholder} onCompositionStart={() => { compositionRef.current = true; }} onCompositionEnd={() => { compositionRef.current = false; }} onChange={(event) => setInputValue(event.target.value)} onKeyDown={(event) => {
          if (!compositionRef.current && !event.nativeEvent.isComposing && event.key === "Enter") { event.preventDefault(); finish(inputValue); }
        }} /> : null}
        <footer>
          {active.kind !== "alert" ? <button type="button" onClick={() => finish(active.kind === "prompt" ? null : false)}>{active.options.cancelLabel ?? "取消"}</button> : null}
          <button ref={primaryButtonRef} className={active.options.danger ? "danger" : "primary"} type="button" onClick={() => finish(active.kind === "prompt" ? inputValue : true)}>{active.options.confirmLabel ?? (active.kind === "alert" ? "知道了" : "确认")}</button>
        </footer>
    </AccessibleDialog> : null}
  </GameDialogContext.Provider>;
}
