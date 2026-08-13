import type { AppLocale } from "./locale";

export interface LocalizedReleaseNoteRecord {
  id: string;
  date: string;
  version: string;
  title: string;
  summary: string;
  items: readonly { id: string; title: string; description: string }[];
}

export interface LocalizedReleaseNotesUiCopy {
  publicBeta: string;
  close: string;
  historyPagination: string;
  returnCurrent: string;
  viewHistory: string;
  page: (current: number, total: number) => string;
  jumpPageLabel: string;
  jumpPageOption: (page: number) => string;
  previous: string;
  next: string;
  previousAria: string;
  nextAria: string;
  releaseList: string;
  community: string;
  acknowledge: string;
}

const copy = {
  date: {
    "zh-CN": "2026年8月13日",
    en: "August 13, 2026",
  },
  title: {
    "zh-CN": "云存档可靠性、排行榜与跨端体验更新",
    en: "Cloud Reliability, Rankings, and Cross-platform Experience",
  },
  summary: {
    "zh-CN": "1.0.40 让银河排行榜显示当前账号的真实名次和统计窗口状态，统一 30 MiB 大存档的跨端传输，并为多标签页、本地/云持久化、账号会话、PWA 更新和关键弹窗增加可恢复保护。玩法平衡、GameState v46、存档 envelope v2、云 schema v7 与 SQLite layout v2 不变。",
    en: "Version 1.0.40 reports the signed-in account's real Galaxy rank and metric-window status, unifies cross-platform transfer for saves up to 30 MiB, and adds recoverable safeguards for multiple tabs, local and cloud persistence, account sessions, PWA updates, and critical dialogs. Game balance, GameState v46, save envelope v2, cloud schema v7, and SQLite layout v2 remain unchanged.",
  },
  leaderboardTitle: {
    "zh-CN": "银河榜显示本人真实名次",
    en: "Your real Galaxy rank is visible",
  },
  leaderboardDescription: {
    "zh-CN": "公开榜仍只展示 Top 100；登录后会从完整公开成绩中计算本人排名。缺少主云档、相邻修订不足 60 秒、计时未增长、有效零产出、复核、隐藏或限制状态都会显示具体原因，本地 60 秒最佳值不再冒充服务器成绩。",
    en: "The public board remains Top 100, while a signed-in player receives their true rank across all public submissions. Missing main saves, windows below 60 seconds, non-increasing time, valid zero production, review, hidden, and restricted states are explained explicitly. Local 60-second bests never impersonate server scores.",
  },
  transferTitle: {
    "zh-CN": "大存档跨端上传口径统一",
    en: "Large-save transfer is consistent across platforms",
  },
  transferDescription: {
    "zh-CN": "Web、Windows 与 Android 共用 30 MiB 明文边界、gzip、动态超时和精确 SHA-256 确认；Windows 采用有背压分片。取消或结果未知时先核对 revision 与正文摘要，不盲目重复上传，1.0.39 旧协议继续兼容。",
    en: "Web, Windows, and Android share a 30 MiB plaintext limit, gzip, adaptive timeouts, and exact SHA-256 confirmation; Windows uses backpressured chunks. Cancelled or uncertain requests verify revision and payload identity before any retry, while the 1.0.39 protocol remains supported.",
  },
  localSaveTitle: {
    "zh-CN": "多标签页不再静默覆盖存档",
    en: "Multiple tabs cannot silently overwrite saves",
  },
  localSaveDescription: {
    "zh-CN": "同一浏览器只允许一个主写入页，其他页面明确只读。逐键 revision、租约和 fencing token 阻止陈旧写入；真正分叉、刷新急救镜像或崩溃半写入都会保留双方原文，由玩家选择，不自动拼接或删除。",
    en: "Only one tab writes in a browser profile; others are visibly read-only. Per-key revisions, leases, and fencing tokens block stale writes. Real forks, reload emergency mirrors, and interrupted mirror writes preserve both original payloads for an explicit player choice.",
  },
  persistenceTitle: {
    "zh-CN": "云端提交、容量与账号归档可恢复",
    en: "Cloud commits, quotas, and account archives are recoverable",
  },
  persistenceDescription: {
    "zh-CN": "云正文与元数据在 SQLite 事务成功后才对外可见；失败不会产生内存幽灵修订。配额、历史保留、正文去重、流式 ZIP 导出和原子导入均保留 checksum、revision、模式与槽位，旧 JSON 账号归档仍可校验导入。",
    en: "Cloud payloads and metadata become visible only after their SQLite transaction commits, so failures cannot expose phantom revisions. Quotas, history retention, payload deduplication, streaming ZIP exports, and atomic imports preserve checksum, revision, mode, and slot; legacy JSON account archives remain importable after validation.",
  },
  securityTitle: {
    "zh-CN": "账号会话和速通恢复保持隔离",
    en: "Account sessions and speedrun recovery stay isolated",
  },
  securityDescription: {
    "zh-CN": "网页账号逐步迁移到 HttpOnly 同源会话，Android 令牌使用系统安全存储并排除备份；API 增加请求边界、来源和安全头。新设备可直接发现速通主云档，普通/速通、main/手动槽及排行榜资格继续互不转换。",
    en: "Web accounts migrate to same-origin HttpOnly sessions, while Android tokens use platform secure storage and are excluded from backups. API request bounds, origin checks, and security headers are stricter. A new device can discover a speedrun main save directly, without crossing normal/speedrun, main/manual-slot, or ranking boundaries.",
  },
  experienceTitle: {
    "zh-CN": "启动、更新与关键操作更稳",
    en: "Startup, updates, and critical actions are steadier",
  },
  experienceDescription: {
    "zh-CN": "首屏不再提前加载游戏核心与英文大词典，运行遥测按增量持久化；PWA 保留当前与上一稳定壳层。设置、存档、云冲突、离线决策和批量操作使用统一焦点/危险确认语义，并加入 axe、Chromium、Firefox 与 WebKit 门禁。",
    en: "Startup no longer preloads the game core or the full English dictionary, and runtime telemetry persists incrementally. The PWA keeps current and previous-stable shells. Settings, saves, cloud conflicts, offline decisions, and batch actions share focus and dangerous-confirmation semantics, backed by axe, Chromium, Firefox, and WebKit gates.",
  },
  v1039Date: {
    "zh-CN": "2026年8月11日",
    en: "August 11, 2026",
  },
  v1039Title: {
    "zh-CN": "云存档稀疏格式紧急修复",
    en: "Emergency Sparse Cloud-save Fix",
  },
  v1039Summary: {
    "zh-CN": "1.0.39 修复 1.0.38 客户端生成的合法 v46 稀疏云存档被服务端错误拒绝的问题，并让普通/速通排行榜复核 revision 按模式独立。服务端不改写原始正文、checksum、revision 或历史记录；GameState v46、存档 envelope v2、云 schema v7 与 SQLite layout v2 不变。",
    en: "Version 1.0.39 fixed the server incorrectly rejecting valid sparse v46 cloud saves produced by 1.0.38 clients, and separated leaderboard review revisions by normal and speedrun mode. The server does not rewrite payloads, checksums, revisions, or history; GameState v46, save envelope v2, cloud schema v7, and SQLite layout v2 remain unchanged.",
  },
  v1039SparseTitle: {
    "zh-CN": "合法稀疏云存档恢复上传",
    en: "Valid sparse cloud saves upload again",
  },
  v1039SparseDescription: {
    "zh-CN": "v46 线路缺失 lanes/tier/progress 时只在结构校验读取 1/1/0 默认值，实体缺失 interactionLocked 时读取 false；显式 null、字符串、0、负数和越界值仍拒绝。",
    en: "For v46 belts, structural validation reads missing lanes/tier/progress as 1/1/0 and missing entity interactionLocked as false. Explicit nulls, strings, invalid zeroes, negative values, and out-of-range values remain rejected.",
  },
  v1039IdentityTitle: {
    "zh-CN": "上传原文与历史保持不变",
    en: "Uploaded bytes and history stay unchanged",
  },
  v1039IdentityDescription: {
    "zh-CN": "完整性检查仍先于结构校验，服务端不会规范化或重算正文；云 SHA-256、revision、冲突检测、历史恢复和下载正文继续逐字节一致。",
    en: "Integrity checks still run before structural validation, and the server neither normalizes nor recomputes the payload. Cloud SHA-256, revisions, conflict detection, restored history, and downloaded bytes remain identical.",
  },
  v1039ReviewTitle: {
    "zh-CN": "排行榜复核按模式隔离",
    en: "Leaderboard review is mode-isolated",
  },
  v1039ReviewDescription: {
    "zh-CN": "普通与速通 main 使用各自 revision 阈值；一个模式上传或恢复不会提前解除另一模式的复核等待，隐藏和永久冻结规则保持不变。",
    en: "Normal and speedrun main saves use separate revision thresholds. Uploading or restoring one mode cannot clear review for the other; hidden and permanently frozen rules remain unchanged.",
  },
} as const;

