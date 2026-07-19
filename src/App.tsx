import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeMouseHandler,
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
import { TechnologyWorkspace } from "./components/TechnologyWorkspace";
import { ITEMS, getBeltConstructionId, getBuilding, getBuildingUpgradeTarget, getPlanet, getTechnology } from "./game/content";
import {
  addBuildingToGroup,
  adjustStationDrones,
  adjustStationWarpers,
  adjustStationVessels,
  advanceSimulation,
  connectBelt,
  craftConstruction,
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
  moveEntity,
  moveTrayItemToEntity,
  pickFromEntity,
  pickFromEntityInput,
  pickFromTray,
  placeBuilding,
  removeBelt,
  removeEntity,
  removeQueuedTechnology,
  selectTechnology,
  setBeltPriority,
  setActivePlanet,
  setEntityRecipe,
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
  upgradeEntity,
  upgradeSorter,
} from "./game/engine";
import { clearGame, loadGame, saveGame } from "./game/storage";
import type { BeltTier, BuildingId, DraggedItemSourceKind, EnergyMode, ItemId, PlacementCount, PlanetId, ProliferatorMode, ProliferatorTier, RecipeId, StarSystemId, StationMinimumLoad } from "./game/types";

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
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
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
  const [miningEntityId, setMiningEntityId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<FactoryFlowNode>([]);
  const [notice, setNotice] = useState<string | null>(() => loaded.offlineSeconds >= 1
    ? `离线运行 ${Math.floor(loaded.offlineSeconds / 60)} 分钟，生产网络已完成结算`
    : null);
  const [pointer, setPointer] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const gameRef = useRef(game);
  const completedTechCountRef = useRef(game.research.completedTechIds.length);
  const miningTimerRef = useRef<number | null>(null);
  const { screenToFlowPosition, setViewport } = useReactFlow();

  useEffect(() => { gameRef.current = game; }, [game]);

  useEffect(() => {
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const seconds = Math.min(0.5, Math.max(0, (now - previous) / 1000));
      previous = now;
      setGame((current) => advanceSimulation(current, seconds));
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => saveGame(gameRef.current), 2000);
    const saveNow = () => saveGame(gameRef.current);
    window.addEventListener("beforeunload", saveNow);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("beforeunload", saveNow);
      saveNow();
    };
  }, []);

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
      if (technology) setNotice(`${technology.name}研究完成`);
    }
    completedTechCountRef.current = count;
  }, [game.research.completedTechIds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlacement(null);
        setTechnologyOpen(false);
        setStatisticsOpen(false);
        setRecipesOpen(false);
        setStarMapOpen(false);
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
    setSelectedEntityId(null);
    setSelectedBeltId(null);
    setPlacement(null);
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
          selected: selectedEntityId === entity.id,
          draggable: !placement,
        } satisfies FactoryFlowNode;
      });
    });
  }, [commonNodeData, game.activePlanetId, game.entities, placement, selectedEntityId, setNodes]);

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

  const onNodeClick: NodeMouseHandler<FactoryFlowNode> = useCallback((_event, node) => {
    if (placement) return;
    setSelectedEntityId(node.id);
    setSelectedBeltId(null);
    setInspectorTab("inspect");
    setMobilePanel("inspector");
  }, [placement]);

  const onPaneClick = useCallback((event: React.MouseEvent) => {
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
    setSelectedEntityId(null);
    setSelectedBeltId(null);
  }, [placement, placementCount, screenToFlowPosition]);

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

  const selectedEntity = game.entities.find((entity) => entity.id === selectedEntityId && entity.planetId === game.activePlanetId) ?? null;
  const selectedBelt = game.belts.find((belt) => belt.id === selectedBeltId && belt.planetId === game.activePlanetId) ?? null;

  const reset = () => {
    clearGame();
    setGame(createInitialState());
    setPlacement(null);
    setPlacementCount(1);
    setSelectedEntityId(null);
    setSelectedBeltId(null);
    setNodes([]);
    setTechnologyOpen(false);
    setStatisticsOpen(false);
    setRecipesOpen(false);
    setStarMapOpen(false);
    setNotice("当前工厂已重置");
  };

  return (
    <main className={`game-shell${placement ? " game-shell--placing" : ""}${mobilePanel ? ` mobile-panel--${mobilePanel}` : ""}`}>
      <HeaderControls
        game={game}
        onPauseToggle={() => setGame((current) => setPaused(current, !current.paused))}
        onReset={reset}
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
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeDragStop={(_event, node) => {
              setGame((current) => moveEntity(current, node.id, node.position));
            }}
            onEdgeClick={(_event, edge) => {
              setSelectedBeltId(edge.id);
              setSelectedEntityId(null);
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
            zoomOnDoubleClick={false}
            deleteKeyCode={null}
            fitViewOptions={{ padding: 0.18 }}
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
          <div className="canvas-status">
            <span className={game.paused ? "paused" : "running"}>{game.paused ? "模拟暂停" : "实时运行"}</span>
            <strong>{getPlanet(game.activePlanetId).name} · {getPlanet(game.activePlanetId).code}工厂区</strong>
          </div>
        </section>
        <InspectorPanel
          game={game}
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
            setSelectedEntityId(null);
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
        onPlacementChange={setPlacement}
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
      <button className="mobile-backdrop" type="button" aria-label="关闭侧栏" onClick={() => setMobilePanel(null)} />
      <CargoCursor cargo={game.cargo} x={pointer.x} y={pointer.y} />
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
