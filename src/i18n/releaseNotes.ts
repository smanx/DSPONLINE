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

const currentCopy = {
  date: { "zh-CN": "2026年8月14日", en: "August 14, 2026" },
  title: { "zh-CN": "界面适配、移动导航与无障碍更新", en: "Responsive UI, Mobile Navigation, and Accessibility" },
  summary: {
    "zh-CN": "1.0.42 统一桌面和手机工作区的动态安全区、模态焦点与高字号布局，修复命令面板跳转竞态、亮色文字对比度、统计交互语义和中文输入草稿，并让教程、PWA 与原生制品读取同一应用版本。玩法平衡、结算规则、GameState v46、存档 envelope v2、云 schema v7 与 SQLite layout v2 不变。",
    en: "Version 1.0.42 unifies dynamic safe areas, modal focus, and large-text layouts across desktop and mobile workspaces; fixes command-palette navigation races, light-theme contrast, statistics semantics, and IME drafts; and aligns tutorial, PWA, and native version metadata. Game balance, settlement rules, GameState v46, save envelope v2, cloud schema v7, and SQLite layout v2 remain unchanged.",
  },
  shellTitle: { "zh-CN": "工作区跟随真实顶栏与托盘", en: "Workspaces follow the real shell bounds" },
  shellDescription: {
    "zh-CN": "主线、资料库、科技、蓝图、星图、统计、银河、运营和制造中心统一读取壳层动态高度；80%～200% 字号和常见桌面分辨率不再遮住关闭按钮、标签或内容。",
    en: "Campaign, codex, technology, blueprints, star map, statistics, Galaxy, operations, and construction center now read dynamic shell heights, preventing controls and content from being covered at 80%–200% text scale and common desktop resolutions.",
  },
  navigationTitle: { "zh-CN": "手机命令跳转一次完成", en: "Mobile command navigation completes atomically" },
  navigationDescription: {
    "zh-CN": "命令面板切换到工作区、物资抽屉或检查器时使用一次 history 替换；关闭面板不会再追加返回动作，浏览器返回、页面返回和实体定位保持同一导航栈。",
    en: "Moving from the command palette to a workspace, inventory sheet, or inspector now uses one history replacement. Closing the palette no longer adds a second back action, while browser back, UI back, and entity focus share the same stack.",
  },
  accessibilityTitle: { "zh-CN": "背景失活与焦点边界统一", en: "Unified inert background and focus boundaries" },
  accessibilityDescription: {
    "zh-CN": "全屏工作区使用共享模态框架：被覆盖的工厂画布会 inert 并从无障碍树隐藏，Tab 保持在当前工作区，嵌套确认框和悬浮 Portal 可正常使用，关闭后恢复原焦点。",
    en: "Full-screen workspaces use a shared modal frame: the covered factory becomes inert and hidden from assistive technology, Tab stays within the active workspace, nested confirmations and tooltip portals remain usable, and focus returns on close.",
  },
  responsiveTitle: { "zh-CN": "窄屏、高字号和触控操作收口", en: "Narrow, large-text, and touch layouts refined" },
  responsiveDescription: {
    "zh-CN": "统计时间范围、资料库分类、蓝图操作、戴森横屏、更新公告和制造中心在窄屏下改为可滚动或重排；手机主要操作保持至少 44×44px 命中区。",
    en: "Statistics ranges, codex categories, blueprint actions, Dyson landscape layouts, release notes, and construction-center controls now scroll or reflow on narrow screens, with primary mobile targets kept at least 44×44 px.",
  },
  inputTitle: { "zh-CN": "中文输入与页面草稿更稳定", en: "More stable IME input and in-page drafts" },
  inputDescription: {
    "zh-CN": "蓝图名称、统计书签与规划、账号资料和搜索输入在组合输入、失焦、横竖屏与全屏变化期间保留页面内草稿；提交、取消或主动清空后才移除，密码不进入共享草稿或日志。",
    en: "Blueprint names, statistics bookmarks and plans, account details, and search fields retain in-page drafts through IME composition, blur, orientation, and fullscreen changes. Drafts clear only on submit, cancel, or explicit reset; passwords never enter shared drafts or logs.",
  },
  versionTitle: { "zh-CN": "版本信息与回归夹具一致", en: "Version metadata and QA fixtures aligned" },
  versionDescription: {
    "zh-CN": "教程展示真实应用版本，阅读进度按独立内容修订保存；Web version.json、PWA、Android 与 Windows 构建使用同一版本源。预览测试改为一次性正式存储注入，刷新不再制造多写入者冲突。",
    en: "The tutorial displays the real app version while progress uses an independent content revision. Web version.json, PWA, Android, and Windows builds share one version source, and preview fixtures seed official storage once so reloads no longer create false multi-writer conflicts.",
  },
} as const;

