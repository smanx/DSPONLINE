import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeMouseHandler,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CargoCursor,
  ConstructionDock,
  HeaderControls,
  InspectorPanel,
  PlanetNavigator,
  ResourceRail,
} from "./components/GamePanels";
import { NODE_TYPES, type FactoryFlowNode, type FactoryNodeData } from "./components/FactoryNodes";
import { RecipeWorkspace } from "./components/RecipeWorkspace";
import { StatisticsWorkspace } from "./components/StatisticsWorkspace";
import { StarMapWorkspace } from "./components/StarMapWorkspace";
import { BlueprintPlacementCursor, BlueprintWorkspace, CanvasSelectionTools, SelectionToolbar } from "./components/BlueprintWorkspace";
import { DysonPlannerWorkspace } from "./components/DysonPlannerWorkspace";
import { OfflineReportWorkspace } from "./components/OfflineReportWorkspace";
import { OperationsWorkspace, type OperationsTab } from "./components/OperationsWorkspace";
import { TechnologyWorkspace } from "./components/TechnologyWorkspace";
import { ITEMS, getBeltConstructionId, getBuilding, getBuildingUpgradeTarget, getPlanet, getTechnology } from "./game/content";
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
  getBeltCapacity,
  getEntityOperatingStatus,
  handcraftRecipe,
  installSprayCoater,
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
  setActiveDysonLayer,
  setDysonLayerOrbit,
  setEnergyMode,
  setFuelItem,
  setLogisticsItem,
  setPaused,
  setProliferatorConfiguration,
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
import { getAchievement, unlockAchievements } from "./game/progression";
import { clearGame, clearGameSlot, exportGame, getSaveSlotSummaries, importGame, loadGame, loadGameSlot, saveGame, saveGameSlot, type OfflineReport, type SaveSlotId } from "./game/storage";
import type { BeltTier, BuildingId, DraggedItemSourceKind, EnergyMode, GameSettings, GameState, ItemId, PlacementCount, PlanetId, ProliferatorMode, ProliferatorTier, RecipeId, StarSystemId, StationMinimumLoad } from "./game/types";

