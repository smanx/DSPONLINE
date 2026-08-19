#!/usr/bin/env node
// DSP Online 排行榜名次一键修改脚本
// 用法: node dsp-rank-set.mjs <用户名> <密码> <目标名次> [--verbose]
// 流程: 登录 -> 拉取6榜+主档 -> 计算各榜目标档位(含并列群检测/只增不降/浮点精确反解)
//       -> 退出排行榜 -> 上传基准档A -> 上传目标档B -> 重新加入 -> 验证名次
"use strict";
const BASE = "https://dsponline.cn";
const CATS = ["power", "upload", "white-rate", "dyson", "throughput", "galaxy"];
const MIN_WINDOW = 60;
const WINDOW_START = 600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const [username, password, rankStr] = args.filter((a) => !a.startsWith("--"));
if (!username || !password || !rankStr) {
  console.error("用法: node dsp-rank-set.mjs <用户名> <密码> <目标名次> [--verbose]");
  process.exit(1);
}
const N = Number(rankStr);
if (!Number.isInteger(N) || N < 1 || N > 100) {
  console.error(`目标名次无效: ${rankStr}`);
  process.exit(1);
}

function log(...a) { console.log(...a); }
function dbg(...a) { if (verbose) console.log("[dbg]", ...a); }
async function fail(msg) {
  console.error(msg);
  await new Promise((r) => setTimeout(r, 100)); // flush stdout
  process.exit(1);
}

