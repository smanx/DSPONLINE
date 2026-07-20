import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  ViewportPortal,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type NodeMouseHandler,
  type OnConnectStartParams,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BuildingPlacementCursor,
  CargoCursor,
  ConstructionDock,
  HeaderControls,
  InspectorPanel,
  PlanetNavigator,
  ResourceRail,
} from "./components/GamePanels";
import { NODE_TYPES, type FactoryFlowNode, type FactoryNodeData } from "./components/FactoryNodes";
import { EDGE_TYPES, type FactoryFlowEdge } from "./components/FactoryEdges";
import { BlueprintPlacementCursor, BlueprintWorkspace, CanvasSelectionTools, SelectionToolbar } from "./components/BlueprintWorkspace";
import type { OperationsTab } from "./components/OperationsWorkspace";
import { ITEMS, RECIPES, getBeltConstructionId, getBuilding, getBuildingUpgradeTarget, getConstructionDefinition, getPlanet, getTechnology } from "./game/content";
import { getFactoryAlerts, type FactoryAlert } from "./game/alerts";
import {
  addBuildingToGroup,
  addDysonLayer,
  addDysonNode,
  adjustStationDrones,
  adjustStationWarpers,
  adjustStationVessels,
  advanceSimulation,
  connectBelt,
  canPlaceBlueprint,
  canUpgradeEntities,
  clearDysonShells,
  connectDysonNodes,
  craftConstruction,
  createBlueprint,
  createStandardDysonLayer,
  createInitialState,
  dropCargoToEntity,
  dropCargoToTray,
  exploreStarSystem,
  getAcceptedInputs,
  getBeltCapacity,
  getEntityOperatingStatus,
  getProducedOutputs,
  handcraftRecipe,
  installSprayCoater,
  installSprayCoaters,
  installMiner,
  manualMine,
  moveEntityInputToEntity,
  moveEntityInputToTray,
  moveEntityOutputToEntity,
  moveEntityOutputToTray,
  moveEntities,
  moveTrayItemToEntity,
  pickFromEntity,
  pickFromEntityInput,
  pickFromTray,
  placeBuilding,
  placeBlueprint,
  removeBelt,
  removeBlueprint,
  removeDysonLayer,
  removeDysonNode,
  removeEntity,
  removeEntities,
  removeQueuedTechnology,
  selectTechnology,
  setBeltPriority,
  setActivePlanet,
  setEntityRecipe,
  setEntitiesRecipe,
  setActiveDysonLayer,
  setDysonLayerOrbit,
  setEnergyMode,
  setFuelItem,
  setLogisticsItem,
  setPaused,
  setProliferatorConfiguration,
  setEntitiesProliferatorConfiguration,
  setStationMode,
  setStationMinimumLoad,
  setStationWarpEnabled,
  setSplitterMode,
  upgradeBelt,
  upgradeEntities,
  upgradeEntity,
  upgradeSorter,
  getBlueprintEligibleEntityIds,
  autoConnectDysonLayer,
  planDysonShell,
  renameBlueprint,
} from "./game/engine";
import { getAchievement, getNewAchievementIds, unlockAchievements } from "./game/progression";
import { getCampaignTask, getCampaignTaskRequirements, selectCampaignTask, syncCampaignProgress, type CampaignNavigation } from "./game/campaign";
import { clearGame, clearGameSlot, exportGame, getSaveSlotSummaries, importGame, loadGame, loadGameSlot, saveGame, saveGameSlot, type OfflineReport, type SaveSlotId } from "./game/storage";
import type { BeltTier, BuildingId, CampaignTaskId, DraggedItemSourceKind, EnergyMode, GameSettings, GameState, ItemId, PlacementCount, PlanetId, ProliferatorMode, ProliferatorTier, RecipeId, StarSystemId, StationMinimumLoad } from "./game/types";
import type { SimulationWorkerRequest, SimulationWorkerResponse } from "./game/simulation.worker";

type InspectorTab = "inspect" | "fabricate";

interface AlignmentGuides {
  x: number | null;
  y: number | null;
}

interface ConnectionDraft {
  nodeId: string;
  itemId: ItemId;
  handleType: "source" | "target";
}

type InteractionSound = "confirm" | "complete" | "alert" | "place" | "connect" | "upgrade" | "remove" | "travel" | "launch";

interface RewardFlight {
  id: string;
  symbol: string;
  label: string;
  amount: number;
  color: string;
}

interface PlanetTransition {
  id: number;
  from: PlanetId;
  to: PlanetId;
}

const FLOW_GRID = 20;
const HISTORY_LIMIT = 40;

function snapFlowPosition(position: { x: number; y: number }) {
  return {
    x: Math.round(position.x / FLOW_GRID) * FLOW_GRID,
    y: Math.round(position.y / FLOW_GRID) * FLOW_GRID,
  };
}

const RecipeWorkspace = lazy(() => import("./components/RecipeWorkspace").then((module) => ({ default: module.RecipeWorkspace })));
const StatisticsWorkspace = lazy(() => import("./components/StatisticsWorkspace").then((module) => ({ default: module.StatisticsWorkspace })));
const StarMapWorkspace = lazy(() => import("./components/StarMapWorkspace").then((module) => ({ default: module.StarMapWorkspace })));
const DysonPlannerWorkspace = lazy(() => import("./components/DysonPlannerWorkspace").then((module) => ({ default: module.DysonPlannerWorkspace })));
const OfflineReportWorkspace = lazy(() => import("./components/OfflineReportWorkspace").then((module) => ({ default: module.OfflineReportWorkspace })));
const OperationsWorkspace = lazy(() => import("./components/OperationsWorkspace").then((module) => ({ default: module.OperationsWorkspace })));
const TechnologyWorkspace = lazy(() => import("./components/TechnologyWorkspace").then((module) => ({ default: module.TechnologyWorkspace })));
const CampaignWorkspace = lazy(() => import("./components/CampaignWorkspace").then((module) => ({ default: module.CampaignWorkspace })));

function WorkspaceLoading() {
  return <div className="workspace-loading" role="status"><i /><span>正在载入工作区</span></div>;
}

function parseHandleItem(handle: string | null | undefined): ItemId | null {
  if (!handle) return null;
  const [, itemId] = handle.split(":");
  return itemId && itemId in ITEMS ? itemId as ItemId : null;
}

function minerPlacementHint(buildingId: BuildingId): string {
  if (buildingId === "oil_extractor") return "原油萃取站需要部署在原油涌泉上";
  if (buildingId === "water_pump") return "抽水站需要部署在水或硫酸海洋上";
  return "采矿机需要部署在固体资源矿脉上";
}