type InspectorTab = "inspect" | "fabricate";

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
  const [technologyOpen, setTechnologyOpen] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [starMapOpen, setStarMapOpen] = useState(false);
  const [blueprintsOpen, setBlueprintsOpen] = useState(false);
  const [dysonPlannerOpen, setDysonPlannerOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [operationsTab, setOperationsTab] = useState<OperationsTab>("alerts");
  const [offlineReport, setOfflineReport] = useState<OfflineReport | null>(loaded.offlineReport);
  const [saveSlots, setSaveSlots] = useState(getSaveSlotSummaries);
  const [blueprintPlacementId, setBlueprintPlacementId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [miningEntityId, setMiningEntityId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<FactoryFlowNode>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const gameRef = useRef(game);
  const completedTechCountRef = useRef(game.research.completedTechIds.length);
  const achievementCountRef = useRef(game.achievements.unlockedIds.length);
  const miningTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const { screenToFlowPosition, setViewport } = useReactFlow();

  useEffect(() => { gameRef.current = game; }, [game]);

  const playTone = useCallback((kind: "confirm" | "complete" | "alert", force = false) => {
    if (!force && !gameRef.current.settings.soundEnabled) return;
    const context = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = context;
    if (context.state === "suspended") void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const frequency = kind === "complete" ? 780 : kind === "alert" ? 310 : 560;
    oscillator.type = kind === "alert" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    if (kind === "complete") oscillator.frequency.exponentialRampToValueAtTime(1040, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
  }, []);

  useEffect(() => {
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const seconds = Math.min(1, Math.max(0, (now - previous) / 1000)) * game.settings.simulationSpeed;
      previous = now;
      setGame((current) => advanceSimulation(current, seconds));
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlacement(null);
        setTechnologyOpen(false);
        setStatisticsOpen(false);
        setRecipesOpen(false);
        setStarMapOpen(false);
        setBlueprintsOpen(false);
        setDysonPlannerOpen(false);
        setOperationsOpen(false);
        setOfflineReport(null);
        setBlueprintPlacementId(null);
        setSelectionMode(false);
        setSelectedEntityIds([]);
        setGame((current) => dropCargoToTray(current));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
    setGame((current) => installMiner(current, entityId, count));
    setPlacement(null);
  }, []);

  const onAddBuilding = useCallback((entityId: string, buildingId: BuildingId, count: PlacementCount) => {
    setGame((current) => addBuildingToGroup(current, entityId, buildingId, count));
    setPlacement(null);
  }, []);

  const onRecipeChange = useCallback((entityId: string, recipeId: RecipeId) => {
    setGame((current) => setEntityRecipe(current, entityId, recipeId));
  }, []);

  const onFuelChange = useCallback((entityId: string, itemId: ItemId) => {
    setGame((current) => setFuelItem(current, entityId, itemId));
  }, []);

  const onEnergyModeChange = useCallback((entityId: string, mode: EnergyMode) => {
    setGame((current) => setEnergyMode(current, entityId, mode));
  }, []);

  const onPlanetChange = useCallback((planetId: PlanetId) => {
    onMiningStop();
    const cargo = gameRef.current.cargo;
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
  }, [onMiningStop, setNodes, setViewport]);

  const onExploreSystem = useCallback((systemId: StarSystemId) => {
    setGame((current) => exploreStarSystem(current, systemId));
    setNotice("恒星勘探完成，永久航标已写入星图");
  }, []);

  const alerts = useMemo(() => getFactoryAlerts(game), [game]);

  const updateSettings = useCallback((settings: Partial<GameSettings>) => {
    setGame((current) => ({ ...current, settings: { ...current.settings, ...settings } }));
    if (settings.soundEnabled === true) playTone("confirm", true);
  }, [playTone]);

  const restoreGame = useCallback((state: GameState, report: OfflineReport | null = null) => {
    onMiningStop();
    gameRef.current = state;
    completedTechCountRef.current = state.research.completedTechIds.length;
    achievementCountRef.current = state.achievements.unlockedIds.length;
    setGame(state);
    setOfflineReport(report);
    setSelectedEntityIds([]);
    setSelectedBeltId(null);
    setPlacement(null);
    setBlueprintPlacementId(null);
    setSelectionMode(false);
    setNodes([]);
    setOperationsOpen(false);
    setViewport({ x: 510, y: 250, zoom: 0.84 }, { duration: state.settings.reducedMotion ? 0 : 180 });
  }, [onMiningStop, setNodes, setViewport]);

  const selectAlert = useCallback((alert: FactoryAlert) => {
    if (gameRef.current.activePlanetId !== alert.planetId) onPlanetChange(alert.planetId);
    setSelectedEntityIds([alert.entityId]);
    setSelectedBeltId(null);
    setInspectorTab("inspect");
    setMobilePanel("inspector");
    setOperationsOpen(false);
    setNotice(`已定位：${alert.title} · ${alert.reason}`);
    playTone("alert");
  }, [onPlanetChange, playTone]);

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
      activeLogisticsEntityIds: [...new Set(game.belts
        .filter((belt) => belt.lastFlow > 0.001)
        .flatMap((belt) => [belt.source, belt.target]))],
      dysonSwarm: game.dysonSwarm,
      dysonSphere: game.dysonSphere,
    };
  }, [game.belts, game.cargo, game.dysonSphere, game.dysonSwarm, game.elapsedSeconds, game.paused, game.research.completedTechIds, game.research.progressByTech, game.research.selectedTechId, miningEntityId, onAddBuilding, onDropCargo, onDropDraggedItem, onEnergyModeChange, onFuelChange, onInstallMiner, onMiningStart, onMiningStop, onPickInput, onPickOutput, onRecipeChange, placement, placementCount]);

  useEffect(() => {
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
            connectedInputItemIds: game.belts.filter((belt) => belt.target === entity.id).map((belt) => belt.itemId),
            status: getEntityOperatingStatus(game, entity),
          } as FactoryNodeData,
          selected: selectedEntityIds.includes(entity.id),
          draggable: !placement && !blueprintPlacementId,
        } satisfies FactoryFlowNode;
      });
    });
  }, [blueprintPlacementId, commonNodeData, game.activePlanetId, game.entities, placement, selectedEntityIds, setNodes]);

  const edges = useMemo<Edge[]>(() => game.belts.filter((belt) => belt.planetId === game.activePlanetId).map((belt) => {
    const item = ITEMS[belt.itemId];
    const capacity = getBeltCapacity(belt);
    return {
      id: belt.id,
      source: belt.source,
      target: belt.target,
      sourceHandle: `out:${belt.itemId}`,
      targetHandle: `in:${belt.itemId}`,
      selected: selectedBeltId === belt.id,
      animated: belt.lastFlow > 0.001,
      label: `Mk.${belt.tier === 3 ? "III" : belt.tier === 2 ? "II" : "I"} · ${belt.lastFlow.toFixed(1)} / ${capacity.toFixed(0)} s⁻¹`,
      markerEnd: { type: MarkerType.ArrowClosed, color: item.color },
      style: { stroke: item.color, strokeWidth: selectedBeltId === belt.id ? 3 : 2 },
      labelStyle: { fill: "#d7dedb", fontSize: 10, fontWeight: 650 },
      labelBgStyle: { fill: "#171d1b", fillOpacity: 0.94 },
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 3,
    };
  }), [game.activePlanetId, game.belts, selectedBeltId]);

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
    setGame((current) => connectBelt(current, connection.source!, connection.target!, sourceItem, beltTier));
  }, [beltTier]);

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

  const onPaneClick = useCallback((event: React.MouseEvent) => {
    if (blueprintPlacementId) {
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const deployable = canPlaceBlueprint(gameRef.current, blueprintPlacementId);
      const blueprintName = gameRef.current.blueprints.find((blueprint) => blueprint.id === blueprintPlacementId)?.name ?? "蓝图";
      setGame((current) => placeBlueprint(current, blueprintPlacementId, position));
      setBlueprintPlacementId(null);
      setSelectedEntityIds([]);
      setNotice(deployable ? `${blueprintName}部署完成` : `${blueprintName}施工库存不足或与当前行星不兼容`);
      return;
    }
    if (placement) {
      if (getBuilding(placement).kind === "miner") {
        setNotice(minerPlacementHint(placement));
        return;
      }
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setGame((current) => placeBuilding(current, placement, position, placementCount));
      setPlacement(null);
      return;
    }
    setSelectedEntityIds([]);
    setSelectedBeltId(null);
  }, [blueprintPlacementId, placement, placementCount, screenToFlowPosition]);

  const onCanvasDrop = useCallback((event: React.DragEvent) => {
    const buildingId = event.dataTransfer.getData("application/factory-building") as BuildingId;
    if (!buildingId) return;
    event.preventDefault();
    if (getBuilding(buildingId).kind === "miner") {
      setNotice(minerPlacementHint(buildingId));
      return;
    }
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setGame((current) => placeBuilding(current, buildingId, position, placementCount));
    setPlacement(null);
    setBeltTier(1);
  }, [placementCount, screenToFlowPosition]);

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
    setGame((current) => createBlueprint(current, blueprintEligibleIds));
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
    setOfflineReport(null);
    setBlueprintPlacementId(null);
    setSelectionMode(false);
    setNotice("当前工厂已重置");
  };

  return (
    <main
      className={`game-shell${placement || blueprintPlacementId ? " game-shell--placing" : ""}${selectionMode ? " game-shell--selecting" : ""}${mobilePanel ? ` mobile-panel--${mobilePanel}` : ""}`}
      data-reduced-motion={game.settings.reducedMotion ? "true" : "false"}
      data-performance-mode={game.settings.performanceMode ? "true" : "false"}
    >
      <HeaderControls
        game={game}
        alertCount={alerts.length}
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
          setMobilePanel(null);
          setNotice(null);
        }}
        onOpenResources={() => { setMobilePanel((current) => current === "resources" ? null : "resources"); setNotice(null); }}
        onOpenInspector={() => { setMobilePanel((current) => current === "inspector" ? null : "inspector"); setNotice(null); }}
        onOpenRecipes={() => { setRecipesOpen(true); setTechnologyOpen(false); setStatisticsOpen(false); setMobilePanel(null); setNotice(null); }}
        onOpenTechnology={() => { setTechnologyOpen(true); setRecipesOpen(false); setStatisticsOpen(false); setMobilePanel(null); setNotice(null); }}
        onOpenStatistics={() => { setStatisticsOpen(true); setRecipesOpen(false); setTechnologyOpen(false); setMobilePanel(null); setNotice(null); }}
        onOpenStarMap={() => { setStarMapOpen(true); setStatisticsOpen(false); setRecipesOpen(false); setTechnologyOpen(false); setMobilePanel(null); setNotice(null); }}
      />
      <div className="game-workspace">
        <ResourceRail
          game={game}
          onOpenDysonPlanner={() => {
            setDysonPlannerOpen(true);
            setBlueprintsOpen(false);
            setStarMapOpen(false);
            setTechnologyOpen(false);
            setStatisticsOpen(false);
            setRecipesOpen(false);
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
        <section className="factory-canvas" aria-label="生产网络画布">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onSelectionChange={onSelectionChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeDragStop={(_event, node, draggedNodes) => {
              const moved = draggedNodes.length > 0 ? draggedNodes : [node];
              setGame((current) => moveEntities(current, moved.map((candidate) => ({ id: candidate.id, position: candidate.position }))));
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
            defaultViewport={{ x: 510, y: 250, zoom: 0.84 }}
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
            onCopy={copySelectionAsBlueprint}
            onUpgrade={() => {
              setGame((current) => upgradeEntities(current, selectedEntityIds));
              setNotice("已批量升级选区内可升级设备");
            }}
            onRemove={() => {
              setGame((current) => removeEntities(current, selectedEntityIds));
              setSelectedEntityIds([]);
              setNotice("选区设备已回收至施工托盘");
            }}
          />
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
          onStationModeChange={(entityId, mode) => setGame((current) => setStationMode(current, entityId, mode))}
          onStationVesselAdjust={(entityId, delta) => setGame((current) => adjustStationVessels(current, entityId, delta))}
          onStationDroneAdjust={(entityId, delta) => setGame((current) => adjustStationDrones(current, entityId, delta))}
          onStationWarperAdjust={(entityId, delta) => setGame((current) => adjustStationWarpers(current, entityId, delta))}
          onStationWarpEnabled={(entityId, enabled) => setGame((current) => setStationWarpEnabled(current, entityId, enabled))}
          onStationMinimumLoadChange={(entityId, minimumLoad: StationMinimumLoad) => setGame((current) => setStationMinimumLoad(current, entityId, minimumLoad))}
          onLogisticsItemChange={(entityId, itemId) => setGame((current) => setLogisticsItem(current, entityId, itemId))}
          onSplitterModeChange={(entityId, mode) => setGame((current) => setSplitterMode(current, entityId, mode))}
          onBeltPriorityChange={(beltId, priority) => setGame((current) => setBeltPriority(current, beltId, priority))}
          onUpgradeEntity={(entityId) => {
            const entity = gameRef.current.entities.find((candidate) => candidate.id === entityId);
            const targetId = entity?.buildingId ? getBuildingUpgradeTarget(entity.buildingId) : undefined;
            setGame((current) => upgradeEntity(current, entityId));
            if (targetId) setNotice(`设备已升级为${getBuilding(targetId).name}`);
          }}
          onUpgradeBelt={(beltId) => {
            setGame((current) => upgradeBelt(current, beltId));
            setNotice("运输线升级完成");
          }}
          onUpgradeSorter={(beltId) => {
            setGame((current) => upgradeSorter(current, beltId));
            setNotice("分拣器升级完成");
          }}
          onInstallSprayCoater={(entityId) => {
            setGame((current) => installSprayCoater(current, entityId));
            setNotice("喷涂模块安装完成，可接入增产剂并选择生产模式");
          }}
          onProliferatorConfiguration={(entityId, tier: ProliferatorTier, mode: ProliferatorMode) => {
            setGame((current) => setProliferatorConfiguration(current, entityId, tier, mode));
            const modeName = mode === "extra" ? "额外产出" : mode === "speed" ? "生产加速" : "正常生产";
            setNotice(`喷涂配置已切换：Mk.${tier === 3 ? "III" : tier === 2 ? "II" : "I"} · ${modeName}`);
          }}
          onCraft={(buildingId) => setGame((current) => craftConstruction(current, buildingId))}
          onCraftItem={(recipeId, batches) => setGame((current) => handcraftRecipe(current, recipeId, batches))}
          onRemoveEntity={(entityId) => {
            setGame((current) => removeEntity(current, entityId));
            setSelectedEntityIds((current) => current.filter((id) => id !== entityId));
          }}
          onRemoveBelt={(beltId) => {
            setGame((current) => removeBelt(current, beltId));
            setSelectedBeltId(null);
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
      <TechnologyWorkspace
        open={technologyOpen}
        game={game}
        onClose={() => setTechnologyOpen(false)}
        onSelect={(techId) => setGame((current) => selectTechnology(current, techId))}
        onRemoveQueued={(techId) => setGame((current) => removeQueuedTechnology(current, techId))}
      />
      {statisticsOpen ? <StatisticsWorkspace open game={game} onClose={() => setStatisticsOpen(false)} /> : null}
      <RecipeWorkspace open={recipesOpen} game={game} onClose={() => setRecipesOpen(false)} />
      <StarMapWorkspace
        open={starMapOpen}
        game={game}
        onClose={() => setStarMapOpen(false)}
        onExplore={onExploreSystem}
        onTravel={(planetId) => { onPlanetChange(planetId); setStarMapOpen(false); }}
      />
      <BlueprintWorkspace
        open={blueprintsOpen}
        game={game}
        onClose={() => setBlueprintsOpen(false)}
        onDeploy={deployBlueprint}
        onRemove={(blueprintId) => {
          setGame((current) => removeBlueprint(current, blueprintId));
          if (blueprintPlacementId === blueprintId) setBlueprintPlacementId(null);
        }}
        onRename={(blueprintId, name) => setGame((current) => renameBlueprint(current, blueprintId, name))}
      />
      <DysonPlannerWorkspace
        open={dysonPlannerOpen}
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
      <OperationsWorkspace
        open={operationsOpen}
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
      <OfflineReportWorkspace report={offlineReport} onClose={() => setOfflineReport(null)} />
      <button className="mobile-backdrop" type="button" aria-label="关闭侧栏" onClick={() => setMobilePanel(null)} />
      <CargoCursor cargo={game.cargo} x={pointer.x} y={pointer.y} />
      {activeBlueprint ? <BlueprintPlacementCursor blueprint={activeBlueprint} x={pointer.x} y={pointer.y + (game.cargo ? 42 : 0)} /> : null}
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
