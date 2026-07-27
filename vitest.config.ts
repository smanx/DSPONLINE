import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // The large deterministic suites can crash Windows V8 forks under parallel memory pressure.
    maxWorkers: 1,
  },
});