function FactoryGame() {
  const [loaded] = useState(loadGame);
  const [game, setGame] = useState(loaded.state);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [selectedBeltId, setSelectedBeltId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<BuildingId | null>(null);
  const [beltTier, setBeltTier] = useState<BeltTier>(1);
  const [placementCount, setPlacementCount] = useState<PlacementCount>(1);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("inspect");
  const [mobilePanel, setMobilePanel] = useState<"resources" | "inspector" | null>(null);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [technologyOpen, setTechnologyOpen] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [starMapOpen, setStarMapOpen] = useState(false);
  const [blueprintsOpen, setBlueprintsOpen] = useState(false);
  const [dysonPlannerOpen, setDysonPlannerOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignFocusItemId, setCampaignFocusItemId] = useState<ItemId | null>(null);
  const [campaignFocusTechId, setCampaignFocusTechId] = useState<GameState["research"]["selectedTechId"]>(null);
  const [operationsTab, setOperationsTab] = useState<OperationsTab>("alerts");
  const [offlineReport, setOfflineReport] = useState<OfflineReport | null>(loaded.offlineReport);
  const [saveSlots, setSaveSlots] = useState(getSaveSlotSummaries);
  const [blueprintPlacementId, setBlueprintPlacementId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [miningEntityId, setMiningEntityId] = useState<string | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuides>({ x: null, y: null });
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [connectionHint, setConnectionHint] = useState<{ label: string; tone: "ready" | "blocked" } | null>(null);
  const [viewportZoom, setViewportZoom] = useState(0.84);
  const [highlightedTaskId, setHighlightedTaskId] = useState<CampaignTaskId | null>(null);
  const [rewardFlights, setRewardFlights] = useState<RewardFlight[]>([]);
  const [planetTransition, setPlanetTransition] = useState<PlanetTransition | null>(null);
  const [simulationWorkerActive, setSimulationWorkerActive] = useState(false);
  const [, setHistoryRevision] = useState(0);
  const [nodes, setNodes, onNodesChange] = useNodesState<FactoryFlowNode>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const gameRef = useRef(game);
  const completedTechCountRef = useRef(game.research.completedTechIds.length);
  const achievementCountRef = useRef(game.achievements.unlockedIds.length);
  const campaignCompletedCountRef = useRef(game.campaign.completedTaskIds.length);
  const launchCountRef = useRef({ sails: game.dysonSwarm.totalLaunched, rockets: game.dysonSphere.totalRocketsLaunched });
  const miningTimerRef = useRef<number | null>(null);
  const nodeDragActiveRef = useRef(false);
  const factoryCanvasRef = useRef<HTMLElement | null>(null);
  const pointerRef = useRef(pointer);
  const undoStackRef = useRef<GameState[]>([]);
  const redoStackRef = useRef<GameState[]>([]);
  const selectedEntityIdsRef = useRef<string[]>([]);
  const selectedBeltIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const simulationWorkerRef = useRef<Worker | null>(null);
  const simulationWorkerDisabledRef = useRef(false);
  const simulationSubmissionRef = useRef<{ id: number; state: GameState; seconds: number } | null>(null);
  const simulationPendingSecondsRef = useRef(0);
  const simulationRequestIdRef = useRef(0);
  const { screenToFlowPosition, setCenter, setViewport, fitView, getViewport } = useReactFlow();

  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { selectedEntityIdsRef.current = selectedEntityIds; }, [selectedEntityIds]);
  useEffect(() => { selectedBeltIdRef.current = selectedBeltId; }, [selectedBeltId]);
  useEffect(() => { pointerRef.current = pointer; }, [pointer]);

  const playTone = useCallback((kind: InteractionSound, force = false) => {
    if (!force && !gameRef.current.settings.soundEnabled) return;
    const context = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = context;
    if (context.state === "suspended") void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const profile: Record<InteractionSound, { frequency: number; target: number; duration: number; type: OscillatorType; gain: number }> = {
      confirm: { frequency: 560, target: 640, duration: 0.18, type: "sine", gain: 0.05 },
      complete: { frequency: 780, target: 1040, duration: 0.22, type: "sine", gain: 0.055 },
      alert: { frequency: 310, target: 250, duration: 0.24, type: "triangle", gain: 0.05 },
      place: { frequency: 210, target: 360, duration: 0.12, type: "square", gain: 0.032 },
      connect: { frequency: 420, target: 720, duration: 0.16, type: "sine", gain: 0.05 },
      upgrade: { frequency: 480, target: 920, duration: 0.24, type: "triangle", gain: 0.045 },
      remove: { frequency: 360, target: 150, duration: 0.16, type: "sawtooth", gain: 0.026 },
      travel: { frequency: 180, target: 620, duration: 0.42, type: "sine", gain: 0.045 },
      launch: { frequency: 130, target: 880, duration: 0.34, type: "sawtooth", gain: 0.035 },
    };
    const sound = profile[kind];
    const frequency = sound.frequency;
    oscillator.type = sound.type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(sound.target, context.currentTime + sound.duration * 0.78);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(sound.gain, context.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + sound.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + sound.duration + 0.02);
  }, []);

  const commitGame = useCallback((updater: (current: GameState) => GameState) => {
    setGame((current) => {
      const next = updater(current);
      if (next === current) return current;
      undoStackRef.current.push(current);
      if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift();
      redoStackRef.current = [];
      setHistoryRevision((revision) => revision + 1);
      return next;
    });
  }, []);

  const undoGame = useCallback(() => {
    setGame((current) => {
      const previous = undoStackRef.current.pop();
      if (!previous) return current;
      redoStackRef.current.push(current);
      setHistoryRevision((revision) => revision + 1);
      setNotice("已撤销上一步工厂操作");
      return previous;
    });
  }, []);

  const redoGame = useCallback(() => {
    setGame((current) => {
      const next = redoStackRef.current.pop();
      if (!next) return current;
      undoStackRef.current.push(current);
      setHistoryRevision((revision) => revision + 1);
      setNotice("已重做工厂操作");
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      simulationWorkerDisabledRef.current = true;
      return;
    }
    const worker = new Worker(new URL("./game/simulation.worker.ts", import.meta.url), { type: "module", name: "factory-simulation" });
    simulationWorkerRef.current = worker;
    setSimulationWorkerActive(true);
    worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
      const submission = simulationSubmissionRef.current;
      if (!submission || event.data.id !== submission.id) return;
      simulationSubmissionRef.current = null;
      setGame((current) => {
        if (current !== submission.state) {
          simulationPendingSecondsRef.current += submission.seconds;
          return current;
        }
        gameRef.current = event.data.state;
        return event.data.state;
      });
    };
    worker.onerror = () => {
      const submission = simulationSubmissionRef.current;
      if (submission) simulationPendingSecondsRef.current += submission.seconds;
      simulationSubmissionRef.current = null;
      simulationWorkerDisabledRef.current = true;
      simulationWorkerRef.current = null;
      setSimulationWorkerActive(false);
      worker.terminate();
    };
    return () => {
      worker.terminate();
      simulationWorkerRef.current = null;
      simulationSubmissionRef.current = null;
    };
  }, []);

  useEffect(() => {
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const seconds = Math.min(1, Math.max(0, (now - previous) / 1000)) * game.settings.simulationSpeed;
      previous = now;
      simulationPendingSecondsRef.current += seconds;
      const worker = simulationWorkerRef.current;
      if (worker && !simulationWorkerDisabledRef.current) {
        if (simulationSubmissionRef.current) return;
        const simulationSeconds = simulationPendingSecondsRef.current;
        simulationPendingSecondsRef.current = 0;
        const request: SimulationWorkerRequest = {
          id: simulationRequestIdRef.current + 1,
          state: gameRef.current,
          seconds: simulationSeconds,
        };
        simulationRequestIdRef.current = request.id;
        simulationSubmissionRef.current = request;
        try {
          worker.postMessage(request);
        } catch {
          simulationSubmissionRef.current = null;
          simulationWorkerDisabledRef.current = true;
          simulationWorkerRef.current = null;
          setSimulationWorkerActive(false);
          worker.terminate();
          setGame((current) => advanceSimulation(current, simulationSeconds));
        }
        return;
      }
      const simulationSeconds = simulationPendingSecondsRef.current;
      simulationPendingSecondsRef.current = 0;
      setGame((current) => advanceSimulation(current, simulationSeconds));
    }, game.settings.performanceMode ? 250 : 100);
    return () => window.clearInterval(timer);
  }, [game.settings.performanceMode, game.settings.simulationSpeed]);

  useEffect(() => {
    const timer = window.setInterval(() => saveGame(gameRef.current), game.settings.autosaveIntervalSeconds * 1000);
    const saveNow = () => saveGame(gameRef.current);
    window.addEventListener("beforeunload", saveNow);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("beforeunload", saveNow);
      saveNow();
    };
  }, [game.settings.autosaveIntervalSeconds]);

  useEffect(() => () => { if (audioContextRef.current) void audioContextRef.current.close(); }, []);

  useEffect(() => {
    const updatePointer = (event: PointerEvent | DragEvent) => setPointer({ x: event.clientX, y: event.clientY });
    window.addEventListener("pointermove", updatePointer);
    window.addEventListener("dragover", updatePointer);
    return () => {
      window.removeEventListener("pointermove", updatePointer);
      window.removeEventListener("dragover", updatePointer);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const count = game.research.completedTechIds.length;
    if (count > completedTechCountRef.current) {
      const technology = getTechnology(game.research.completedTechIds.at(-1));
      if (technology) {
        setNotice(`${technology.name}研究完成`);
        playTone("complete");
      }
    }
    completedTechCountRef.current = count;
  }, [game.research.completedTechIds, playTone]);

  useEffect(() => {
    if (getNewAchievementIds(game).length === 0) return;
    setGame((current) => unlockAchievements(current).state);
  }, [game]);

  useEffect(() => {
    const count = game.achievements.unlockedIds.length;
    if (count > achievementCountRef.current) {
      const achievement = getAchievement(game.achievements.unlockedIds.at(-1));
      if (achievement) setNotice(`成就解锁：${achievement.name}`);
      playTone("complete");
    }
    achievementCountRef.current = count;
  }, [game.achievements.unlockedIds, playTone]);

  useEffect(() => {
    const synced = syncCampaignProgress(game);
    if (synced !== game) setGame(synced);
  }, [game]);

  useEffect(() => {
    const completed = game.campaign.completedTaskIds;
    if (completed.length > campaignCompletedCountRef.current) {
      const task = getCampaignTask(completed.at(-1));
      if (task) {
        setNotice(`任务完成：${task.title}`);
        setRewardFlights((task.rewards ?? []).map((reward, index) => {
          const item = reward.itemId ? ITEMS[reward.itemId] : null;
          const construction = reward.constructionId ? getConstructionDefinition(reward.constructionId) : null;
          return {
            id: `${task.id}_${index}_${completed.length}`,
            symbol: item?.symbol ?? "建",
            label: item?.name ?? construction?.name ?? "任务奖励",
            amount: reward.amount,
            color: item?.color ?? "#d7b85d",
          };
        }));
        playTone("complete");
      }
    }
    campaignCompletedCountRef.current = completed.length;
  }, [game.campaign.completedTaskIds, playTone]);

  useEffect(() => {
    if (rewardFlights.length === 0) return;
    const timer = window.setTimeout(() => setRewardFlights([]), 1500);
    return () => window.clearTimeout(timer);
  }, [rewardFlights]);

  useEffect(() => {
    const current = { sails: game.dysonSwarm.totalLaunched, rockets: game.dysonSphere.totalRocketsLaunched };
    if (current.sails > launchCountRef.current.sails || current.rockets > launchCountRef.current.rockets) playTone("launch");
    launchCountRef.current = current;
  }, [game.dysonSphere.totalRocketsLaunched, game.dysonSwarm.totalLaunched, playTone]);

  useEffect(() => {
    if (!planetTransition) return;
    const timer = window.setTimeout(() => setPlanetTransition(null), 760);
    return () => window.clearTimeout(timer);
  }, [planetTransition]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement || Boolean(target?.isContentEditable);
      const commandKey = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (!editing && commandKey && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redoGame();
        else undoGame();
      } else if (!editing && commandKey && key === "y") {
        event.preventDefault();
        redoGame();
      } else if (event.key === "Escape") {
        setPlacement(null);
        setTechnologyOpen(false);
        setStatisticsOpen(false);
        setRecipesOpen(false);
        setStarMapOpen(false);
        setBlueprintsOpen(false);
        setDysonPlannerOpen(false);
        setOperationsOpen(false);
        setCampaignOpen(false);
        setCampaignFocusItemId(null);
        setCampaignFocusTechId(null);
        setOfflineReport(null);
        setBlueprintPlacementId(null);
        setSelectionMode(false);
        setSelectedEntityIds([]);
        setSelectedBeltId(null);
        setGame((current) => dropCargoToTray(current));
      } else if (event.key === "Delete" && !editing && !document.querySelector('[role="dialog"]')) {
        const entityIds = selectedEntityIdsRef.current.filter((entityId) =>
          gameRef.current.entities.some((entity) => entity.id === entityId && entity.kind !== "vein"));
        const beltId = selectedBeltIdRef.current;
        if (entityIds.length > 0) {
          event.preventDefault();
          commitGame((current) => removeEntities(current, entityIds));
          setSelectedEntityIds([]);
          setNotice(`已回收 ${entityIds.length} 个所选设备`);
          playTone("remove");
        } else if (beltId) {
          event.preventDefault();
          commitGame((current) => removeBelt(current, beltId));
          setSelectedBeltId(null);
          setNotice("所选运输线已回收");
          playTone("remove");
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commitGame, playTone, redoGame, undoGame]);

  const onMiningStop = useCallback(() => {
    if (miningTimerRef.current != null) window.clearInterval(miningTimerRef.current);
    miningTimerRef.current = null;
    setMiningEntityId(null);
  }, []);

  const onMiningStart = useCallback((entityId: string) => {
    if (miningTimerRef.current != null) window.clearInterval(miningTimerRef.current);
    setMiningEntityId(entityId);
    setGame((current) => manualMine(current, entityId, 1));
    miningTimerRef.current = window.setInterval(() => {
      setGame((current) => manualMine(current, entityId, 1));
    }, 320);
  }, []);

  useEffect(() => {
    window.addEventListener("pointerup", onMiningStop);
    window.addEventListener("pointercancel", onMiningStop);
    window.addEventListener("blur", onMiningStop);
    return () => {
      window.removeEventListener("pointerup", onMiningStop);
      window.removeEventListener("pointercancel", onMiningStop);
      window.removeEventListener("blur", onMiningStop);
      if (miningTimerRef.current != null) window.clearInterval(miningTimerRef.current);
    };
  }, [onMiningStop]);

  const onPickOutput = useCallback((entityId: string, itemId: ItemId) => {
    setGame((current) => pickFromEntity(current, entityId, itemId));
  }, []);

  const onPickInput = useCallback((entityId: string, itemId: ItemId) => {
    setGame((current) => pickFromEntityInput(current, entityId, itemId));
  }, []);

  const onDropCargo = useCallback((entityId: string) => {
    setGame((current) => dropCargoToEntity(current, entityId));
  }, []);

  const onDropDraggedItem = useCallback((
    targetEntityId: string,
    itemId: ItemId,
    sourceKind: DraggedItemSourceKind,
    sourceId?: string,
  ) => {
    setGame((current) => sourceKind === "node" && sourceId
      ? moveEntityOutputToEntity(current, sourceId, targetEntityId, itemId)
      : sourceKind === "node-input" && sourceId
        ? moveEntityInputToEntity(current, sourceId, targetEntityId, itemId)
        : moveTrayItemToEntity(current, targetEntityId, itemId));
  }, []);

  const onInstallMiner = useCallback((entityId: string, count: PlacementCount) => {
    if (installMiner(gameRef.current, entityId, count) !== gameRef.current) playTone("place");
    commitGame((current) => installMiner(current, entityId, count));
    setPlacement(null);
  }, [commitGame, playTone]);

  const onAddBuilding = useCallback((entityId: string, buildingId: BuildingId, count: PlacementCount) => {
    if (addBuildingToGroup(gameRef.current, entityId, buildingId, count) !== gameRef.current) playTone("place");
    commitGame((current) => addBuildingToGroup(current, entityId, buildingId, count));
    setPlacement(null);
  }, [commitGame, playTone]);

  const onRecipeChange = useCallback((entityId: string, recipeId: RecipeId) => {
    commitGame((current) => setEntityRecipe(current, entityId, recipeId));
  }, [commitGame]);

  const onFuelChange = useCallback((entityId: string, itemId: ItemId) => {
    commitGame((current) => setFuelItem(current, entityId, itemId));
  }, [commitGame]);

  const onEnergyModeChange = useCallback((entityId: string, mode: EnergyMode) => {
    commitGame((current) => setEnergyMode(current, entityId, mode));
  }, [commitGame]);

  const onPlanetChange = useCallback((planetId: PlanetId) => {
    onMiningStop();
    const cargo = gameRef.current.cargo;
    const previousPlanetId = gameRef.current.activePlanetId;
    if (previousPlanetId !== planetId) {
      if (!gameRef.current.settings.reducedMotion) setPlanetTransition({ id: Date.now(), from: previousPlanetId, to: planetId });
      playTone("travel");
    }
    setGame((current) => setActivePlanet(current, planetId));
    setSelectedEntityIds([]);
    setSelectedBeltId(null);
    setPlacement(null);
    setBlueprintPlacementId(null);
    setNodes([]);
    setViewport({ x: 510, y: 250, zoom: 0.84 }, { duration: 180 });
    if (cargo) {
      const titanium = cargo.itemId === "titanium_ore" || cargo.itemId === "titanium_ingot";
      setNotice(`${titanium ? "托钛天王" : "手提星际运输"}：${ITEMS[cargo.itemId].name} ×${cargo.amount} 已抵达${getPlanet(planetId).name}`);
    } else {
      setNotice(`已切换至${getPlanet(planetId).name}`);
    }
  }, [onMiningStop, playTone, setNodes, setViewport]);

  const onExploreSystem = useCallback((systemId: StarSystemId) => {
    setGame((current) => exploreStarSystem(current, systemId));
    setNotice("恒星勘探完成，永久航标已写入星图");
  }, []);

  const alerts = useMemo(() => getFactoryAlerts(game), [game]);
  const activePlanetEntityCount = useMemo(() => game.entities.filter((entity) => entity.planetId === game.activePlanetId).length, [game.activePlanetId, game.entities]);
  const largeFactoryMode = game.settings.performanceMode && activePlanetEntityCount >= 150;

  const updateSettings = useCallback((settings: Partial<GameSettings>) => {
    setGame((current) => ({ ...current, settings: { ...current.settings, ...settings } }));
    if (settings.soundEnabled === true) playTone("confirm", true);
  }, [playTone]);

  const restoreGame = useCallback((state: GameState, report: OfflineReport | null = null) => {
    onMiningStop();
    gameRef.current = state;
    completedTechCountRef.current = state.research.completedTechIds.length;
    achievementCountRef.current = state.achievements.unlockedIds.length;
    campaignCompletedCountRef.current = state.campaign.completedTaskIds.length;
    launchCountRef.current = { sails: state.dysonSwarm.totalLaunched, rockets: state.dysonSphere.totalRocketsLaunched };
    setGame(state);
    setOfflineReport(report);
    setSelectedEntityIds([]);
    setSelectedBeltId(null);
    setPlacement(null);
    setBlueprintPlacementId(null);
    setSelectionMode(false);
    setNodes([]);
    setOperationsOpen(false);
    setCampaignOpen(false);
    setCampaignFocusItemId(null);
    setCampaignFocusTechId(null);
    setHighlightedTaskId(null);
    clearHistory();
    setViewport({ x: 510, y: 250, zoom: 0.84 }, { duration: state.settings.reducedMotion ? 0 : 180 });
  }, [clearHistory, onMiningStop, setNodes, setViewport]);

  const focusEntityIds = useCallback((entityIds: string[]) => {
    const selected = gameRef.current.entities.filter((entity) => entityIds.includes(entity.id));
    if (selected.length === 0) return;
    const center = selected.reduce((total, entity) => ({
      x: total.x + entity.position.x + 128,
      y: total.y + entity.position.y + 90,
    }), { x: 0, y: 0 });
    const duration = gameRef.current.settings.reducedMotion ? 0 : 260;
    setCenter(center.x / selected.length, center.y / selected.length, {
      zoom: selected.length === 1 ? 1.05 : selected.length <= 3 ? 0.85 : 0.65,
      duration,
    });
  }, [setCenter]);

  const selectAlert = useCallback((alert: FactoryAlert) => {
    if (gameRef.current.activePlanetId !== alert.planetId) onPlanetChange(alert.planetId);
    setSelectedEntityIds([alert.entityId]);
    setSelectedBeltId(null);
    setInspectorTab("inspect");
    setMobilePanel("inspector");
    setOperationsOpen(false);
    setCampaignOpen(false);
    setCampaignFocusItemId(null);
    setCampaignFocusTechId(null);
    focusEntityIds([alert.entityId]);
    setNotice(`已定位：${alert.title} · ${alert.reason}`);
    playTone("alert");
  }, [focusEntityIds, onPlanetChange, playTone]);

  const openCampaign = useCallback(() => {
    setCampaignOpen(true);
    setTechnologyOpen(false);
    setStatisticsOpen(false);
    setRecipesOpen(false);
    setStarMapOpen(false);
    setBlueprintsOpen(false);
    setDysonPlannerOpen(false);
    setOperationsOpen(false);
    setMobilePanel(null);
    setPlacement(null);
    setBlueprintPlacementId(null);
    setSelectionMode(false);
    setSelectedEntityIds([]);
    setSelectedBeltId(null);
    setNotice(null);
  }, []);

  const navigateFromCampaign = useCallback((navigation: CampaignNavigation, taskId?: CampaignTaskId) => {
    if (taskId) setHighlightedTaskId(taskId);
    setCampaignOpen(false);
    setCampaignFocusItemId(null);
    setCampaignFocusTechId(null);
    setStatisticsOpen(false);
    setRecipesOpen(false);
    setStarMapOpen(false);
    setBlueprintsOpen(false);
    setDysonPlannerOpen(false);
    setOperationsOpen(false);
    setMobilePanel(null);
    setPlacement(null);
    setBlueprintPlacementId(null);
    setSelectionMode(false);
    setSelectedEntityIds([]);
    setSelectedBeltId(null);
    if (navigation.kind === "recipe") {
      setCampaignFocusItemId(navigation.itemId);
      setRecipesOpen(true);
      setNotice(`已打开${ITEMS[navigation.itemId].name}配方`);
      return;
    }
    if (navigation.kind === "technology") {
      setCampaignFocusTechId(navigation.techId);
      setTechnologyOpen(true);
      setNotice(`已定位科技：${getTechnology(navigation.techId)?.name ?? "科研项目"}`);
      return;
    }
    if (navigation.kind === "planet") {
      if (!gameRef.current.exploration.unlockedSystemIds.includes(getPlanet(navigation.planetId).systemId)) {
        setStarMapOpen(true);
        setNotice(`${getPlanet(navigation.planetId).name}尚未解锁，请先完成恒星勘探`);
        return;
      }
      onPlanetChange(navigation.planetId);
      return;
    }
    if (navigation.kind === "system") {
      setStarMapOpen(true);
      setNotice(`已打开${navigation.systemId === "borealis" ? "北辰" : navigation.systemId === "neutron" ? "中子" : "赫利俄斯"}星图`);
      return;
    }
    if (navigation.kind === "dyson") {
      setDysonPlannerOpen(true);
      setNotice("已打开戴森球规划");
      return;
    }
    if (navigation.kind === "construction") {
      setInspectorTab("fabricate");
      setMobilePanel("inspector");
      setNotice(`请在施工托盘中选择${navigation.constructionId.includes("conveyor") ? "传送带" : "分拣器"}`);
      return;
    }
    const entity = gameRef.current.entities.find((candidate) => candidate.buildingId === navigation.buildingId);
    if (entity) {
      if (gameRef.current.activePlanetId !== entity.planetId) onPlanetChange(entity.planetId);
      setSelectedEntityIds([entity.id]);
      setSelectedBeltId(null);
      setInspectorTab("inspect");
      setMobilePanel("inspector");
      window.setTimeout(() => focusEntityIds([entity.id]), 30);
      setNotice(`已定位：${getBuilding(navigation.buildingId).name}`);
      return;
    }
    setPlacement(navigation.buildingId);
    setInspectorTab("fabricate");
    setMobilePanel("inspector");
    setNotice(`施工托盘已切换到${getBuilding(navigation.buildingId).name}`);
  }, [focusEntityIds, onPlanetChange]);

  const onSelectCampaignTask = useCallback((taskId: CampaignTaskId) => {
    setGame((current) => selectCampaignTask(current, taskId));
    setHighlightedTaskId(taskId);
  }, []);

  const refreshSaveSlots = useCallback(() => setSaveSlots(getSaveSlotSummaries()), []);

  const manualSave = useCallback(() => {
    saveGame(gameRef.current);
    setNotice("主存档已保存");
    playTone("confirm");
  }, [playTone]);

  const downloadSave = useCallback(() => {
    const blob = new Blob([exportGame(gameRef.current)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dsp-idle-save-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("存档 JSON 已导出");
    playTone("confirm");
  }, [playTone]);

  const importSave = useCallback((raw: string) => {
    const state = importGame(raw);
    if (!state) {
      setNotice("存档导入失败：文件格式或版本无效");
      playTone("alert");
      return;
    }
    saveGame(state);
    restoreGame(state);
    setNotice("存档导入完成");
    playTone("complete");
  }, [playTone, restoreGame]);

  const saveToSlot = useCallback((slotId: SaveSlotId) => {
    saveGameSlot(slotId, gameRef.current);
    refreshSaveSlots();
    setNotice(`已保存到本地槽位 ${slotId}`);
    playTone("confirm");
  }, [playTone, refreshSaveSlots]);

  const loadFromSlot = useCallback((slotId: SaveSlotId) => {
    const slot = loadGameSlot(slotId);
    if (!slot) {
      setNotice(`槽位 ${slotId} 没有可用存档`);
      return;
    }
    saveGame(slot.state);
    restoreGame(slot.state, slot.offlineReport);
    setNotice(`已载入本地槽位 ${slotId}`);
    playTone("complete");
  }, [playTone, restoreGame]);

  const deleteSlot = useCallback((slotId: SaveSlotId) => {
    clearGameSlot(slotId);
    refreshSaveSlots();
    setNotice(`本地槽位 ${slotId} 已清空`);
  }, [refreshSaveSlots]);

  useEffect(() => {
    if (!connectionHint || connectionDraft) return;
    const timer = window.setTimeout(() => setConnectionHint(null), 1800);
    return () => window.clearTimeout(timer);
  }, [connectionDraft, connectionHint]);

  useEffect(() => {
    if (!placement && !blueprintPlacementId) return;
    let frame = 0;
    const edgePan = () => {
      const canvas = factoryCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const point = pointerRef.current;
      const margin = Math.min(72, rect.width * 0.16, rect.height * 0.16);
      const inside = point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
      const hovered = document.elementFromPoint(point.x, point.y);
      const overCanvasUi = hovered instanceof Element && Boolean(hovered.closest(".canvas-selection-tools, .selection-toolbar, .planet-navigator, .react-flow__controls, .react-flow__minimap, .task-path-indicator"));
      let dx = 0;
      let dy = 0;
      if (inside && !overCanvasUi) {
        if (point.x < rect.left + margin) dx = 4;
        else if (point.x > rect.right - margin) dx = -4;
        if (point.y < rect.top + margin) dy = 4;
        else if (point.y > rect.bottom - margin) dy = -4;
      }
      if (dx || dy) {
        const viewport = getViewport();
        void setViewport({ ...viewport, x: viewport.x + dx, y: viewport.y + dy });
      }
      frame = window.requestAnimationFrame(edgePan);
    };
    frame = window.requestAnimationFrame(edgePan);
    return () => window.cancelAnimationFrame(frame);
  }, [blueprintPlacementId, getViewport, placement, setViewport]);

  const beltNodeIndex = useMemo(() => {
    const connectedInputsByTarget = new Map<string, ItemId[]>();
    const activeEntityIds = new Set<string>();
    for (const belt of game.belts) {
      const inputs = connectedInputsByTarget.get(belt.target) ?? [];
      inputs.push(belt.itemId);
      connectedInputsByTarget.set(belt.target, inputs);
      if (belt.lastFlow > 0.001) {
        activeEntityIds.add(belt.source);
        activeEntityIds.add(belt.target);
      }
    }
    return { connectedInputsByTarget, activeEntityIds: [...activeEntityIds] };
  }, [game.belts]);

  const taskHighlight = useMemo(() => {
    const task = highlightedTaskId ? getCampaignTask(highlightedTaskId) : undefined;
    if (!task) return { entityIds: new Set<string>(), beltIds: new Set<string>(), itemIds: new Set<ItemId>() };
    const itemIds = new Set<ItemId>(getCampaignTaskRequirements(task).map((requirement) => requirement.itemId));
    if (task.navigation?.kind === "recipe") itemIds.add(task.navigation.itemId);
    for (let depth = 0; depth < 8; depth += 1) {
      let changed = false;
      for (const recipe of Object.values(RECIPES)) {
        if (!recipe.outputs.some((output) => itemIds.has(output.itemId))) continue;
        for (const input of recipe.inputs) {
          if (!itemIds.has(input.itemId)) {
            itemIds.add(input.itemId);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    const entityIds = new Set(game.entities.flatMap((entity) => {
      if (entity.planetId !== game.activePlanetId) return [];
      const directBuilding = task.navigation?.kind === "building" && entity.buildingId === task.navigation.buildingId;
      const relevantItem = (entity.resourceId && itemIds.has(entity.resourceId)) ||
        getProducedOutputs(entity).some((itemId) => itemIds.has(itemId)) ||
        getAcceptedInputs(entity, game).some((itemId) => itemIds.has(itemId));
      return directBuilding || relevantItem ? [entity.id] : [];
    }));
    const beltIds = new Set(game.belts.flatMap((belt) => {
      if (belt.planetId !== game.activePlanetId || !itemIds.has(belt.itemId)) return [];
      entityIds.add(belt.source);
      entityIds.add(belt.target);
      return [belt.id];
    }));
    return { entityIds, beltIds, itemIds };
  }, [game, highlightedTaskId]);

  const commonNodeData = useMemo<Omit<FactoryNodeData, "entity" | "status" | "connectedInputItemIds">>(() => {
    const technology = getTechnology(game.research.selectedTechId);
    const progress = technology ? game.research.progressByTech[technology.id] ?? {} : {};
    return {
      cargo: game.cargo,
      placement,
      placementCount,
      miningEntityId,
      onMiningStart,
      onMiningStop,
      onPickOutput,
      onPickInput,
      onDropCargo,
      onDropDraggedItem,
      onInstallMiner,
      onAddBuilding,
      onRecipeChange,
      onFuelChange,
      onEnergyModeChange,
      researchLabel: technology?.name ?? null,
      researchCosts: technology?.costs.filter((cost) => (progress[cost.itemId] ?? 0) < cost.amount) ?? [],
      completedTechIds: game.research.completedTechIds,
      networkTime: game.elapsedSeconds,
      paused: game.paused,
      activeLogisticsEntityIds: beltNodeIndex.activeEntityIds,
      connectionDraft,
      dysonSwarm: game.dysonSwarm,
      dysonSphere: game.dysonSphere,
    };
  }, [beltNodeIndex.activeEntityIds, connectionDraft, game.cargo, game.dysonSphere, game.dysonSwarm, game.elapsedSeconds, game.paused, game.research.completedTechIds, game.research.progressByTech, game.research.selectedTechId, miningEntityId, onAddBuilding, onDropCargo, onDropDraggedItem, onEnergyModeChange, onFuelChange, onInstallMiner, onMiningStart, onMiningStop, onPickInput, onPickOutput, onRecipeChange, placement, placementCount]);

  useEffect(() => {
    if (nodeDragActiveRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      setNodes((current) => {
        const existing = new Map(current.map((node) => [node.id, node]));
        return game.entities.filter((entity) => entity.planetId === game.activePlanetId).map((entity) => {
          const previous = existing.get(entity.id);
          return {
            id: entity.id,
            type: entity.kind,
            position: previous?.position ?? entity.position,
            measured: previous?.measured,
            data: {
              ...commonNodeData,
              entity,
              connectedInputItemIds: beltNodeIndex.connectedInputsByTarget.get(entity.id) ?? [],
              status: getEntityOperatingStatus(game, entity),
            } as FactoryNodeData,
            selected: selectedEntityIds.includes(entity.id),
            className: highlightedTaskId
              ? taskHighlight.entityIds.has(entity.id) ? "factory-flow-node--task-focus" : "factory-flow-node--task-dim"
              : undefined,
            draggable: !placement && !blueprintPlacementId,
          } satisfies FactoryFlowNode;
        });
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [beltNodeIndex.connectedInputsByTarget, blueprintPlacementId, commonNodeData, game.activePlanetId, game.entities, highlightedTaskId, placement, selectedEntityIds, setNodes, taskHighlight.entityIds]);

  const edges = useMemo<FactoryFlowEdge[]>(() => game.belts.filter((belt) => belt.planetId === game.activePlanetId).map((belt) => {
    const item = ITEMS[belt.itemId];
    const capacity = getBeltCapacity(belt);
    const flowRatio = capacity > 0 ? Math.min(1, belt.lastFlow / capacity) : 0;
    return {
      id: belt.id,
      type: "factory",
      source: belt.source,
      target: belt.target,
      sourceHandle: `out:${belt.itemId}`,
      targetHandle: `in:${belt.itemId}`,
      className: `factory-edge${belt.lastFlow > 0.001 ? " factory-edge--active" : ""}${highlightedTaskId ? taskHighlight.beltIds.has(belt.id) ? " factory-edge--task-focus" : " factory-edge--task-dim" : ""}`,
      selected: selectedBeltId === belt.id,
      markerEnd: { type: MarkerType.ArrowClosed, color: item.color },
      data: {
        itemId: belt.itemId,
        itemName: item.name,
        itemSymbol: item.symbol,
        color: item.color,
        tier: belt.tier,
        flow: belt.lastFlow,
        capacity,
        durationSeconds: Math.max(0.55, 1.65 - flowRatio * 0.9),
        detailVisible: !largeFactoryMode && viewportZoom >= 0.55,
        motionEnabled: !game.settings.performanceMode && !game.settings.reducedMotion,
      },
      style: {
        stroke: item.color,
        strokeWidth: selectedBeltId === belt.id ? 3 : 2,
      },
    } satisfies FactoryFlowEdge;
  }), [game.activePlanetId, game.belts, game.settings.performanceMode, game.settings.reducedMotion, highlightedTaskId, largeFactoryMode, selectedBeltId, taskHighlight.beltIds, viewportZoom]);

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    const sourceItem = parseHandleItem(connection.sourceHandle);
    const targetItem = parseHandleItem(connection.targetHandle);
    if (!connection.source || !connection.target || connection.source === connection.target ||
      !sourceItem || sourceItem !== targetItem) return false;
    const state = gameRef.current;
    const source = state.entities.find((entity) => entity.id === connection.source);
    const target = state.entities.find((entity) => entity.id === connection.target);
    const constructionId = getBeltConstructionId(beltTier);
    return Boolean(source && target && source.planetId === target.planetId &&
      getProducedOutputs(source).includes(sourceItem) && getAcceptedInputs(target, state).includes(sourceItem) &&
      (state.construction[constructionId] ?? 0) >= 1);
  }, [beltTier]);

  const onConnectStart = useCallback((_event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
    const itemId = parseHandleItem(params.handleId);
    if (!params.nodeId || !params.handleType || !itemId) return;
    setConnectionDraft({ nodeId: params.nodeId, itemId, handleType: params.handleType });
    setConnectionHint({
      label: `${ITEMS[itemId].name} · 连接到同色${params.handleType === "source" ? "输入" : "输出"}端口`,
      tone: "ready",
    });
  }, []);

  const onConnectEnd = useCallback((_event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    const draft = connectionDraft;
    setConnectionDraft(null);
    if (state.isValid) {
      setConnectionHint(null);
      return;
    }
    const fromItem = parseHandleItem(state.fromHandle?.id) ?? draft?.itemId ?? null;
    const toItem = parseHandleItem(state.toHandle?.id);
    let label = "请释放到设备的同色端口";
    if (state.toNode && state.fromNode?.id === state.toNode.id) label = "设备不能连接到自身";
    else if (state.toHandle && fromItem !== toItem) label = `物品不兼容：需要${fromItem ? ITEMS[fromItem].name : "同一种物品"}`;
    else if (state.toHandle && state.fromHandle?.type === state.toHandle.type) label = "输出端口必须连接输入端口";
    else if ((gameRef.current.construction[getBeltConstructionId(beltTier)] ?? 0) < 1) label = "施工托盘中没有当前等级传送带";
    else if (state.toNode) label = "该设备不接受这类物品，或输出端尚未生产它";
    setConnectionHint({ label, tone: "blocked" });
  }, [beltTier, connectionDraft]);

  const onConnect = useCallback((connection: Connection) => {
    const sourceItem = parseHandleItem(connection.sourceHandle);
    const targetItem = parseHandleItem(connection.targetHandle);
    if (!connection.source || !connection.target || !sourceItem || sourceItem !== targetItem) {
      setNotice("运输线两端必须使用同一种物品");
      return;
    }
    const constructionId = getBeltConstructionId(beltTier);
    const tierName = beltTier === 3 ? "III" : beltTier === 2 ? "II" : "I";
    if ((gameRef.current.construction[constructionId] ?? 0) < 1) {
      setNotice(`施工托盘中没有可用的 Mk.${tierName} 传送带`);
      setInspectorTab("fabricate");
      return;
    }
    const existing = gameRef.current.belts.find((belt) =>
      belt.source === connection.source && belt.target === connection.target && belt.itemId === sourceItem);
    if (existing && existing.tier !== beltTier) {
      setNotice("这条运输线已存在，请在检查器中原地升级");
      return;
    }
    commitGame((current) => connectBelt(current, connection.source!, connection.target!, sourceItem, beltTier));
    setNotice(`${ITEMS[sourceItem].name}运输线已建立 · Mk.${tierName}`);
    playTone("connect");
  }, [beltTier, commitGame, playTone]);

  const onNodeDrag = useCallback((_event: MouseEvent | TouchEvent, node: FactoryFlowNode) => {
    const width = node.measured?.width ?? 256;
    const height = node.measured?.height ?? 180;
    const centerX = node.position.x + width / 2;
    const centerY = node.position.y + height / 2;
    const threshold = 7 / Math.max(0.3, viewportZoom);
    let guideX: number | null = null;
    let guideY: number | null = null;
    let nearestX = Number.POSITIVE_INFINITY;
    let nearestY = Number.POSITIVE_INFINITY;
    for (const candidate of nodes) {
      if (candidate.id === node.id || candidate.selected) continue;
      const candidateWidth = candidate.measured?.width ?? 256;
      const candidateHeight = candidate.measured?.height ?? 180;
      const candidateX = candidate.position.x + candidateWidth / 2;
      const candidateY = candidate.position.y + candidateHeight / 2;
      const distanceX = Math.abs(candidateX - centerX);
      const distanceY = Math.abs(candidateY - centerY);
      if (distanceX < threshold && distanceX < nearestX) {
        nearestX = distanceX;
        guideX = candidateX;
      }
      if (distanceY < threshold && distanceY < nearestY) {
        nearestY = distanceY;
        guideY = candidateY;
      }
    }
    setAlignmentGuides((current) => current.x === guideX && current.y === guideY ? current : { x: guideX, y: guideY });
  }, [nodes, viewportZoom]);

  const onSelectionChange = useCallback(({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams<FactoryFlowNode, Edge>) => {
    const ids = selectedNodes.map((node) => node.id);
    setSelectedEntityIds((current) => current.length === ids.length && current.every((id, index) => id === ids[index]) ? current : ids);
    if (ids.length > 0) setSelectedBeltId(null);
    else if (selectedEdges.length === 1) setSelectedBeltId(selectedEdges[0].id);
  }, []);

  const onNodeClick: NodeMouseHandler<FactoryFlowNode> = useCallback((event, node) => {
    if (placement || blueprintPlacementId) return;
    setSelectedEntityIds((current) => event.shiftKey
      ? current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id]
      : [node.id]);
    setSelectedBeltId(null);
    setInspectorTab("inspect");
    if (!selectionMode) setMobilePanel("inspector");
  }, [blueprintPlacementId, placement, selectionMode]);

  const onNodeDoubleClick: NodeMouseHandler<FactoryFlowNode> = useCallback((_event, node) => {
    if (placement || blueprintPlacementId) return;
    setSelectedEntityIds([node.id]);
    setSelectedBeltId(null);
    focusEntityIds([node.id]);
  }, [blueprintPlacementId, focusEntityIds, placement]);

  const onPaneClick = useCallback((event: React.MouseEvent) => {
    if (blueprintPlacementId) {
      const position = snapFlowPosition(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      const deployable = canPlaceBlueprint(gameRef.current, blueprintPlacementId);
      const canContinue = deployable && canPlaceBlueprint(placeBlueprint(gameRef.current, blueprintPlacementId, position), blueprintPlacementId);
      const blueprintName = gameRef.current.blueprints.find((blueprint) => blueprint.id === blueprintPlacementId)?.name ?? "蓝图";
      commitGame((current) => {
        const next = placeBlueprint(current, blueprintPlacementId, position);
        if (next !== current && !canPlaceBlueprint(next, blueprintPlacementId)) setBlueprintPlacementId(null);
        return next;
      });
      if (deployable) playTone("place");
      setSelectedEntityIds([]);
      setNotice(deployable ? `${blueprintName}部署完成${canContinue ? " · 可继续粘贴" : ""}` : `${blueprintName}施工库存不足或与当前行星不兼容`);
      return;
    }
    if (placement) {
      if (getBuilding(placement).kind === "miner") {
        setNotice(minerPlacementHint(placement));
        return;
      }
      const position = snapFlowPosition(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      if (placeBuilding(gameRef.current, placement, position, placementCount) !== gameRef.current) playTone("place");
      commitGame((current) => placeBuilding(current, placement, position, placementCount));
      setPlacement(null);
      return;
    }
    setSelectedEntityIds([]);
    setSelectedBeltId(null);
  }, [blueprintPlacementId, commitGame, placement, placementCount, playTone, screenToFlowPosition]);

  const onCanvasDrop = useCallback((event: React.DragEvent) => {
    const buildingId = event.dataTransfer.getData("application/factory-building") as BuildingId;
    if (!buildingId) return;
    event.preventDefault();
    if (getBuilding(buildingId).kind === "miner") {
      setNotice(minerPlacementHint(buildingId));
      return;
    }
    const position = snapFlowPosition(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    if (placeBuilding(gameRef.current, buildingId, position, placementCount) !== gameRef.current) playTone("place");
    commitGame((current) => placeBuilding(current, buildingId, position, placementCount));
    setPlacement(null);
    setBeltTier(1);
  }, [commitGame, placementCount, playTone, screenToFlowPosition]);

  const selectedEntities = game.entities.filter((entity) => selectedEntityIds.includes(entity.id) && entity.planetId === game.activePlanetId);
  const selectedEntity = selectedEntities.length === 1 ? selectedEntities[0] : null;
  const selectedBelt = game.belts.find((belt) => belt.id === selectedBeltId && belt.planetId === game.activePlanetId) ?? null;
  const blueprintEligibleIds = getBlueprintEligibleEntityIds(game, selectedEntityIds);
  const activeBlueprint = game.blueprints.find((blueprint) => blueprint.id === blueprintPlacementId) ?? null;

  const copySelectionAsBlueprint = () => {
    if (blueprintEligibleIds.length === 0) {
      setNotice("选区中没有可复制的设备");
      return;
    }
    const blueprintId = `blueprint_${gameRef.current.nextId}`;
    commitGame((current) => createBlueprint(current, blueprintEligibleIds));
    setBlueprintPlacementId(blueprintId);
    setPlacement(null);
    setSelectionMode(false);
    setNotice(`已复制 ${blueprintEligibleIds.length} 个设备，点击画布粘贴蓝图`);
  };

  const deployBlueprint = (blueprintId: string) => {
    setBlueprintPlacementId(blueprintId);
    setBlueprintsOpen(false);
    setDysonPlannerOpen(false);
    setPlacement(null);
    setSelectionMode(false);
    setSelectedEntityIds([]);
    setNotice("点击画布确定蓝图部署位置");
  };

  const reset = () => {
    clearGame();
    const initial = createInitialState();
    initial.settings = { ...gameRef.current.settings };
    setGame(initial);
    setPlacement(null);
    setPlacementCount(1);
    setSelectedEntityIds([]);
    setSelectedBeltId(null);
    setNodes([]);
    setTechnologyOpen(false);
    setStatisticsOpen(false);
    setRecipesOpen(false);
    setStarMapOpen(false);
    setBlueprintsOpen(false);
    setDysonPlannerOpen(false);
    setOperationsOpen(false);
    setCampaignOpen(false);
    setCampaignFocusItemId(null);
    setCampaignFocusTechId(null);
    setOfflineReport(null);
    setBlueprintPlacementId(null);
    setSelectionMode(false);
    setHighlightedTaskId(null);
    clearHistory();
    setNotice("当前工厂已重置");
  };

  return (
    <main
      className={`game-shell${placement || blueprintPlacementId ? " game-shell--placing" : ""}${selectionMode ? " game-shell--selecting" : ""}${mobilePanel ? ` mobile-panel--${mobilePanel}` : ""}${leftSidebarCollapsed ? " sidebar-left-collapsed" : ""}${rightSidebarCollapsed ? " sidebar-right-collapsed" : ""}`}
      data-reduced-motion={game.settings.reducedMotion ? "true" : "false"}
      data-performance-mode={game.settings.performanceMode ? "true" : "false"}
      data-simulation-worker={simulationWorkerActive ? "active" : "fallback"}
      data-zoom-lod={largeFactoryMode || viewportZoom < 0.55 ? "compact" : viewportZoom < 0.86 ? "medium" : "full"}
      data-large-factory={largeFactoryMode ? "true" : "false"}
    >
      <HeaderControls
        game={game}
        alertCount={alerts.length}
        onOpenCampaign={openCampaign}
        onPauseToggle={() => setGame((current) => setPaused(current, !current.paused))}
        onReset={reset}
        onOpenOperations={() => {
          setOperationsOpen(true);
          setOperationsTab("alerts");
          setTechnologyOpen(false);
          setStatisticsOpen(false);
          setRecipesOpen(false);
          setStarMapOpen(false);
          setBlueprintsOpen(false);
          setDysonPlannerOpen(false);
          setCampaignOpen(false);
          setMobilePanel(null);
          setNotice(null);
        }}
        onOpenResources={() => { setMobilePanel((current) => current === "resources" ? null : "resources"); setNotice(null); }}
        onOpenInspector={() => { setMobilePanel((current) => current === "inspector" ? null : "inspector"); setNotice(null); }}
        onOpenRecipes={() => { setRecipesOpen(true); setTechnologyOpen(false); setStatisticsOpen(false); setCampaignOpen(false); setCampaignFocusItemId(null); setMobilePanel(null); setNotice(null); }}
        onOpenTechnology={() => { setTechnologyOpen(true); setRecipesOpen(false); setStatisticsOpen(false); setCampaignOpen(false); setCampaignFocusTechId(null); setMobilePanel(null); setNotice(null); }}
        onOpenStatistics={() => { setStatisticsOpen(true); setRecipesOpen(false); setTechnologyOpen(false); setCampaignOpen(false); setMobilePanel(null); setNotice(null); }}
        onOpenStarMap={() => { setStarMapOpen(true); setStatisticsOpen(false); setRecipesOpen(false); setTechnologyOpen(false); setCampaignOpen(false); setMobilePanel(null); setNotice(null); }}
      />
      <div className="game-workspace">
        <ResourceRail
          game={game}
          onOpenCampaign={openCampaign}
          onOpenDysonPlanner={() => {
            setDysonPlannerOpen(true);
            setBlueprintsOpen(false);
            setStarMapOpen(false);
            setTechnologyOpen(false);
            setStatisticsOpen(false);
            setRecipesOpen(false);
            setCampaignOpen(false);
            setMobilePanel(null);
          }}
          onPickTray={(itemId) => setGame((current) => pickFromTray(current, itemId))}
          onDropCargo={() => setGame((current) => dropCargoToTray(current))}
          onDropDraggedItem={(itemId, sourceKind, sourceId) => {
            if (sourceKind === "node" && sourceId) {
              setGame((current) => moveEntityOutputToTray(current, sourceId, itemId));
            } else if (sourceKind === "node-input" && sourceId) {
              setGame((current) => moveEntityInputToTray(current, sourceId, itemId));
            }
          }}
        />
        <section
          className="factory-canvas"
          aria-label="生产网络画布"
          ref={factoryCanvasRef}
          onClickCapture={(event) => {
            if (!placement && !blueprintPlacementId) return;
            const target = event.target instanceof Element ? event.target : null;
            if (!target?.closest(".react-flow") || target.closest(".react-flow__node, .react-flow__controls, .react-flow__minimap, .canvas-selection-tools, .planet-navigator")) return;
            event.preventDefault();
            event.stopPropagation();
            onPaneClick(event);
          }}
          onDoubleClick={(event) => {
            if (event.target instanceof Element && event.target.classList.contains("react-flow__pane") && !placement && !blueprintPlacementId) {
              void fitView({ padding: 0.18, duration: game.settings.reducedMotion ? 0 : 260 });
            }
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onSelectionChange={onSelectionChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            isValidConnection={isValidConnection}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeDragStart={() => { nodeDragActiveRef.current = true; }}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={(_event, node, draggedNodes) => {
              nodeDragActiveRef.current = false;
              setAlignmentGuides({ x: null, y: null });
              const moved = draggedNodes.length > 0 ? draggedNodes : [node];
              const positions = moved.map((candidate) => ({ id: candidate.id, position: snapFlowPosition(candidate.position) }));
              window.requestAnimationFrame(() => commitGame((current) => moveEntities(current, positions)));
            }}
            onEdgeClick={(_event, edge) => {
              setSelectedBeltId(edge.id);
              setSelectedEntityIds([]);
              setInspectorTab("inspect");
              setMobilePanel("inspector");
            }}
            onPaneClick={onPaneClick}
            onDrop={onCanvasDrop}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
            minZoom={0.3}
            maxZoom={1.6}
            connectionRadius={30}
            snapToGrid
            snapGrid={[FLOW_GRID, FLOW_GRID]}
            autoPanOnConnect
            autoPanOnNodeDrag
            connectionLineStyle={{ stroke: "#62b5ae", strokeWidth: 2, strokeDasharray: "6 5" }}
            connectOnClick
            defaultViewport={{ x: 510, y: 250, zoom: 0.84 }}
            onMove={(_event, viewport) => setViewportZoom(viewport.zoom)}
            panOnScroll
            panOnDrag={[1, 2]}
            selectionOnDrag={selectionMode}
            selectionMode={SelectionMode.Full}
            selectionKeyCode={null}
            multiSelectionKeyCode="Shift"
            zoomOnDoubleClick={false}
            deleteKeyCode={null}
            fitViewOptions={{ padding: 0.18 }}
            onlyRenderVisibleElements={game.settings.performanceMode}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.1} color="#3c4743" />
            <ViewportPortal>
              {alignmentGuides.x != null ? <i className="alignment-guide alignment-guide--vertical" style={{ left: alignmentGuides.x }} /> : null}
              {alignmentGuides.y != null ? <i className="alignment-guide alignment-guide--horizontal" style={{ top: alignmentGuides.y }} /> : null}
            </ViewportPortal>
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => node.type === "vein" ? ITEMS[(node.data as FactoryNodeData).entity.resourceId!].color : node.type === "power" ? "#e1b452" : node.type === "station" ? "#d8794d" : node.type === "storage" ? "#8aa69d" : node.type === "splitter" ? "#d2aa5b" : "#61a9a4"}
              maskColor="rgba(8, 11, 10, 0.76)"
            />
            <Controls position="bottom-left" showInteractive={false} />
          </ReactFlow>
          <PlanetNavigator game={game} onPlanetChange={onPlanetChange} />
          <CanvasSelectionTools
            selectionMode={selectionMode}
            blueprintCount={game.blueprints.length}
            canUndo={undoStackRef.current.length > 0}
            canRedo={redoStackRef.current.length > 0}
            leftSidebarCollapsed={leftSidebarCollapsed}
            rightSidebarCollapsed={rightSidebarCollapsed}
            onUndo={undoGame}
            onRedo={redoGame}
            onToggleLeftSidebar={() => setLeftSidebarCollapsed((collapsed) => !collapsed)}
            onToggleRightSidebar={() => setRightSidebarCollapsed((collapsed) => !collapsed)}
            onModeChange={(enabled) => {
              setSelectionMode(enabled);
              setPlacement(null);
              setBlueprintPlacementId(null);
              if (!enabled) setSelectedEntityIds([]);
            }}
            onOpenBlueprints={() => { setBlueprintsOpen(true); setSelectionMode(false); setMobilePanel(null); }}
          />
          <SelectionToolbar
            selectedCount={selectedEntityIds.length}
            eligibleCount={blueprintEligibleIds.length}
            canUpgrade={canUpgradeEntities(game, selectedEntityIds)}
            onFocus={() => focusEntityIds(selectedEntityIds)}
            onCopy={copySelectionAsBlueprint}
            onUpgrade={() => {
              commitGame((current) => upgradeEntities(current, selectedEntityIds));
              setNotice("已批量升级选区内可升级设备");
              playTone("upgrade");
            }}
            onRemove={() => {
              commitGame((current) => removeEntities(current, selectedEntityIds));
              setSelectedEntityIds([]);
              setNotice("选区设备已回收至施工托盘");
              playTone("remove");
            }}
          />
          {highlightedTaskId ? (
            <div className="task-path-indicator nodrag nopan">
              <span>任务生产路径</span>
              <strong>{getCampaignTask(highlightedTaskId)?.title}</strong>
              <em>{taskHighlight.entityIds.size} 节点 · {taskHighlight.beltIds.size} 线路</em>
              <button type="button" onClick={() => setHighlightedTaskId(null)} aria-label="关闭任务路径高亮">×</button>
            </div>
          ) : null}
          <div className="canvas-status">
            <span className={game.paused ? "paused" : "running"}>{game.paused ? "模拟暂停" : "实时运行"}</span>
            <strong>{getPlanet(game.activePlanetId).name} · {getPlanet(game.activePlanetId).code}工厂区</strong>
          </div>
        </section>
        <InspectorPanel
          game={game}
          selectedEntities={selectedEntities}
          selectedEntity={selectedEntity}
          selectedBelt={selectedBelt}
          tab={inspectorTab}
          onTabChange={setInspectorTab}
          onRecipeChange={onRecipeChange}
          onFuelChange={onFuelChange}
          onEnergyModeChange={onEnergyModeChange}
          onStationModeChange={(entityId, mode) => commitGame((current) => setStationMode(current, entityId, mode))}
          onStationVesselAdjust={(entityId, delta) => commitGame((current) => adjustStationVessels(current, entityId, delta))}
          onStationDroneAdjust={(entityId, delta) => commitGame((current) => adjustStationDrones(current, entityId, delta))}
          onStationWarperAdjust={(entityId, delta) => commitGame((current) => adjustStationWarpers(current, entityId, delta))}
          onStationWarpEnabled={(entityId, enabled) => commitGame((current) => setStationWarpEnabled(current, entityId, enabled))}
          onStationMinimumLoadChange={(entityId, minimumLoad: StationMinimumLoad) => commitGame((current) => setStationMinimumLoad(current, entityId, minimumLoad))}
          onLogisticsItemChange={(entityId, itemId) => commitGame((current) => setLogisticsItem(current, entityId, itemId))}
          onSplitterModeChange={(entityId, mode) => commitGame((current) => setSplitterMode(current, entityId, mode))}
          onBeltPriorityChange={(beltId, priority) => commitGame((current) => setBeltPriority(current, beltId, priority))}
          onUpgradeEntity={(entityId) => {
            const entity = gameRef.current.entities.find((candidate) => candidate.id === entityId);
            const targetId = entity?.buildingId ? getBuildingUpgradeTarget(entity.buildingId) : undefined;
            commitGame((current) => upgradeEntity(current, entityId));
            if (targetId) {
              setNotice(`设备已升级为${getBuilding(targetId).name}`);
              playTone("upgrade");
            }
          }}
          onUpgradeBelt={(beltId) => {
            commitGame((current) => upgradeBelt(current, beltId));
            setNotice("运输线升级完成");
            playTone("upgrade");
          }}
          onUpgradeSorter={(beltId) => {
            commitGame((current) => upgradeSorter(current, beltId));
            setNotice("分拣器升级完成");
            playTone("upgrade");
          }}
          onInstallSprayCoater={(entityId) => {
            commitGame((current) => installSprayCoater(current, entityId));
            setNotice("喷涂模块安装完成，可接入增产剂并选择生产模式");
          }}
          onProliferatorConfiguration={(entityId, tier: ProliferatorTier, mode: ProliferatorMode) => {
            commitGame((current) => setProliferatorConfiguration(current, entityId, tier, mode));
            const modeName = mode === "extra" ? "额外产出" : mode === "speed" ? "生产加速" : "正常生产";
            setNotice(`喷涂配置已切换：Mk.${tier === 3 ? "III" : tier === 2 ? "II" : "I"} · ${modeName}`);
          }}
          onBatchRecipeChange={(entityIds, recipeId) => {
            commitGame((current) => setEntitiesRecipe(current, entityIds, recipeId));
            setNotice(`已为 ${entityIds.length} 个设备切换生产配方`);
          }}
          onBatchInstallSprayCoater={(entityIds) => {
            commitGame((current) => installSprayCoaters(current, entityIds));
            setNotice("已为选区安装可用喷涂模块");
          }}
          onBatchProliferatorConfiguration={(entityIds, tier, mode) => {
            commitGame((current) => setEntitiesProliferatorConfiguration(current, entityIds, tier, mode));
            setNotice(`已同步 ${entityIds.length} 个设备的增产配置`);
          }}
          onCraft={(buildingId) => setGame((current) => craftConstruction(current, buildingId))}
          onCraftItem={(recipeId, batches) => setGame((current) => handcraftRecipe(current, recipeId, batches))}
          onRemoveEntity={(entityId) => {
            commitGame((current) => removeEntity(current, entityId));
            setSelectedEntityIds((current) => current.filter((id) => id !== entityId));
            playTone("remove");
          }}
          onRemoveBelt={(beltId) => {
            commitGame((current) => removeBelt(current, beltId));
            setSelectedBeltId(null);
            playTone("remove");
          }}
        />
      </div>
      <ConstructionDock
        game={game}
        placement={placement}
        beltTier={beltTier}
        placementCount={placementCount}
        onPlacementChange={(buildingId) => { setPlacement(buildingId); setBlueprintPlacementId(null); setSelectionMode(false); setSelectedEntityIds([]); }}
        onBeltTierChange={setBeltTier}
        onPlacementCountChange={(count) => { setPlacementCount(count); setPlacement(null); }}
        onOpenFabricator={() => { setInspectorTab("fabricate"); setMobilePanel("inspector"); }}
      />
      <BlueprintWorkspace
        open={blueprintsOpen}
        game={game}
        onClose={() => setBlueprintsOpen(false)}
        onDeploy={deployBlueprint}
        onRemove={(blueprintId) => {
          commitGame((current) => removeBlueprint(current, blueprintId));
          if (blueprintPlacementId === blueprintId) setBlueprintPlacementId(null);
        }}
        onRename={(blueprintId, name) => commitGame((current) => renameBlueprint(current, blueprintId, name))}
      />
      <Suspense fallback={<WorkspaceLoading />}>
        {technologyOpen ? (
          <TechnologyWorkspace
            open
            game={game}
            focusTechId={campaignFocusTechId}
            onClose={() => setTechnologyOpen(false)}
            onSelect={(techId) => setGame((current) => selectTechnology(current, techId))}
            onRemoveQueued={(techId) => setGame((current) => removeQueuedTechnology(current, techId))}
          />
        ) : null}
        {statisticsOpen ? <StatisticsWorkspace open game={game} onClose={() => setStatisticsOpen(false)} /> : null}
        {recipesOpen ? <RecipeWorkspace open game={game} focusItemId={campaignFocusItemId} onClose={() => setRecipesOpen(false)} /> : null}
        {campaignOpen ? (
          <CampaignWorkspace
            open
            game={game}
            onClose={() => setCampaignOpen(false)}
            onNavigate={navigateFromCampaign}
            onSelectTask={onSelectCampaignTask}
          />
        ) : null}
        {starMapOpen ? (
          <StarMapWorkspace
            open
            game={game}
            onClose={() => setStarMapOpen(false)}
            onExplore={onExploreSystem}
            onTravel={(planetId) => { onPlanetChange(planetId); setStarMapOpen(false); }}
          />
        ) : null}
        {dysonPlannerOpen ? (
          <DysonPlannerWorkspace
            open
            game={game}
            onClose={() => setDysonPlannerOpen(false)}
            onAddLayer={(systemId) => setGame((current) => addDysonLayer(current, systemId))}
            onAddStandardLayer={(systemId) => setGame((current) => createStandardDysonLayer(current, systemId))}
            onSelectLayer={(systemId, layerId) => setGame((current) => setActiveDysonLayer(current, systemId, layerId))}
            onOrbitChange={(systemId, layerId, orbit) => setGame((current) => setDysonLayerOrbit(current, systemId, layerId, orbit))}
            onRemoveLayer={(systemId, layerId) => setGame((current) => removeDysonLayer(current, systemId, layerId))}
            onAddNode={(systemId, layerId, angle) => setGame((current) => addDysonNode(current, systemId, layerId, angle))}
            onRemoveNode={(systemId, layerId, nodeId) => setGame((current) => removeDysonNode(current, systemId, layerId, nodeId))}
            onConnectNodes={(systemId, layerId, sourceNodeId, targetNodeId) => setGame((current) => connectDysonNodes(current, systemId, layerId, sourceNodeId, targetNodeId))}
            onAutoConnect={(systemId, layerId) => setGame((current) => autoConnectDysonLayer(current, systemId, layerId))}
            onPlanShell={(systemId, layerId) => setGame((current) => planDysonShell(current, systemId, layerId))}
            onClearShell={(systemId, layerId) => setGame((current) => clearDysonShells(current, systemId, layerId))}
          />
        ) : null}
        {operationsOpen ? (
          <OperationsWorkspace
            open
            tab={operationsTab}
            game={game}
            alerts={alerts}
            slots={saveSlots}
            onClose={() => setOperationsOpen(false)}
            onTabChange={setOperationsTab}
            onAlertSelect={selectAlert}
            onSettingsChange={updateSettings}
            onManualSave={manualSave}
            onExport={downloadSave}
            onImport={importSave}
            onSaveSlot={saveToSlot}
            onLoadSlot={loadFromSlot}
            onDeleteSlot={deleteSlot}
          />
        ) : null}
        {offlineReport ? <OfflineReportWorkspace report={offlineReport} onClose={() => setOfflineReport(null)} /> : null}
      </Suspense>
      <button className="mobile-backdrop" type="button" aria-label="关闭侧栏" onClick={() => setMobilePanel(null)} />
      {planetTransition ? (
        <div className="planet-transition" key={planetTransition.id} aria-live="polite">
          <span>{getPlanet(planetTransition.from).name}</span>
          <i><b /></i>
          <strong>{getPlanet(planetTransition.to).name}</strong>
        </div>
      ) : null}
      {rewardFlights.length > 0 ? (
        <div className="campaign-reward-flight" aria-label="任务奖励已入库">
          {rewardFlights.map((reward, index) => (
            <div
              className="campaign-reward-token"
              style={{ "--reward-index": index, "--reward-color": reward.color } as React.CSSProperties}
              title={`${reward.label} ×${reward.amount}`}
              key={reward.id}
            >
              <i>{reward.symbol}</i><span>{reward.label}</span><strong>×{reward.amount}</strong>
            </div>
          ))}
        </div>
      ) : null}
      <BuildingPlacementCursor buildingId={game.cargo ? null : placement} count={placementCount} x={pointer.x} y={pointer.y} />
      <CargoCursor cargo={game.cargo} x={pointer.x} y={pointer.y} />
      {activeBlueprint ? <BlueprintPlacementCursor blueprint={activeBlueprint} x={pointer.x} y={pointer.y + (game.cargo ? 42 : 0)} /> : null}
      {connectionHint ? <div className={`connection-hint connection-hint--${connectionHint.tone}`} style={{ transform: `translate3d(${pointer.x + 18}px, ${pointer.y + 18}px, 0)` }}>{connectionHint.label}</div> : null}
      {notice ? <div className="game-notice" role="status">{notice}</div> : null}
    </main>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <FactoryGame />
    </ReactFlowProvider>
  );
}
