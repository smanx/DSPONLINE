#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOTS = ["tests", "server", "deploy", "scripts", "desktop"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".cjs", ".js"]);

function extension(path) {
  const index = path.lastIndexOf(".");
  return index < 0 ? "" : path.slice(index);
}

async function collectSourceFiles(directory) {
  const absolute = resolve(repositoryRoot, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await collectSourceFiles(child));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(extension(entry.name))) files.push(child.replaceAll("\\", "/"));
  }
  return files;
}

function skipReason(line) {
  const quoted = /test\.skip\([^,]+,\s*["'`]([^"'`]+)["'`]/.exec(line);
  return quoted?.[1] ?? "Conditional skip declared without a static reason";
}

export async function findDeclaredConditionalSkips() {
  const files = (await Promise.all(SCAN_ROOTS.map(collectSourceFiles))).flat();
  const skips = [];
  for (const file of files) {
    const lines = (await readFile(resolve(repositoryRoot, file), "utf8")).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].includes("test.skip(")) continue;
      skips.push({
        file,
        line: index + 1,
        reason: skipReason(lines[index]),
        source: lines[index].trim(),
      });
    }
  }
  return skips;
}

export async function createConditionalSkipReport({ output, gitSha }) {
  const declaredSkips = await findDeclaredConditionalSkips();
  const report = {
    formatVersion: 1,
    gitSha,
    generatedAt: new Date().toISOString(),
    policy: {
      coreGateRule: "Core release gates must not skip for missing real-player fixtures. Conditional fixture tests remain documented and are not evidence of release acceptance.",
      releaseAgentRule: "Any skipped test in a candidate run must be reported with its framework reason and assessed before release approval.",
    },
    declaredConditionalSkips: declaredSkips,
  };
  const target = resolve(repositoryRoot, output);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { report, output: relative(repositoryRoot, target).replaceAll("\\", "/") };
}

async function runCli(args) {
  if (args[0] !== "--output" || !args[1] || args[2] !== "--git-sha" || !args[3]) {
    throw new Error("Usage: node scripts/release-gate-skip-report.mjs --output <file> --git-sha <sha>");
  }
  const result = await createConditionalSkipReport({ output: args[1], gitSha: args[3] });
  console.log(`${result.output}: ${result.report.declaredConditionalSkips.length} declared conditional skips`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