const copy = {
  date: {
    "zh-CN": "2026年8月13日",
    en: "August 13, 2026",
  },
  title: {
    "zh-CN": "大存档、离线选择与连续拉线体验更新",
    en: "Large Saves, Offline Choices, and Continuous Connections",
  },
  summary: {
    "zh-CN": "1.0.41 让合法 32 MiB 以上大存档通过有界 gzip 上传并显示完整同步诊断，进入游戏前可明确选择快速、精确或放弃离线收益，同时加入自适应端口命中、原子连续拉线和移动输入草稿保护。纯挂机五分钟后台规则、玩法平衡、GameState v46、存档 envelope v2、云 schema v7 与 SQLite layout v2 不变。",
    en: "Version 1.0.41 adds bounded gzip upload and complete sync diagnostics for valid saves above 32 MiB, an explicit fast/exact/forfeit offline choice before entering the game, adaptive port hit targets, atomic continuous connections, and safer mobile text drafts. The five-minute background rule for time-warp idle, game balance, GameState v46, save envelope v2, cloud schema v7, and SQLite layout v2 remain unchanged.",
  },
  leaderboardTitle: {
    "zh-CN": "云存档状态中心",
    en: "Cloud-save status center",
  },
  leaderboardDescription: {
    "zh-CN": "主菜单和银河网络显示当前模式与槽位、本地/云端修订、最近成功时间、上传/确认/冲突/失败/恢复状态，并可安全重试、取消、分别导出本地和云端副本或复制不含正文与凭据的诊断。",
    en: "The start menu and Galaxy network now show mode and slot, local/cloud revisions, last success, upload/confirmation/conflict/failure/recovery states, safe retry and cancel, separate local/cloud exports, and a redacted diagnostic with no payload or credentials.",
  },
  transferTitle: {
    "zh-CN": "32 MiB 以上大存档可安全上传",
    en: "Saves above 32 MiB upload safely",
  },
  transferDescription: {
    "zh-CN": "Web、Windows 与 Android 共用 48 MiB 保证档位、约 64 MiB 单修订硬边界、gzip 预检和动态超时。服务端按请求数和解压后字节双重限流，失败会列出原始、压缩、解压、上限和差值，旧云修订与本地存档不变。",
    en: "Web, Windows, and Android share a 48 MiB guaranteed tier, an approximately 64 MiB hard revision boundary, gzip preflight, and adaptive timeouts. The server bounds both request count and expanded bytes; failures report original, compressed, expanded, limit, and delta while preserving the local save and previous cloud revision.",
  },
  localSaveTitle: {
    "zh-CN": "离线收益由玩家明确选择",
    en: "Players choose how offline rewards settle",
  },
  localSaveDescription: {
    "zh-CN": "普通模式超过一分钟的离线区间在载入前提供快速（推荐）、精确和放弃收益三种选择。快速失败会说明原因并允许再次快速尝试；取消不消费区间，放弃收益必须二次确认，精确结算可安全取消。",
    en: "Normal-mode offline intervals over one minute offer Fast (recommended), Exact, or Forfeit before loading. A failed fast run explains why and can be retried; cancel preserves the interval, forfeiting requires a second confirmation, and exact settlement remains safely cancellable.",
  },
  persistenceTitle: {
    "zh-CN": "传送带端口更容易点中",
    en: "Belt ports are easier to target",
  },
  persistenceDescription: {
    "zh-CN": "连接点视觉大小和透明命中范围分开设置；自动档随画布缩放扩大，触控至少提供 56px 命中直径。悬停与拉线提示仍按物品和输入/输出类型校验，不遮挡建筑文字。",
    en: "Visible port size and transparent hit targets are separate settings. Auto mode grows with canvas zoom and guarantees a 56 px touch diameter. Hover and connection hints remain item- and direction-aware without covering building labels.",
  },
  securityTitle: {
    "zh-CN": "连续拉线整批原子提交",
    en: "Continuous connections commit atomically",
  },
  securityDescription: {
    "zh-CN": "选择一个输出后可连续点选多个兼容输入，Enter 或按钮统一确认，Esc 取消；预览显示线路与材料。任一候选非法或材料不足时整批不创建、不扣料，也不会改目标配方或物流槽。",
    en: "Choose one output, then select multiple compatible inputs and confirm once with Enter or the button; Escape cancels. The preview reports lines and material. If any candidate is invalid or stock is insufficient, nothing is created or consumed, and target recipes or logistics slots are never rewritten.",
  },
  experienceTitle: {
    "zh-CN": "手机输入不再被重绘清空",
    en: "Mobile text survives responsive redraws",
  },
  experienceDescription: {
    "zh-CN": "搜索、注册和档案输入在中文输入法组合、父组件刷新、横竖屏与新版/经典手机界面切换时保留页面内草稿；只有提交、取消或主动清空才移除。密码始终不进入普通草稿或诊断。",
    en: "Search, registration, and profile fields keep in-page drafts through IME composition, parent refreshes, orientation changes, and classic/new mobile layouts. Drafts clear only on submit, cancel, or explicit reset. Passwords never enter shared drafts or diagnostics.",
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

function currentMessage(locale: AppLocale, key: keyof typeof currentCopy): string {
  return currentCopy[key][locale];
}

/** Stable-key release copy; current text does not use the legacy DOM translation bridge. */
export function getCurrentReleaseNotes(locale: AppLocale): LocalizedReleaseNoteRecord {
  return {
    id: "2026-08-14-v1.0.42",
    date: currentMessage(locale, "date"),
    version: "1.0.42",
    title: currentMessage(locale, "title"),
    summary: currentMessage(locale, "summary"),
    items: [
      { id: "dynamic-shell-safe-area", title: currentMessage(locale, "shellTitle"), description: currentMessage(locale, "shellDescription") },
      { id: "atomic-mobile-navigation", title: currentMessage(locale, "navigationTitle"), description: currentMessage(locale, "navigationDescription") },
      { id: "workspace-accessibility", title: currentMessage(locale, "accessibilityTitle"), description: currentMessage(locale, "accessibilityDescription") },
      { id: "responsive-large-text", title: currentMessage(locale, "responsiveTitle"), description: currentMessage(locale, "responsiveDescription") },
      { id: "stable-form-drafts", title: currentMessage(locale, "inputTitle"), description: currentMessage(locale, "inputDescription") },
      { id: "version-and-preview-integrity", title: currentMessage(locale, "versionTitle"), description: currentMessage(locale, "versionDescription") },
    ],
  };
}

export function getReleaseNotes1041(locale: AppLocale): LocalizedReleaseNoteRecord {
  return {
    id: "2026-08-13-v1.0.41",
    date: message(locale, "date"),
    version: "1.0.41",
    title: message(locale, "title"),
    summary: message(locale, "summary"),
    items: [
      { id: "cloud-status-center", title: message(locale, "leaderboardTitle"), description: message(locale, "leaderboardDescription") },
      { id: "large-save-upload", title: message(locale, "transferTitle"), description: message(locale, "transferDescription") },
      { id: "offline-settlement-choice", title: message(locale, "localSaveTitle"), description: message(locale, "localSaveDescription") },
      { id: "adaptive-connection-ports", title: message(locale, "persistenceTitle"), description: message(locale, "persistenceDescription") },
      { id: "atomic-continuous-connections", title: message(locale, "securityTitle"), description: message(locale, "securityDescription") },
      { id: "stable-mobile-input", title: message(locale, "experienceTitle"), description: message(locale, "experienceDescription") },
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