type CopyKey = keyof typeof copy;

function message(locale: AppLocale, key: CopyKey): string {
  return copy[key][locale];
}

/** Stable-key release copy; new 1.0.40 text does not use the legacy DOM translation bridge. */
export function getCurrentReleaseNotes(locale: AppLocale): LocalizedReleaseNoteRecord {
  return {
    id: "2026-08-13-v1.0.40",
    date: message(locale, "date"),
    version: "1.0.40",
    title: message(locale, "title"),
    summary: message(locale, "summary"),
    items: [
      { id: "leaderboard-self-rank", title: message(locale, "leaderboardTitle"), description: message(locale, "leaderboardDescription") },
      { id: "cross-platform-save-transfer", title: message(locale, "transferTitle"), description: message(locale, "transferDescription") },
      { id: "local-save-fencing", title: message(locale, "localSaveTitle"), description: message(locale, "localSaveDescription") },
      { id: "atomic-cloud-archives", title: message(locale, "persistenceTitle"), description: message(locale, "persistenceDescription") },
      { id: "secure-session-speedrun-recovery", title: message(locale, "securityTitle"), description: message(locale, "securityDescription") },
      { id: "startup-pwa-accessibility", title: message(locale, "experienceTitle"), description: message(locale, "experienceDescription") },
    ],
  };
}

