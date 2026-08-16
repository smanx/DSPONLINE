#!/usr/bin/env node
// 增量测试运行器：只跑本次 Git 工作区/暂存区中“确实有改动”的测试文件。
// 用途：开发时快速回归，避免每次改动都跑 20 分钟全量。
// 注意：本脚本只覆盖“测试文件本身被改动”的场景；
//       如果只改了源码（未改测试文件），请运行 `npm run test:quick` 或全量门禁。
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

function git(args) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// 收集已跟踪改动 + 暂存改动 + 未跟踪文件
const changed = new Set([
  ...git(["diff", "--name-only"]),
  ...git(["diff", "--cached", "--name-only"]),
  ...git(["ls-files", "--others", "--exclude-standard"]),
]);

const classify = {
  unit: (f) => /^src\/.*\.test\.tsx?$/.test(f),
  server: (f) => /^server\/.*\.test\.mjs$/.test(f),
  e2e: (f) => /^tests\/e2e\/.*\.spec\.ts$/.test(f),
  ops: (f) => /^deploy\/.*\.test\.mjs$/.test(f),
  native: (f) => /^(scripts|desktop|android)\/.*\.(test\.(mjs|ts|cjs)|spec\.cjs)$/.test(f),
};

const groups = { unit: [], server: [], e2e: [], ops: [], native: [] };
for (const file of changed) {
  for (const [name, matcher] of Object.entries(classify)) {
    if (matcher(file)) groups[name].push(file);
  }
}

const runs = [];
if (groups.unit.length) runs.push(["npm", ["exec", "--", "vitest", "run", ...groups.unit]]);
if (groups.server.length) runs.push(["node", ["--test", "--test-concurrency=4", ...groups.server.map((f) => path.join(repoRoot, f))]]);
if (groups.e2e.length) runs.push(["npx", ["playwright", "test", ...groups.e2e]]);
if (groups.ops.length) runs.push(["node", ["--test", "--test-concurrency=2", ...groups.ops.map((f) => path.join(repoRoot, f))]]);
if (groups.native.length) runs.push(["node", ["--test", ...groups.native.map((f) => path.join(repoRoot, f))]]);

if (!runs.length) {
  console.log("没有检测到改动的测试文件。若只改了源码，请运行 `npm run test:quick` 或全量门禁。");
  process.exit(0);
}

for (const [cmd, args] of runs) {
  console.log(`\n>>> ${cmd} ${args.join(" ")}`);
  try {
    execFileSync(cmd, args, { cwd: repoRoot, stdio: "inherit" });
  } catch (error) {
    console.error(`\n>>> 失败：${cmd} ${args.join(" ")}`);
    process.exit(1);
  }
}
console.log("\n增量测试全部通过。");