// ---------- HTTP ----------
async function req(path, { method = "GET", body, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(BASE + "/api" + path, {
    method, headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, retryAfter: Number(res.headers.get("retry-after") ?? 0) };
}
async function reqWithRetry(path, opts, maxWait = 90000) {
  const start = Date.now();
  for (;;) {
    const r = await req(path, opts);
    if (r.status === 429 && Date.now() - start < maxWait) {
      const wait = Math.max(1000, r.retryAfter * 1000);
      log(`限流(429),等待 ${wait / 1000}s 后重试 ${path}`);
      await sleep(wait);
      continue;
    }
    return r;
  }
}

// ---------- 存档工具(复刻服务端逻辑) ----------
function checksum(formatVersion, state) {
  const payload = JSON.stringify({ formatVersion, state });
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function normMetric(v) {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(Number.MAX_VALUE, v)) : 0;
  return n > Number.MAX_VALUE / 100 ? n : Math.round(n * 100) / 100;
}
function serverE(genKw, elapsed) {
  const g = normMetric(genKw);
  const e = normMetric(elapsed / 1000);
  return g === 0 || e === 0 ? 0 : g * e;
}
function galaxyScore(metrics) {
  return Math.round(
    metrics.energyGeneratedMj / 1_000_000 +
    metrics.uploadedWhiteMatrix * 12 +
    metrics.peakDysonPowerKw / 100 +
    metrics.peakThroughputPerMinute * 8 +
    metrics.exploredSystems * 10_000 +
    metrics.colonizedPlanets * 2_000,
  );
}

// ---------- 目标档位计算 ----------
// values: 榜单第1~100名的value(降序)。返回 { value, blocked, strategy, note }
function computeTarget(values, curValue, N) {
  const vN = values[N - 1];                       // 第N名当前值
  const vNm = N >= 2 ? values[N - 2] : Infinity;  // 第N-1名
  const vNp = N < values.length ? values[N] : 0;  // 第N+1名

  const inGroup = vN === vNm || vN === vNp;
  if (inGroup) {
    // 并列群:群内名次由内部userId排序决定,无法精确控制
    let gStart = N - 1, gEnd = N - 1;
    while (gStart > 0 && values[gStart - 1] === vN) gStart--;
    while (gEnd < values.length - 1 && values[gEnd + 1] === vN) gEnd++;
    const groupRank = gStart + 1;                 // 群起点名次
    if (curValue <= vN) {
      return {
        value: vN, blocked: true, strategy: "join-group",
        note: `第${groupRank}~${gEnd + 1}名并列值${vN},取群值进群,实际名次由userId排序决定(可验证后微调)`,
      };
    }
    return {
      value: curValue, blocked: true, strategy: "keep",
      note: `已在并列群(${groupRank}~${gEnd + 1})内或之上,只增不降无法下调,保持当前值`,
    };
  }
  // 精确档位:新值需严格 ∈ (vN, vNm)
  const mid = (vN + vNm) / 2;
  let target = Math.max(Math.ceil(mid), Math.ceil(vN + 1), curValue);
  if (target >= vNm) {
    return {
      value: curValue, blocked: true, strategy: "keep",
      note: `只增不降限制:当前值(${curValue})已不低于第${N - 1}名档位,无法精确第${N}名,保持当前`,
    };
  }
  return { value: target, blocked: false, strategy: "exact", note: "" };
}

// ---------- 主流程 ----------
async function main() {
  // 1. 登录
  log(`[1/7] 登录 ${username} ...`);
  const login = await reqWithRetry("/auth/login", { method: "POST", body: { identifier: username, password } });
  if (login.status !== 200) {
    console.error(`登录失败 (${login.status}): ${login.json?.error ?? ""}`);
    process.exit(1);
  }
  const token = login.json.token;
  const userId = login.json.user.id;
  log(`  ok, 用户: ${login.json.user.displayName ?? username} (${userId})`);

  // 2. 拉取6榜 + 主档
  log(`[2/7] 拉取排行榜与主云存档 ...`);
  const boards = {};
  for (const cat of CATS) {
    const r = await reqWithRetry(`/leaderboard?category=${cat}&seasonId=season_01`);
    boards[cat] = r.json.entries ?? [];
    await sleep(200);
  }
  const saveRes = await reqWithRetry("/cloud-save?slot=main", { token });
  dbg("cloud-save status:", saveRes.status);
  const cs = saveRes.json.cloudSave;
  if (!cs?.payload) { await fail("主云存档不存在: status=" + saveRes.status + " " + JSON.stringify(saveRes.json).slice(0, 300)); }
  const envelope = JSON.parse(cs.payload);
  const state0 = envelope.state;
  const revision = cs.revision;
  dbg("主档 revision:", revision, "elapsed:", state0.elapsedSeconds, "wm:", state0.totalProduced?.universe_matrix);

  const findMe = (entries) => entries.find((e) => e.userId === userId || e.accountId === userId || e.displayName === login.json.user.displayName);
  const cur = {};
  for (const cat of CATS) {
    const me = findMe(boards[cat]);
    cur[cat] = me ? { rank: me.rank, value: me.value } : null;
    log(`  当前 ${cat.padEnd(10)} #${me?.rank ?? "-"}  value=${me?.value ?? "-"}`);
  }

  // 3. 计算目标档位
  log(`[3/7] 计算目标档位 (目标第${N}名) ...`);
  const targets = {};
  for (const cat of CATS) {
    if (cat === "dyson") continue; // 由 galaxy 反解
    const values = boards[cat].map((e) => e.value);
    const curValue = cur[cat]?.value ?? 0;
    const t = computeTarget(values, curValue, N);
    targets[cat] = t;
    log(`  ${cat.padEnd(10)} 目标=${t.value}  [${t.strategy}] ${t.note}`);
  }

  // 4. 反解存档字段
  log(`[4/7] 反解存档字段(模拟服务端浮点舍入精确命中) ...`);
  const exploredSystems = new Set(state0.exploration?.unlockedSystemIds ?? []).size;
  const colonizedPlanets = new Set(state0.exploration?.colonizedPlanetIds ?? []).size;
  const swarmKw = state0.dysonSwarm?.generationKw ?? 0;
  const curWm = Math.floor(Number(state0.totalProduced?.universe_matrix ?? 0));
  const curIron = Number(state0.totalProduced?.iron_ore ?? 0);
  const E_target = targets.power.value;
  const U_target = targets.upload.value;          // wmB
  const W_target = targets["white-rate"].value;
  const T_target = targets.throughput.value;
  const G_target = targets.galaxy.value;

  // 4a. 搜索 (elapsedB, genKw): genKw 整数, norm(elapsedB/1000) 两位小数, genKw*e === E_target 精确
  const curElapsed = state0.elapsedSeconds;
  let hit = null;
  for (let step = 0; step < 300000; step++) {
    const elapsedB = curElapsed + WINDOW_START + step * 0.01;
    const eNorm = normMetric(elapsedB / 1000);
    const g = E_target / eNorm;
    if (Number.isInteger(g) && normMetric(g) === g && g * eNorm === E_target) { hit = { elapsedB, g }; break; }
  }
  if (!hit) { await fail("未找到满足浮点精确的 (elapsedB, genKw) 组合,请检查目标值或稍后重试"); }
  const { elapsedB, g: genKwB } = hit;
  const deltaElapsed = elapsedB - curElapsed;
  dbg(`elapsedB=${elapsedB} genKw=${genKwB} delta=${deltaElapsed} E=${serverE(genKwB, elapsedB)}`);

  // 4b. white-rate: wmB = wmA + W*Δ/60 (wmA = 当前wm)
  const wmA = curWm;
  const wmB = Math.max(wmA + 1, wmA + Math.ceil((W_target * deltaElapsed) / 60));
  const W_actual = ((wmB - wmA) * 60) / deltaElapsed;

  // 4c. throughput: 总增量(含wm增量) = T*Δ/60 -> ironDelta 补齐
  const totalDelta = Math.ceil((T_target * deltaElapsed) / 60);
  const ironDelta = totalDelta - (wmB - wmA);
  const T_actual = ((wmB - wmA) + ironDelta) * 60 / deltaElapsed;

  // 4d. galaxy 反解 dyson: 精确模拟服务端计算链
  //  服务端: saturatingMetricAdd(E/1e6, 12U, D/100, 8T, 8*1e4, 16*2e3) -> round
  //  D = dysonSwarm.generationKw + dysonSphere.generationKw,其中 sphereB 经 normMetric 大数舍入
  function serverGalaxy(sphereB) {
    const D_eff = normMetric(sphereB) + normMetric(swarmKw);
    const terms = [
      E_target / 1e6,
      normMetric(wmB) * 12,
      D_eff / 100,
      normMetric(T_actual) * 8,
      exploredSystems * 10000,
      colonizedPlanets * 2000,
    ];
    let total = 0;
    for (const t of terms) total = normMetric(total) + normMetric(t);
    return Math.round(total);
  }
  const D_est = (G_target - Math.round(E_target / 1e6 + 12 * wmB + 8 * T_actual + exploredSystems * 10000 + colonizedPlanets * 2000)) * 100 - swarmKw;
  let sphereB = null;
  for (let off = -20000; off <= 20000; off++) {
    const s = D_est + off;
    if (serverGalaxy(s) === G_target) { sphereB = s; break; }
  }
  if (sphereB === null) { await fail(`galaxy=${G_target} 无法反解出 dyson(±20000内无精确解,可调参重试)`); }
  const D_B = normMetric(sphereB) + normMetric(swarmKw);
  log(`  elapsedB=${elapsedB}  genKw=${genKwB}`);
  log(`  wmA=${wmA} wmB=${wmB}  white-rate实际=${W_actual} 目标=${W_target}`);
  log(`  ironDelta=${ironDelta}  throughput实际=${T_actual} 目标=${T_target}`);
  log(`  dyson反解=${D_B}  galaxy校验=${serverGalaxy(sphereB)} (目标${G_target})`);

  // 5. 构建 A/B 档
  log(`[5/7] 构建并上传存档 ...`);
  const stateA = JSON.parse(JSON.stringify(state0));
  const stateB = JSON.parse(JSON.stringify(state0));
  stateB.elapsedSeconds = elapsedB;
  stateB.metrics.generationKw = genKwB;
  stateB.totalProduced.universe_matrix = wmB;
  stateB.totalProduced.iron_ore = curIron + ironDelta;
  stateB.dysonSphere.generationKw = sphereB;
  // A档 = 原档不动(窗口基准);校验单调
  const bad = [];
  if (elapsedB < curElapsed - 1e-6) bad.push("elapsed");
  for (const k of new Set([...Object.keys(stateA.totalProduced ?? {}), ...Object.keys(stateB.totalProduced ?? {})])) {
    const p = Math.floor(Number(stateA.totalProduced?.[k] ?? 0));
    const c = Math.floor(Number(stateB.totalProduced?.[k] ?? 0));
    if (c < p - 1e-6) bad.push(`totalProduced.${k}(${p}->${c})`);
  }
  if (bad.length) { await fail(`单调性校验失败: ${bad.join(", ")}`); }
  const mkEnv = (state) => ({ formatVersion: envelope.formatVersion, state, checksum: null });
  const envA = mkEnv(stateA); envA.checksum = checksum(envA.formatVersion, envA.state);
  const envB = mkEnv(stateB); envB.checksum = checksum(envB.formatVersion, envB.state);
  log(`  A档 checksum=${envA.checksum}  B档 checksum=${envB.checksum}`);

  // 6. 退出 -> A -> B -> 重入
  await sleep(300);
  await reqWithRetry("/leaderboard/visibility", { method: "POST", token, body: { visible: false } });
  log("  已退出排行榜(清空旧提交)");
  await sleep(300);
  const putA = await reqWithRetry("/cloud-save?slot=main", {
    method: "PUT", token, body: { payload: JSON.stringify(envA), expectedRevision: revision },
  });
  if (putA.status !== 200) { await fail(`A档上传失败(${putA.status}): ${JSON.stringify(putA.json).slice(0, 300)}`); }
  const revB = putA.json.cloudSave.revision;
  await sleep(300);
  const putB = await reqWithRetry("/cloud-save?slot=main", {
    method: "PUT", token, body: { payload: JSON.stringify(envB), expectedRevision: revB },
  });
  if (putB.status !== 200) { await fail(`B档上传失败(${putB.status}): ${JSON.stringify(putB.json).slice(0, 300)}`); }
  log(`  A档→rev${revision + 1}  B档→rev${revB + 1}`);
  await sleep(300);
  const rejoin = await reqWithRetry("/leaderboard/visibility", { method: "POST", token, body: { visible: true } });
  if (rejoin.status !== 200 || !rejoin.json.submission) {
    await fail(`重新加入失败(${rejoin.status}): ${JSON.stringify(rejoin.json).slice(0, 400)}`);
  }
  const m = rejoin.json.submission.metrics;
  log(`  已重新加入. 服务端重算: E=${m.energyGeneratedMj} upload=${m.uploadedWhiteMatrix} white=${m.peakWhiteMatrixPerMinute} dyson=${m.peakDysonPowerKw} throughput=${m.peakThroughputPerMinute} galaxy=${m.galaxyScore}`);

  // 7. 验证
  log(`[6/7] 验证名次 ...`);
  await sleep(500);
  const results = {};
  for (const cat of CATS) {
    const r = await reqWithRetry(`/leaderboard?category=${cat}&seasonId=season_01`);
    const me = findMe(r.json.entries ?? []);
    results[cat] = me?.rank;
    await sleep(200);
  }
  log(`\n========== 结果 (目标第${N}名) ==========`);
  for (const cat of CATS) {
    const t = cat === "dyson" ? { strategy: "跟随galaxy" } : targets[cat];
    const r = results[cat];
    const ok = r === N ? "OK" : r < N ? `↑ 高于目标(${r})` : `↓ 低于目标(${r})`;
    const note = cat === "dyson" ? t.strategy : t?.note ?? "";
    log(`  ${cat.padEnd(10)} 实际#${r?.toString().padEnd(3) ?? "-"}  ${ok.padEnd(14)} ${t?.strategy ?? ""} ${note}`);
  }
  log(`[7/7] 完成. 存档rev=${revB + 1}, checksum=${envB.checksum}`);
}

main().catch((e) => { console.error("异常:", e); process.exit(1); });