export function getReleaseNotes1039(locale: AppLocale): LocalizedReleaseNoteRecord {
  return {
    id: "2026-08-11-v1.0.39",
    date: message(locale, "v1039Date"),
    version: "1.0.39",
    title: message(locale, "v1039Title"),
    summary: message(locale, "v1039Summary"),
    items: [
      { id: "sparse-save-validation", title: message(locale, "v1039SparseTitle"), description: message(locale, "v1039SparseDescription") },
      { id: "payload-identity", title: message(locale, "v1039IdentityTitle"), description: message(locale, "v1039IdentityDescription") },
      { id: "review-mode-isolation", title: message(locale, "v1039ReviewTitle"), description: message(locale, "v1039ReviewDescription") },
    ],
  };
}

export function getReleaseNotesUiCopy(locale: AppLocale): LocalizedReleaseNotesUiCopy {
  if (locale === "en") {
    return {
      publicBeta: "Public beta",
      close: "Close release notes",
      historyPagination: "Release history pagination",
      returnCurrent: "Back to current release",
      viewHistory: "View release history",
      page: (current, total) => `Page ${current} of ${total}`,
      jumpPageLabel: "Jump to page",
      jumpPageOption: (page) => `Page ${page}`,
      previous: "Previous",
      next: "Next",
      previousAria: "Previous release page",
      nextAria: "Next release page",
      releaseList: "Release list",
      community: "QQ community",
      acknowledge: "Got it",
    };
  }
  return {
    publicBeta: "公开测试版",
    close: "关闭版本更新记录",
    historyPagination: "版本历史分页",
    returnCurrent: "返回当前版本",
    viewHistory: "查看历史版本",
    page: (current, total) => `第 ${current} / ${total} 页`,
    jumpPageLabel: "跳转页码",
    jumpPageOption: (page) => `第 ${page} 页`,
    previous: "上一页",
    next: "下一页",
    previousAria: "上一页版本",
    nextAria: "下一页版本",
    releaseList: "版本列表",
    community: "QQ 交流群",
    acknowledge: "我知道了",
  };
}
