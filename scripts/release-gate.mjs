#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPDX_NOASSERTION = "NOASSERTION";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function gitText(args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function requiredOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing required option: ${name}`);
  return args[index + 1];
}

function optionalOption(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1] ?? null;
}

function resolvedOutput(output) {
  return resolve(repositoryRoot, output);
}

async function writeJson(output, value) {
  const path = resolvedOutput(output);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return normalizePath(relative(repositoryRoot, path));
}

function sourceDate() {
  const raw = process.env.SOURCE_DATE_EPOCH;
  if (raw && /^\d+$/.test(raw)) return new Date(Number(raw) * 1_000).toISOString();
  return new Date().toISOString();
}

function npmPurl(name, version) {
  const encodedName = name.startsWith("@")
    ? `@${encodeURIComponent(name.slice(1)).replace("%2F", "/")}`
    : encodeURIComponent(name);
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function packageNameFromLockPath(lockPath, packageRecord) {
  if (typeof packageRecord.name === "string" && packageRecord.name) return packageRecord.name;
  const marker = "node_modules/";
  const index = lockPath.lastIndexOf(marker);
  return index >= 0 ? lockPath.slice(index + marker.length) : null;
}

function normalizeIntegrity(integrity) {
  if (typeof integrity !== "string") return null;
  const match = /^sha(256|384|512)-(.+)$/.exec(integrity);
  if (!match) return null;
  return { alg: `SHA-${match[1]}`, content: match[2] };
}

function lockComponents(lock, lockPath) {
  const packages = lock.packages && typeof lock.packages === "object" ? lock.packages : {};
  return Object.entries(packages)
    .filter(([path, record]) => path && record && typeof record === "object" && typeof record.version === "string")
    .map(([path, record]) => {
      const name = packageNameFromLockPath(path, record);
      if (!name) return null;
      const integrity = normalizeIntegrity(record.integrity);
      return {
        type: "library",
        name,
        version: record.version,
        purl: npmPurl(name, record.version),
        licenses: [{ license: { id: SPDX_NOASSERTION } }],
        ...(typeof record.resolved === "string" ? { externalReferences: [{ type: "distribution", url: record.resolved }] } : {}),
        ...(integrity ? { hashes: [integrity] } : {}),
        properties: [{ name: "dspidle:lockfile", value: lockPath }],
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.purl.localeCompare(right.purl));
}

export async function createCycloneDxSbom({ output, gitSha }) {
  const lockfiles = ["package-lock.json", "server/package-lock.json"];
  const components = [];
  for (const lockfile of lockfiles) {
    const lock = JSON.parse(await readFile(resolve(repositoryRoot, lockfile), "utf8"));
    components.push(...lockComponents(lock, lockfile));
  }
  const duplicates = new Set();
  const uniqueComponents = components.filter((component) => {
    const key = `${component.purl}:${component.properties[0].value}`;
    if (duplicates.has(key)) return false;
    duplicates.add(key);
    return true;
  });
  const document = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${sha256(`${gitSha}:dsp-idle-sbom`).slice(0, 8)}-${sha256(`${gitSha}:dsp-idle-sbom`).slice(8, 12)}-${sha256(`${gitSha}:dsp-idle-sbom`).slice(12, 16)}-${sha256(`${gitSha}:dsp-idle-sbom`).slice(16, 20)}-${sha256(`${gitSha}:dsp-idle-sbom`).slice(20, 32)}`,
    version: 1,
    metadata: {
      timestamp: sourceDate(),
      tools: [{ vendor: "DSPidle2", name: "release-gate.mjs", version: "1" }],
      component: {
        type: "application",
        name: "dsp-idle-network",
        version: JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8")).version,
        properties: [{ name: "dspidle:git-sha", value: gitSha }],
      },
    },
    components: uniqueComponents,
  };
  return { document, output: await writeJson(output, document) };
}

export async function verifyReleaseSource({ expectedSha, output, requireClean = true }) {
  const actualSha = gitText(["rev-parse", "HEAD"]);
  if (actualSha !== expectedSha) throw new Error(`Checked-out SHA ${actualSha} does not match required release SHA ${expectedSha}`);
  const porcelain = gitText(["status", "--porcelain"]);
  if (requireClean && porcelain) throw new Error("Release gate requires a clean source checkout before build outputs are created");
  const record = {
    formatVersion: 1,
    gitSha: actualSha,
    clean: porcelain.length === 0,
    verifiedAt: sourceDate(),
    source: "local-git-checkout",
  };
  return { record, output: await writeJson(output, record) };
}

async function readDigestSubject(path) {
  const bytes = await readFile(resolve(repositoryRoot, path));
  return {
    name: normalizePath(path),
    digest: { sha256: sha256(bytes) },
  };
}

export async function createProvenance({ output, gitSha, manifest, sbom, gateReport }) {
  const subjects = await Promise.all([manifest, sbom, gateReport].filter(Boolean).map(readDigestSubject));
  const materials = await Promise.all(["package-lock.json", "server/package-lock.json"].map(async (path) => ({
    uri: `git+https://github.com/snowsnow0926/DSPONLINE?path=${path}`,
    digest: { sha256: sha256(await readFile(resolve(repositoryRoot, path))) },
  })));
  materials.unshift({
    uri: "git+https://github.com/snowsnow0926/DSPONLINE",
    digest: { sha1: gitSha },
  });
  const document = {
    "_type": "https://in-toto.io/Statement/v1",
    subject: subjects,
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: {
      buildDefinition: {
        buildType: "https://dsponline.cn/release-gate/v1",
        externalParameters: { gitSha, releaseManifest: manifest },
        internalParameters: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        resolvedDependencies: materials,
      },
      runDetails: {
        builder: { id: process.env.GITHUB_WORKFLOW_REF ?? "local-release-gate" },
        metadata: {
          invocationId: process.env.GITHUB_RUN_ID ?? `local-${gitSha.slice(0, 12)}`,
          startedOn: sourceDate(),
          finishedOn: sourceDate(),
          reproducible: false,
        },
        byproducts: [{ name: "release-gate-report", value: gateReport }],
      },
    },
  };
  return { document, output: await writeJson(output, document) };
}

