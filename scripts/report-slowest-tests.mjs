#!/usr/bin/env node
// 测试耗时监控：解析 Playwright JSON 报告，按 duration 降序输出最慢测试。
// 用法：
//   node scripts/report-slowest-tests.mjs [报告1.json] [报告2.json] ... [--limit 20]
// 默认读取 test-results/playwright-report.json；支持多份 shard 报告合并排序。
import { readFileSync } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const limitIndex = argv.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : 20;
  let files = argv.filter((a, i) => a !== "--limit" && i !== limitIndex + 1);
  if (!files.length) files = ["test-results/playwright-report.json"];
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("--limit 必须为正整数");
  return { files, limit };
}

function collectEntries(report) {
  const entries = [];
  for (const suite of report.suites ?? []) {
    const file = suite.file ?? "unknown";
    for (const spec of suite.specs ?? []) {
      const title = spec.title ?? "unnamed";
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          entries.push({
            file: path.relative(process.cwd(), file),
            title,
            status: result.status ?? "unknown",
            duration: result.duration ?? 0,
          });
        }
      }
    }
  }
  return entries;
}

const { files, limit } = parseArgs(process.argv.slice(2));
const all = [];
for (const file of files) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`无法读取报告 ${file}: ${error.message}`);
    continue;
  }
  all.push(...collectEntries(parsed));
}

if (!all.length) {
  console.log("未找到可解析的 Playwright 测试条目。请先运行 `npm run test:e2e` 生成 JSON 报告。");
  process.exit(0);
}

all.sort((a, b) => b.duration - a.duration);
const slowest = all.slice(0, limit);
const totalDuration = all.reduce((sum, e) => sum + e.duration, 0);

console.log(`\n最慢 ${slowest.length} 个测试（按耗时降序，总测试数 ${all.length}，累计耗时 ${(totalDuration / 60000).toFixed(1)} 分钟）\n`);
console.log("耗时(ms)  状态     文件 : 测试名");
for (const entry of slowest) {
  const seconds = (entry.duration / 1000).toFixed(1).padStart(8);
  const status = entry.status.padEnd(9);
  console.log(`${seconds}  ${status} ${entry.file} › ${entry.title.slice(0, 100)}`);
}
