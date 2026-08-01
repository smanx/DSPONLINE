import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const fixture = process.argv.find((argument) => argument.startsWith("--fixture="))?.slice(10);
const runs = Math.max(3, Number(process.argv.find((argument) => argument.startsWith("--runs="))?.slice(7) ?? 20));
if (!fixture) throw new Error("用法：node scripts/benchmark-canvas-batch.mjs --fixture=<存档 JSON>");
const parsed = JSON.parse(await readFile(fixture, "utf8"));
const state = parsed.state ?? parsed;
const entities = new Map((state.entities ?? []).map((entity) => [entity.id, entity]));
const planetId = state.activePlanetId ?? "home";
const run = () => {
  const packed = [];
  let segments = 0;
  for (const belt of state.belts ?? []) {
    if (belt.planetId !== planetId) continue;
    const source = entities.get(belt.source);
    const target = entities.get(belt.target);
    if (!source || !target) continue;
    packed.push(source.position.x, source.position.y, target.position.x, target.position.y);
    segments += 1;
  }
  return { segments, bytes: packed.length * 4 };
};
for (let index = 0; index < 3; index += 1) run();
const samples = [];
for (let index = 0; index < runs; index += 1) {
  const startedAt = performance.now();
  const result = run();
  samples.push({ ms: performance.now() - startedAt, ...result });
}
samples.sort((a, b) => a.ms - b.ms);
const median = samples[Math.floor(samples.length / 2)];
console.log(`CANVAS_LINE_BATCH_BENCHMARK ${JSON.stringify({ fixture, planetId, entities: state.entities?.length ?? 0, belts: state.belts?.length ?? 0, segments: median.segments, packedBytes: median.bytes, medianMs: Number(median.ms.toFixed(3)), p95Ms: Number(samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)].ms.toFixed(3)), runs })}`);
