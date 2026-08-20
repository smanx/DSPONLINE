import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { DEFAULT_STARTUP_BUDGET, staticClosure, verifyStartupBudget } from "./verify-startup-budget.mjs";

function manifest() {
  return {
    "index.html": {
      file: "assets/index.js",
      isEntry: true,
      imports: ["_react.js"],
      dynamicImports: ["src/GameLauncher.tsx", "src/FactoryRuntime.tsx", "src/i18n/legacyTranslations.ts"],
      css: ["assets/index.css"],
    },
    "_react.js": { file: "assets/react.js", name: "react-vendor" },
    "src/GameLauncher.tsx": {
      file: "assets/menu.js",
      src: "src/GameLauncher.tsx",
      isDynamicEntry: true,
      imports: ["_react.js", "_menu-icon.js"],
      css: ["assets/menu.css"],
    },
    "_menu-icon.js": { file: "assets/menu-icon.js" },
    "src/FactoryRuntime.tsx": {
      file: "assets/factory.js",
      src: "src/FactoryRuntime.tsx",
      isDynamicEntry: true,
      imports: ["_game-core.js", "_flow-vendor.js", "_storage.js"],
    },
    "_game-core.js": { file: "assets/game-core.js", name: "game-core" },
    "_flow-vendor.js": { file: "assets/flow-vendor.js", name: "flow-vendor" },
    "_storage.js": { file: "assets/storage.js", name: "storage" },
    "src/i18n/legacyTranslations.ts": {
      file: "assets/legacy.js",
      src: "src/i18n/legacyTranslations.ts",
      isDynamicEntry: true,
    },
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "dsp-startup-budget-"));
  const dist = path.join(root, "dist");
  await mkdir(path.join(dist, "assets"), { recursive: true });
  const contents = {
    "assets/index.js": "export const startup = true;",
    "assets/react.js": "export const react = true;",
    "assets/index.css": "body { color: #000; }",
    "assets/menu.js": "export const menu = true;",
    "assets/menu-icon.js": "export const icon = true;",
    "assets/menu.css": ".menu { display: block; }",
    "assets/factory.js": "factory payload".repeat(100),
    "assets/game-core.js": "game payload".repeat(100),
    "assets/flow-vendor.js": "flow payload".repeat(100),
    "assets/storage.js": "storage payload".repeat(100),
    "assets/legacy.js": "translation payload".repeat(100),
  };
  await Promise.all(Object.entries(contents).map(([relativePath, contentsValue]) => writeFile(path.join(dist, relativePath), contentsValue)));
  return { root, dist };
}

test("static closure excludes dynamically imported factory and language work", () => {
  const startup = staticClosure(manifest(), ["index.html"]);
  assert.deepEqual([...startup].sort(), ["_react.js", "index.html"]);
});

test("startup budget measures HTML and complete main-menu closures without factory chunks", async () => {
  const temporary = await fixture();
  try {
    const result = await verifyStartupBudget({ manifest: manifest(), distRoot: temporary.dist });
    assert.deepEqual(result.failures, []);
    assert.equal(result.report.forbiddenStartupModules.length, 0);
    assert.equal(result.report.startupModuleKeys.includes("src/FactoryRuntime.tsx"), false);
    assert.equal(result.report.startupModuleKeys.includes("src/i18n/legacyTranslations.ts"), false);
    assert.equal(result.report.menuModuleKeys.includes("src/GameLauncher.tsx"), true);
    assert.equal(result.report.menuModuleKeys.includes("src/FactoryRuntime.tsx"), false);
    assert.ok(result.report.menu.totalGzipBytes > result.report.startup.totalGzipBytes);
  } finally {
    await rm(temporary.root, { recursive: true, force: true });
  }
});

test("startup budget fails if a forbidden runtime becomes statically reachable", async () => {
  const temporary = await fixture();
  try {
    const broken = manifest();
    broken["index.html"].imports.push("src/FactoryRuntime.tsx");
    const result = await verifyStartupBudget({ manifest: broken, distRoot: temporary.dist });
    assert.match(result.failures.join("\n"), /FactoryRuntime/);
    assert.match(result.failures.join("\n"), /game-core/);
    assert.match(result.failures.join("\n"), /flow-vendor/);
    assert.match(result.failures.join("\n"), /storage/);
  } finally {
    await rm(temporary.root, { recursive: true, force: true });
  }
});

test("startup budget reports transfer regressions with clear limits", async () => {
  const temporary = await fixture();
  try {
    const result = await verifyStartupBudget({
      manifest: manifest(),
      distRoot: temporary.dist,
      budget: {
        ...DEFAULT_STARTUP_BUDGET,
        maxStartupGzipBytes: 1,
        maxMenuGzipBytes: 1,
      },
    });
    assert.match(result.failures.join("\n"), /startup total gzip/);
    assert.match(result.failures.join("\n"), /complete menu gzip/);
  } finally {
    await rm(temporary.root, { recursive: true, force: true });
  }
});
