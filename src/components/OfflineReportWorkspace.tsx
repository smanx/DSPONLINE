import { CheckCircle2, Clock3, Factory, FlaskConical, Orbit, X } from "lucide-react";
import { getItem, getTechnology } from "../game/content";
import type { OfflineReport } from "../game/storage";
import { ItemHoverCard } from "./ItemReference";

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
  const hasChanges = report.produced.length > 0 || report.completedTechIds.length > 0 ||
    report.structurePointsAdded > 0 || report.shellSailsAdded > 0;
  return (
    <section className="offline-report" role="dialog" aria-modal="true" aria-label="离线结算报告">
      <header>
        <div><i><Clock3 size={19} /></i><span><small>离线生产协议</small><strong>结算报告</strong></span></div>
        <button type="button" onClick={onClose} title="关闭离线结算报告" aria-label="关闭离线结算报告"><X size={18} /></button>
      </header>
      <div className="offline-runtime">
        <span>离线时长</span><strong>{formatDuration(report.seconds)}</strong>
      </div>
      {hasChanges ? (
        <div className="offline-report-body">
          <section>
            <header><Factory size={15} /><span>生产入库</span><strong>{report.produced.reduce((sum, item) => sum + item.amount, 0).toLocaleString("zh-CN")}</strong></header>
            <div className="offline-production-list">
              {report.produced.length > 0 ? report.produced.map(({ itemId, amount }) => {
                const item = getItem(itemId);
                return (
                  <div key={itemId}>
                    <ItemHoverCard itemId={itemId}><i style={{ backgroundColor: item.color }}>{item.symbol}</i></ItemHoverCard>
                    <span>{item.name}</span><strong>+{amount.toLocaleString("zh-CN")}</strong>
                  </div>
                );
              }) : <span className="offline-empty-row">没有新增物资</span>}
            </div>
          </section>
          <section>
            <header><FlaskConical size={15} /><span>科研完成</span><strong>{report.completedTechIds.length}</strong></header>
            <div className="offline-tech-list">
              {report.completedTechIds.length > 0 ? report.completedTechIds.map((techId) => (
                <span key={techId}><CheckCircle2 size={13} />{getTechnology(techId)?.name ?? techId}</span>
              )) : <span className="offline-empty-row">没有完成新科技</span>}
            </div>
          </section>
          <section>
            <header><Orbit size={15} /><span>戴森工程</span></header>
            <dl>
              <div><dt>永久结构点</dt><dd>+{report.structurePointsAdded}</dd></div>
              <div><dt>壳面吸附帆</dt><dd>+{report.shellSailsAdded}</dd></div>
            </dl>
          </section>
        </div>
      ) : (
        <div className="offline-report-empty"><CheckCircle2 size={26} /><strong>离线期间网络保持稳定</strong><span>没有新增物资、科技或戴森结构</span></div>
      )}
      <footer><button type="button" onClick={onClose}><CheckCircle2 size={15} />确认结算</button></footer>
    </section>
  );
}
