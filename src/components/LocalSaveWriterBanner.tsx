import { AlertTriangle, LockKeyhole, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAppLocale } from "../i18n/locale";
import { appMessage } from "../i18n/messages";
import {
  getLocalSaveWriterStatus,
  getLocalSaveConflicts,
  resolveLocalSaveConflict,
  subscribeLocalSaveWriterStatus,
  takeOverLocalSaveWriter,
  type LocalSaveConflictSummary,
} from "../game/localSaveStore";

export function LocalSaveWriterBanner() {
  const { locale } = useAppLocale();
  const [status, setStatus] = useState(getLocalSaveWriterStatus);
  const [takingOver, setTakingOver] = useState(false);
  const [takeOverFailed, setTakeOverFailed] = useState(false);
  const [conflictSummary, setConflictSummary] = useState<LocalSaveConflictSummary | null>(null);

  const refreshConflict = useCallback(() => {
    void getLocalSaveConflicts().then((conflicts) => setConflictSummary(
      conflicts.find((entry) => entry.conflictId === status.conflictId) ?? conflicts[0] ?? null,
    ));
  }, [status.conflictId]);

  useEffect(() => subscribeLocalSaveWriterStatus(setStatus), []);
  useEffect(() => { if (status.role === "conflict") refreshConflict(); }, [refreshConflict, status.role]);
  if (status.role !== "secondary" && status.role !== "conflict" && status.role !== "unavailable") return null;

  const conflict = status.role === "conflict";
  const unavailable = status.role === "unavailable";
  const title = appMessage(locale, conflict ? "localSaveConflictTitle" : unavailable ? "localSaveUnavailableTitle" : "localSaveSecondaryTitle");
  const detail = appMessage(locale, conflict ? "localSaveConflictDetail" : unavailable ? "localSaveUnavailableDetail" : "localSaveSecondaryDetail");
  const canTakeOver = !conflict && status.leaseExpiresAt <= Date.now();
  return (
    <aside className={`local-save-writer-banner local-save-writer-banner--${status.role}`} role="alert" aria-live="assertive">
      {conflict ? <AlertTriangle size={19} /> : <LockKeyhole size={19} />}
      <span><strong>{title}</strong><small>{detail}{status.conflictId ? ` · ${status.conflictId}` : ""}</small>{conflictSummary ? <small>
        {locale === "en" ? "Current" : "当前"}: {conflictSummary.persisted.savedAt ? new Date(conflictSummary.persisted.savedAt).toLocaleString(locale) : "--"}
        {" · "}{locale === "en" ? "Candidate" : "候选"}: {conflictSummary.candidate.savedAt ? new Date(conflictSummary.candidate.savedAt).toLocaleString(locale) : conflictSummary.candidate.deleted ? (locale === "en" ? "delete request" : "删除请求") : "--"}
      </small> : null}</span>
      {!conflict ? <button type="button" disabled={takingOver} onClick={() => {
        setTakingOver(true);
        setTakeOverFailed(false);
        void takeOverLocalSaveWriter().then((ok) => {
          setTakeOverFailed(!ok);
          if (ok) window.location.reload();
        }).finally(() => setTakingOver(false));
      }} title={canTakeOver ? undefined : appMessage(locale, "localSaveTakeOverUnavailable")}>
        <RefreshCw size={14} />{appMessage(locale, "localSaveTakeOver")}
      </button> : null}
      {conflict && conflictSummary ? <div className="local-save-writer-banner__actions">
        <button type="button" disabled={takingOver} onClick={() => {
          setTakingOver(true);
          void resolveLocalSaveConflict(conflictSummary.conflictId, "persisted").then((ok) => { if (ok) window.location.reload(); else setTakeOverFailed(true); }).finally(() => setTakingOver(false));
        }}>{appMessage(locale, "localSaveKeepPersisted")}</button>
        <button className="danger" type="button" disabled={takingOver || !conflictSummary.candidate.available && !conflictSummary.candidate.deleted} title={appMessage(locale, "localSaveConflictChoice")} onClick={() => {
          setTakingOver(true);
          void resolveLocalSaveConflict(conflictSummary.conflictId, "candidate").then((ok) => { if (ok) window.location.reload(); else setTakeOverFailed(true); }).finally(() => setTakingOver(false));
        }}>{appMessage(locale, "localSaveUseCandidate")}</button>
      </div> : null}
      {unavailable ? <button type="button" onClick={() => window.location.reload()}><RefreshCw size={14} />{appMessage(locale, "localSaveReload")}</button> : null}
      {takeOverFailed ? <em>{appMessage(locale, "localSaveTakeOverUnavailable")}</em> : null}
    </aside>
  );
}
