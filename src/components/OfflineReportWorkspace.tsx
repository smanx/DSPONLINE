import { CheckCircle2, Clock3, Factory, FlaskConical, Gift, Orbit, Send, Sparkles, X } from "lucide-react";
import { getItem, getTechnology } from "../game/content";
import type { OfflineReport } from "../game/storage";
import { ItemGlyph, ItemHoverCard } from "./ItemReference";
import { QuantityValue } from "./QuantityValue";

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  if (minutes > 0) return `${minutes} 分钟 ${remainingSeconds} 秒`;
  return `${remainingSeconds} 秒`;
}

export function OfflineReportWorkspace({ report, onClose }: { report: OfflineReport | null; onClose: () => void }) {
  if (!report) return null;
  const infiniteResearchLevels = report.infiniteResearchLevels ?? [];
  const exported = report.exported ?? [];
  const galacticCreditsAdded = report.galacticCreditsAdded ?? 0;
  const returningReward = report.returningReward ?? [];
  const hasChanges = report.produced.length > 0 || report.completedTechIds.length > 0 ||
    report.structurePointsAdded > 0 || report.shellSailsAdded > 0 || infiniteResearchLevels.length > 0 ||
    exported.length > 0 || galacticCreditsAdded > 0 || returningReward.length > 0;
  return (
    <section className="offline-report" role="dialog" aria-modal="true" aria-label="离线结算报告">
      <header>
        <div><i><Clock3 size={19} /></i><span><small>离线生产协议</small><strong>结算报告</strong></span></div>
        <button type="button" onClick={onClose} title="关闭离线结算报告" aria-label="关闭离线结算报告"><X size={18} /></button>
      </header>
      <div className="offline-runtime">
        <span>离线时长</span><strong>{formatDuration(report.seconds)}</strong>
      </div>
      {report.approximation ? <section className="offline-report-method">
        <header><Clock3 size={15} /><span>结算方式</span><strong>{report.approximation.mode === "approximate" ? "近似宏观结算（实验）" : "精确结算"}</strong></header>
        <dl>
          <div><dt>精确校准</dt><dd>{report.approximation.calibrationWindowSeconds > 0 ? `${report.approximation.calibrationWindowSeconds} 秒 × 2` : "未进入实验"}</dd></div>
          <div><dt>宏观覆盖</dt><dd>{formatDuration(report.approximation.approximatedSeconds)}</dd></div>
          <div><dt>估计最大误差</dt><dd>{(report.approximation.maxEstimatedError * 100).toFixed(2)}%</dd></div>
        </dl>
        {report.approximation.fellBack ? <p className="offline-report-warning">本次近似未满足安全条件，已自动使用精确结算：{report.approximation.fallbackReason ?? "未知原因"}</p> : null}
      </section> : null}
      {hasChanges ? (
        <div className="offline-report-body">
          {report.produced.length > 0 ? <section>
            <header><Factory size={15} /><span>生产入库</span><strong><QuantityValue value={report.produced.reduce((sum, item) => sum + item.amount, 0)} /></strong></header>
            <div className="offline-production-list">
              {report.produced.map(({ itemId, amount }) => {
                const item = getItem(itemId);
                return (
                  <div key={itemId}>
                    <ItemHoverCard itemId={itemId}><ItemGlyph itemId={itemId} /></ItemHoverCard>
                    <span>{item.name}</span><strong>+<QuantityValue value={amount} /></strong>
                  </div>
                );
              })}
            </div>
          </section> : null}
          {report.completedTechIds.length > 0 ? <section>
            <header><FlaskConical size={15} /><span>科研完成</span><strong>{report.completedTechIds.length}</strong></header>
            <div className="offline-tech-list">
              {report.completedTechIds.map((techId) => (
                <span key={techId}><CheckCircle2 size={13} />{getTechnology(techId)?.name ?? techId}</span>
              ))}
            </div>
          </section> : null}
          {report.structurePointsAdded > 0 || report.shellSailsAdded > 0 ? <section>
            <header><Orbit size={15} /><span>戴森工程</span></header>
            <dl>
              <div><dt>永久结构点</dt><dd>+<QuantityValue value={report.structurePointsAdded} /></dd></div>
              <div><dt>壳面吸附帆</dt><dd>+<QuantityValue value={report.shellSailsAdded} /></dd></div>
            </dl>
          </section> : null}
          {infiniteResearchLevels.length > 0 ? <section>
            <header><Sparkles size={15} /><span>无限科研</span><strong>{infiniteResearchLevels.length}</strong></header>
            <div className="offline-tech-list">
              {infiniteResearchLevels.map(({ id, level }) => <span key={id}><CheckCircle2 size={13} />{id} +{level} 级</span>)}
            </div>
          </section> : null}
          {exported.length > 0 || galacticCreditsAdded > 0 ? <section>
            <header><Send size={15} /><span>银河出口</span><strong><QuantityValue value={galacticCreditsAdded} unit="信用" /></strong></header>
            <div className="offline-tech-list">
              {exported.map(({ projectId, amount }) => <span key={projectId}><Send size={13} />{projectId} +<QuantityValue value={amount} /></span>)}
            </div>
          </section> : null}
          {returningReward.length > 0 ? <section className="offline-returning-reward">
            <header><Gift size={15} /><span>回归补给</span><strong>72h+</strong></header>
            <div className="offline-production-list">{returningReward.map(({ itemId, amount }) => <div key={itemId}><ItemHoverCard itemId={itemId}><ItemGlyph itemId={itemId} /></ItemHoverCard><span>{getItem(itemId).name}</span><strong>+<QuantityValue value={amount} /></strong></div>)}</div>
          </section> : null}
        </div>
      ) : (
        <div className="offline-report-empty"><CheckCircle2 size={26} /><strong>离线期间网络保持稳定</strong><span>没有新增物资、科技或戴森结构</span></div>
      )}
      <footer><button type="button" onClick={onClose}><CheckCircle2 size={15} />确认结算</button></footer>
    </section>
  );
}
