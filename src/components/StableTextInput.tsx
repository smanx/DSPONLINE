import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from "react";

const volatileDrafts = new Map<string, string>();

export function clearStableTextDraft(draftId: string): void {
  volatileDrafts.delete(draftId);
}

export function updateStableTextDraft(draftId: string, value: string): void {
  volatileDrafts.set(draftId, value);
}

export function readStableTextDraft(draftId: string): string | null {
  return volatileDrafts.get(draftId) ?? null;
}

/**
 * Keeps a non-sensitive draft through responsive/component remounts in the
 * current page lifetime. It deliberately never uses storage. Passwords must
 * opt out with sensitive so they cannot enter the shared draft map.
 */
export const StableTextInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  draftId: string;
  sensitive?: boolean;
  value: string;
  onValueChange: (value: string) => void;
}>(function StableTextInput({ draftId, sensitive = false, value, onValueChange, onBlur, onFocus, ...props }, forwardedRef) {
  const restoredDraftRef = useRef<string | null | undefined>(undefined);
  if (restoredDraftRef.current === undefined) {
    restoredDraftRef.current = sensitive ? null : volatileDrafts.get(draftId) ?? null;
  }
  const [draft, setDraft] = useState(() => restoredDraftRef.current ?? value);
  const composingRef = useRef(false);
  const focusedRef = useRef(false);
  const latestExternalRef = useRef(value);
  const initializedFromDraftRef = useRef(restoredDraftRef.current !== null);
  useEffect(() => {
    latestExternalRef.current = value;
    if (initializedFromDraftRef.current) {
      initializedFromDraftRef.current = false;
      return;
    }
    if (!composingRef.current && !focusedRef.current) setDraft(value);
  }, [value]);
  useEffect(() => {
    if (!sensitive) volatileDrafts.set(draftId, draft);
  }, [draft, draftId, sensitive]);
  useEffect(() => {
    const restored = restoredDraftRef.current;
    if (typeof restored === "string" && restored !== value) onValueChange(restored);
    // A page-lifetime draft is consumed only to restore this mount. Later
    // external updates are handled by the focused/composition guards above.
    restoredDraftRef.current = null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (next: string) => {
    setDraft(next);
    if (!sensitive) volatileDrafts.set(draftId, next);
    onValueChange(next);
  };
  return <input
    ref={forwardedRef}
    {...props}
    value={draft}
    onFocus={(event) => { focusedRef.current = true; onFocus?.(event); }}
    onChange={(event) => {
      const next = event.currentTarget.value;
      setDraft(next);
      if (!sensitive) volatileDrafts.set(draftId, next);
      if (!composingRef.current) onValueChange(next);
    }}
    onCompositionStart={() => { composingRef.current = true; }}
    onCompositionEnd={(event) => {
      composingRef.current = false;
      commit(event.currentTarget.value);
    }}
    onBlur={(event) => {
      focusedRef.current = false;
      if (composingRef.current || event.currentTarget.value !== latestExternalRef.current) {
        composingRef.current = false;
        commit(event.currentTarget.value);
      }
      onBlur?.(event);
    }}
  />;
});