export async function verifyProvenance({ input, expectedSha }) {
  const document = JSON.parse(await readFile(resolve(repositoryRoot, input), "utf8"));
  if (document._type !== "https://in-toto.io/Statement/v1" || document.predicateType !== "https://slsa.dev/provenance/v1") {
    throw new Error("Unsupported provenance statement");
  }
  const declaredSha = document.predicate?.buildDefinition?.externalParameters?.gitSha;
  if (declaredSha !== expectedSha) throw new Error(`Provenance SHA ${declaredSha} does not match expected SHA ${expectedSha}`);
  const sourceMaterial = document.predicate?.buildDefinition?.resolvedDependencies?.find((entry) => entry.uri === "git+https://github.com/snowsnow0926/DSPONLINE");
  if (sourceMaterial?.digest?.sha1 !== expectedSha) throw new Error("Provenance source material does not bind the expected SHA");
  for (const subject of document.subject ?? []) {
    if (typeof subject?.name !== "string" || !/^[a-f0-9]{64}$/.test(subject?.digest?.sha256 ?? "")) {
      throw new Error("Provenance has an invalid subject digest");
    }
    const actual = sha256(await readFile(resolve(repositoryRoot, subject.name)));
    if (actual !== subject.digest.sha256) throw new Error(`Provenance subject digest mismatch: ${subject.name}`);
  }
  return { verifiedSubjects: document.subject.length, gitSha: expectedSha };
}

function usage() {
  return [
    "Release gate metadata tools.",
    "",
    "  node scripts/release-gate.mjs verify-source --expected-sha <sha> --output <file>",
    "  node scripts/release-gate.mjs sbom --git-sha <sha> --output <file>",
    "  node scripts/release-gate.mjs provenance --git-sha <sha> --manifest <file> --sbom <file> --gate-report <file> --output <file>",
    "  node scripts/release-gate.mjs verify-provenance --input <file> --expected-sha <sha>",
  ].join("\n");
}

async function runCli(args) {
  const [command] = args;
  if (command === "verify-source") {
    const result = await verifyReleaseSource({
      expectedSha: requiredOption(args, "--expected-sha"),
      output: requiredOption(args, "--output"),
      requireClean: !args.includes("--allow-dirty"),
    });
    console.log(result.output);
    return;
  }
  if (command === "sbom") {
    const result = await createCycloneDxSbom({
      gitSha: requiredOption(args, "--git-sha"),
      output: requiredOption(args, "--output"),
    });
    console.log(result.output);
    return;
  }
  if (command === "provenance") {
    const result = await createProvenance({
      gitSha: requiredOption(args, "--git-sha"),
      manifest: requiredOption(args, "--manifest"),
      sbom: requiredOption(args, "--sbom"),
      gateReport: optionalOption(args, "--gate-report"),
      output: requiredOption(args, "--output"),
    });
    console.log(result.output);
    return;
  }
  if (command === "verify-provenance") {
    const result = await verifyProvenance({
      input: requiredOption(args, "--input"),
      expectedSha: requiredOption(args, "--expected-sha"),
    });
    console.log(`Verified ${result.verifiedSubjects} provenance subjects for ${result.gitSha}`);
    return;
  }
  throw new Error(usage());
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
