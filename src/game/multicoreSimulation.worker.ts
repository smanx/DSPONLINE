/// <reference lib="webworker" />

import { runPlanetSimulationPhase } from "./engine";
import type { PlanetPhaseWorkerRequest, PlanetPhaseWorkerResponse } from "./multicoreSimulation";
import { applyContentPackRuntimeSnapshot } from "./contentPacks";

let activeRegistryFingerprint = "core";

self.onmessage = (event: MessageEvent<PlanetPhaseWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.registryFingerprint !== activeRegistryFingerprint) {
      if (!request.registry || request.registry.fingerprint !== request.registryFingerprint) {
        throw new Error("星球分区 Worker 缺少匹配的内容包注册表");
      }
      applyContentPackRuntimeSnapshot(request.registry);
      activeRegistryFingerprint = request.registryFingerprint;
    }
    const reception = {
      efficiency: request.reception.efficiency,
      receiverLoadKw: request.reception.receiverLoadKw,
      allocationByEntity: new Map(request.reception.allocationByEntity),
      efficiencyByEntity: new Map(request.reception.efficiencyByEntity),
      rayPowerByPlanet: new Map(request.reception.rayPowerByPlanet),
    };
    const result = runPlanetSimulationPhase(
      request.state,
      request.seconds,
      request.planetId,
      reception,
      { allowanceByBelt: new Map(), outputCredits: new Map(request.outputCredits) },
      undefined,
      undefined,
      request.batchPowerStorage,
      request.batchConstructionAutomation,
    );
    self.postMessage({ id: request.id, ok: true, result } satisfies PlanetPhaseWorkerResponse);
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies PlanetPhaseWorkerResponse);
  }
};

export {};
