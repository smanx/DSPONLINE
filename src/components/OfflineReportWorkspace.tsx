import { CheckCircle2, Clock3, Factory, FlaskConical, Gift, Orbit, Send, Sparkles, X } from "lucide-react";
import { getItem, getTechnology } from "../game/content";
import type { OfflineReport } from "../game/storage";
import { offlineProfileLabel } from "../game/offlineComplexity";
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
  const approximation = report.approximation;
  const settlement = report.settlement ?? {
    status: approximation?.settlementStatus === "approximate" ? "approximate" as const : "exact" as const,
    committed: true,
    rewardsSubmitted: true,
    originalSeconds: report.seconds,
    submittedSeconds: report.seconds,
  };
  const settlementLabel = settlement.status === "conservative-skipped"
    ? "已确认跳过收益"
    : approximation?.settlementStatus === "conservative"
    ? "保守宏观结算"
    : approximation?.settlementStatus === "bounded-exact"
      ? "有界精确结算"
    : approximation?.mode === "approximate" ? "近似宏观结算（实验）" : "精确结算";
  const hasChanges = report.produced.length > 0 || report.completedTechIds.length > 0 ||
    report.structurePointsAdded > 0 || report.shellSailsAdded > 0 || infiniteResearchLevels.length > 0 ||
    exported.length > 0 || galacticCreditsAdded > 0 || returningReward.length > 0;
  return (
    <section className="offline-report" role="dialog" aria-modal="true" aria-label="离线结算报告">
      <header>
        <div><i><Clock3 size={19} /></i><span><small>离线生产协议</small><strong>结算报告</strong></span></div>
        <button type="button" onClick={onClose} title="关闭离线结算报告" aria-label="关闭离线结算报告"><X size={18} /></button>
      </header>
      <div className="offline-report-summary">
        <div className="offline-runtime">
          <span>原始离线时长</span><strong>{formatDuration(settlement.originalSeconds)}</strong>
          <small>实际提交 {formatDuration(settlement.submittedSeconds)}</small>
        </div>
        <section className={`offline-report-method offline-report-method--${approximation?.fellBack ? "fallback" : approximation?.mode ?? "exact"}`}>
          <header><Clock3 size={15} /><span>结算方式</span><strong>{settlementLabel}</strong></header>
          <dl>
            {report.complexity ? <>
              <div><dt>存档类型</dt><dd>{offlineProfileLabel(report.complexity.profile)}</dd></div>
              <div><dt>设备预算</dt><dd>{report.complexity.device.deviceClass === "low-memory" ? "低内存" : report.complexity.device.deviceClass === "constrained" ? "受限" : "标准"} · {report.complexity.recommendedDeadlineMs > 0 ? `${Math.round(report.complexity.recommendedDeadlineMs / 1_000)} 秒` : "精确路径"}</dd></div>
              <div><dt>规模</dt><dd>{report.complexity.entityCount.toLocaleString("zh-CN")} 建筑 · {report.complexity.beltCount.toLocaleString("zh-CN")} 线路</dd></div>
              <div><dt>内存预估</dt><dd>{(report.complexity.estimatedPeakBytes / 1024 / 1024).toFixed(0)} MiB 峰值</dd></div>
            </> : null}
            <div><dt>精确校准</dt><dd>{approximation ? approximation.calibrationWindowSeconds > 0 ? `${approximation.calibrationWindowSeconds} 秒${approximation.algorithmVersion?.startsWith("fast-30s-") ? "" : " × 2"}` : "未进入实验" : "全程精确"}</dd></div>
            <div><dt>宏观覆盖</dt><dd>{approximation ? formatDuration(approximation.approximatedSeconds) : "未使用"}</dd></div>
            <div><dt>估计最大误差</dt><dd>{approximation ? `${(approximation.maxEstimatedError * 100).toFixed(2)}%` : "0.00%"}</dd></div>
            <div><dt>算法版本</dt><dd>{approximation?.algorithmVersion ?? "deterministic-exact"}</dd></div>
            <div><dt>收益提交</dt><dd>{settlement.rewardsSubmitted ? "已验证提交" : "未产生收益（玩家确认）"}</dd></div>
            <div><dt>结算状态</dt><dd>{settlement.status === "conservative-skipped" ? "保守跳过" : settlement.status === "approximate" ? "合格近似" : "精确"}</dd></div>
            {approximation?.wallClockMs !== undefined ? <div><dt>现实耗时</dt><dd>{(approximation.wallClockMs / 1_000).toFixed(2)} 秒</dd></div> : null}
            {approximation?.researchInvested !== undefined ? <div><dt>科研投入</dt><dd>{approximation.researchInvested}</dd></div> : null}
            {approximation?.boundaryCorrections ? <div><dt>边界修正</dt><dd>{approximation.boundaryCorrections}</dd></div> : null}
          </dl>
          {settlement.status === "conservative-skipped" ? <p className="offline-report-warning">玩家已二次确认跳过本次离线收益；库存、建筑缓存、科研、戴森工程和累计产量均未增加。原因：{settlement.failureReason ?? approximation?.fallbackReason ?? "快速结算未完成"}</p> : approximation?.settlementStatus === "conservative" ? <p className="offline-report-warning">普通宏观合同未满足安全条件，已在现实时间上限内使用保守宏观结算：{approximation.fallbackReason ?? "未知原因"}</p> : approximation?.fellBack ? <p className="offline-report-warning">本次使用有界安全路径：{approximation.fallbackReason ?? "未知原因"}</p> : null}
          {report.complexity?.warning ? <p className="offline-report-warning">{report.complexity.warning}</p> : null}
        </section>
      </div>
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
        <div className={`offline-report-empty${settlement.status === "conservative-skipped" ? " offline-report-empty--skipped" : ""}`}><CheckCircle2 size={26} /><strong>{settlement.status === "conservative-skipped" ? "本次离线收益已明确跳过" : "离线期间网络保持稳定"}</strong><span>{settlement.status === "conservative-skipped" ? "收益为 0；这是玩家二次确认后的结果，不是成功生产结算" : "没有新增物资、科技或戴森结构"}</span></div>
      )}
      <footer><button type="button" onClick={onClose}><CheckCircle2 size={15} />确认结算</button></footer>
    </section>
  );
}
