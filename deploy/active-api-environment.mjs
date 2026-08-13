import { realpathSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;

export async function readActiveApiEnvironment({ stateFile, apiRoot } = {}) {
  if (!stateFile || !apiRoot) throw new Error("active API stateFile and apiRoot are required");
  const value = JSON.parse(await readFile(path.resolve(stateFile), "utf8"));
  const activeState = value?.pendingVersion === 1
    ? value.phase === "recovering" ? value.base : value.target
    : value;
  const pendingPhase = value?.pendingVersion === 1 ? value.phase : null;
  if (!activeState || typeof activeState !== "object" || activeState.version !== 1 || !activeState.current) {
    throw new Error("active API switch state is invalid");
  }
  const releaseRoot = await realpath(path.resolve(apiRoot, "releases"));
  const releaseDirectory = await realpath(path.resolve(activeState.current.apiPath));
  const relative = path.relative(releaseRoot, releaseDirectory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || path.dirname(relative) !== "."
    || !RELEASE_ID_PATTERN.test(relative)) {
    throw new Error("active API release directory is outside the configured release root");
  }
  const port = Number(activeState.current.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("active API port is invalid");
  return Object.freeze({ releaseDirectory, port, pendingPhase });
}

function directInvocation() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (directInvocation()) {
  const [stateFile, apiRoot] = process.argv.slice(2);
  readActiveApiEnvironment({ stateFile, apiRoot }).then(
    ({ releaseDirectory, port, pendingPhase }) => process.stdout.write(`${releaseDirectory}\t${port}\t${pendingPhase ?? "steady"}\n`),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    },
  );
}
