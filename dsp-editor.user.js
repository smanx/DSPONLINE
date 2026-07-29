// ==UserScript==
// @name         DSP 极简网络 - 施工托盘编辑器
// @namespace    http://tampermonkey.net/
// @version      7.2
// @description  实时编辑施工托盘、矿脉矿机、已部署设备、运输并行线、行星物资 + FPS
// @author       you
// @match        https://dsponline.cn/*
// @match        https://dsponline.cn/
// @icon         https://dsponline.cn/favicon.ico
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PLANET_NAMES = {
    home: '澄海 I', ashen: '烬原 II', giant: '苍岚 III',
    frost: '霜原 I', boreal_giant: '青冥 II', magnetar: '极夜 I',
    verdant: '翠环 I', pelagic: '澜渊 II', dune: '赤砂 I',
    cinder: '灰烬 II', crystal: '晶穹 I', prairie: '牧云 II',
    salt: '白盐 I', obsidian: '黑曜 II', tempest: '风暴 I',
    inferno: '炽核 II', abyss: '幽冥 III',
    aurora_giant: '天穹 III', ember_giant: '红飓 III',
    sirius_giant: '银冠 III', white_giant: '苍白 III', azure_giant: '蓝穹 IV',
  };

  const ITEM_LABELS = {
    wind_turbine: '风力涡轮机', solar_panel: '太阳能板',
    geothermal_power_station: '地热发电站', thermal_power_plant: '火力发电厂',
    mini_fusion_power_plant: '微型聚变发电站', artificial_star: '人造恒星',
    accumulator: '蓄电器', energy_exchanger: '能量枢纽',
    mining_machine: '采矿机', arc_smelter: '电弧熔炉',
    plane_smelter: '位面熔炉',
    assembling_machine_mk1: '制造台 Mk.I', assembling_machine_mk2: '制造台 Mk.II',
    assembling_machine_mk3: '制造台 Mk.III', spray_coater: '喷涂机',
    matrix_lab: '矩阵研究站',
    conveyor_belt_mk1: '传送带 Mk.I', conveyor_belt_mk2: '传送带 Mk.II',
    conveyor_belt_mk3: '传送带 Mk.III',
    sorter_mk1: '分拣器 Mk.I', sorter_mk2: '分拣器 Mk.II',
    sorter_mk3: '分拣器 Mk.III',
    oil_extractor: '原油萃取站', oil_refinery: '原油精炼厂',
    water_pump: '抽水站', chemical_plant: '化工厂',
    quantum_chemical_plant: '量子化工厂', fractionator: '分馏塔',
    miniature_particle_collider: '微型粒子对撞机',
    em_rail_ejector: '电磁轨道弹射器', ray_receiver: '射线接收站',
    vertical_launching_silo: '垂直发射井',
    planetary_logistics_station: '行星物流站',
    interstellar_logistics_station: '星际物流站',
    orbital_collector: '轨道采集器',
    storage_mk1: '小型储物仓', storage_tank: '储液罐',
    material_delivery_hub: '物资配送枢纽',
    splitter_4way: '四向分流器',
    construction_center: '建筑制造中心',
    galactic_material_exporter: '超大型物资出口',
    micro_black_hole_connector: '微型黑洞连接装置',
    time_warp_device: '时间扭曲装置',
  };

  const RESOURCE_NAMES = {
    iron_ore: '铁矿石', copper_ore: '铜矿石', stone: '石矿', coal: '煤矿',
    crude_oil: '原油', water: '水', silicon_ore: '硅石', titanium_ore: '钛石',
    fire_ice: '可燃冰', kimberlite_ore: '金伯利矿石', fractal_silicon: '分形硅石',
    optical_grating_crystal: '光栅石', spiniform_stalagmite_crystal: '刺笋结晶',
    unipolar_magnet: '单极磁石', sulfuric_acid: '硫酸',
  };

  const EXTRACTOR_MAP = {
    mining_machine: ['iron_ore', 'copper_ore', 'stone', 'coal', 'silicon_ore', 'titanium_ore',
                     'kimberlite_ore', 'fractal_silicon', 'optical_grating_crystal',
                     'spiniform_stalagmite_crystal', 'unipolar_magnet', 'fire_ice'],
    oil_extractor: ['crude_oil'],
    water_pump: ['water', 'sulfuric_acid'],
  };

  // All tray-able items (materials, not buildings) organized by category
  const TRAY_ITEM_CATEGORIES = [
    {
      name: '矿物原料', items: [
        ['iron_ore', '铁矿石'], ['copper_ore', '铜矿石'], ['stone', '石矿'], ['coal', '煤矿'],
        ['crude_oil', '原油'], ['water', '水'], ['silicon_ore', '硅石'], ['titanium_ore', '钛石'],
        ['fire_ice', '可燃冰'], ['kimberlite_ore', '金伯利矿石'], ['fractal_silicon', '分形硅石'],
        ['optical_grating_crystal', '光栅石'], ['spiniform_stalagmite_crystal', '刺笋结晶'],
        ['unipolar_magnet', '单极磁石'], ['sulfuric_acid', '硫酸'],
      ]
    },
    {
      name: '基础材料', items: [
        ['iron_ingot', '铁块'], ['copper_ingot', '铜块'], ['magnet', '磁铁'],
        ['stone_brick', '石材'], ['glass', '玻璃'], ['steel', '钢材'], ['gear', '齿轮'],
        ['magnetic_coil', '磁线圈'], ['circuit_board', '电路板'], ['prism', '棱镜'],
        ['plasma_exciter', '电浆激发器'], ['energetic_graphite', '高能石墨'],
        ['refined_oil', '精炼油'], ['hydrogen', '氢'], ['high_purity_silicon', '高纯硅块'],
        ['titanium_ingot', '钛块'], ['titanium_alloy', '钛合金'], ['diamond', '金刚石'],
      ]
    },
    {
      name: '高级组件', items: [
        ['microcrystalline_component', '微晶元件'], ['processor', '处理器'],
        ['logistics_drone', '物流运输机'], ['logistics_vessel', '物流运输船'],
        ['space_warper', '空间翘曲器'], ['graphene', '石墨烯'],
        ['carbon_nanotube', '碳纳米管'], ['crystal_silicon', '晶格硅'],
        ['particle_broadband', '粒子宽带'], ['electric_motor', '电动机'],
        ['electromagnetic_turbine', '电磁涡轮'], ['super_magnetic_ring', '超级磁场环'],
        ['particle_container', '粒子容器'], ['deuterium', '氘'],
        ['titanium_glass', '钛化玻璃'], ['casimir_crystal', '卡西米尔晶体'],
        ['plastic', '塑料'], ['titanium_crystal', '钛晶石'], ['organic_crystal', '有机晶体'],
      ]
    },
    {
      name: '增产剂', items: [
        ['proliferator_mk1', '增产剂 Mk.I'], ['proliferator_mk2', '增产剂 Mk.II'],
        ['proliferator_mk3', '增产剂 Mk.III'],
      ]
    },
    {
      name: '燃料与特殊', items: [
        ['accumulator', '蓄电器'], ['charged_accumulator', '蓄电器（满）'],
        ['hydrogen_fuel_rod', '氢燃料棒'], ['deuteron_fuel_rod', '氘核燃料棒'],
        ['plane_filter', '位面过滤器'], ['quantum_chip', '量子芯片'],
        ['strange_matter', '奇异物质'], ['graviton_lens', '引力透镜'],
        ['photon_combiner', '光子合并器'], ['solar_sail', '太阳帆'],
        ['critical_photon', '临界光子'], ['antimatter', '反物质'],
        ['annihilation_constraint_sphere', '湮灭约束球'],
        ['antimatter_fuel_rod', '反物质燃料棒'], ['frame_material', '框架材料'],
        ['dyson_sphere_component', '戴森球组件'], ['small_carrier_rocket', '小型运载火箭'],
      ]
    },
    {
      name: '科研矩阵', items: [
        ['electromagnetic_matrix', '电磁矩阵'], ['energy_matrix', '能量矩阵'],
        ['structure_matrix', '结构矩阵'], ['information_matrix', '信息矩阵'],
        ['gravity_matrix', '引力矩阵'], ['universe_matrix', '宇宙矩阵'],
      ]
    },
    {
      name: '设备', items: [
        ['wind_turbine', '风力涡轮机'], ['solar_panel', '太阳能板'],
        ['geothermal_power_station', '地热发电站'], ['thermal_power_plant', '火力发电厂'],
        ['mini_fusion_power_plant', '微型聚变发电站'], ['artificial_star', '人造恒星'],
        ['energy_exchanger', '能量枢纽'],
        ['mining_machine', '采矿机'], ['arc_smelter', '电弧熔炉'],
        ['plane_smelter', '位面熔炉'],
        ['assembling_machine_mk1', '制造台 Mk.I'], ['assembling_machine_mk2', '制造台 Mk.II'],
        ['assembling_machine_mk3', '制造台 Mk.III'], ['spray_coater', '喷涂机'],
        ['matrix_lab', '矩阵研究站'],
        ['conveyor_belt_mk1', '传送带 Mk.I'], ['conveyor_belt_mk2', '传送带 Mk.II'],
        ['conveyor_belt_mk3', '传送带 Mk.III'],
        ['sorter_mk1', '分拣器 Mk.I'], ['sorter_mk2', '分拣器 Mk.II'],
        ['sorter_mk3', '分拣器 Mk.III'],
        ['oil_extractor', '原油萃取站'], ['oil_refinery', '原油精炼厂'],
        ['water_pump', '抽水站'], ['chemical_plant', '化工厂'],
        ['quantum_chemical_plant', '量子化工厂'], ['fractionator', '分馏塔'],
        ['miniature_particle_collider', '微型粒子对撞机'],
        ['em_rail_ejector', '电磁轨道弹射器'], ['ray_receiver', '射线接收站'],
        ['vertical_launching_silo', '垂直发射井'],
        ['planetary_logistics_station', '行星物流站'],
        ['interstellar_logistics_station', '星际物流站'],
        ['orbital_collector', '轨道采集器'],
        ['storage_mk1', '小型储物仓'], ['storage_tank', '储液罐'],
        ['material_delivery_hub', '物资配送枢纽'],
        ['splitter_4way', '四向分流器'],
        ['construction_center', '建筑制造中心'],
        ['galactic_material_exporter', '超大型物资出口'],
        ['micro_black_hole_connector', '微型黑洞连接装置'],
        ['time_warp_device', '时间扭曲装置'],
      ]
    },
  ];

  // Flatten for quick lookup
  const TRAY_ITEMS = {};
  for (const cat of TRAY_ITEM_CATEGORIES) {
    for (const [id, name] of cat.items) {
      TRAY_ITEMS[id] = name;
    }
  }

  let game = null;
  let panelVisible = false;
  let currentTab = 'construction';

  function findGameState() {
    const root = document.getElementById('root');
    if (!root) return;
    const key = Object.keys(root).find(k => k.startsWith('__reactContainer$'));
    if (!key) return;
    let fiber = root[key];
    let state = null, dispatch = null;
    function walk(f) {
      if (!f || state) return;
      if (f.memoizedState) {
        let hook = f.memoizedState;
        while (hook) {
          if (hook.queue && typeof hook.queue.lastRenderedState !== 'undefined') {
            const val = hook.queue.lastRenderedState;
            if (val && typeof val === 'object' && val.entities && val.construction) {
              state = val; dispatch = hook.queue.dispatch; return;
            }
          }
          hook = hook.next;
        }
      }
      walk(f.child); if (!state) walk(f.sibling);
    }
    walk(fiber);
    return { state, dispatch };
  }

  function sync() {
    const found = findGameState();
    if (found && found.state) { game = found; return true; }
    return false;
  }

  function commit() { if (game) game.dispatch(Object.assign({}, game.state)); }

  function getExtractor(resourceId) {
    for (const [machine, resources] of Object.entries(EXTRACTOR_MAP)) {
      if (resources.includes(resourceId)) return machine;
    }
    return 'mining_machine';
  }

  // --- Floating Button ---
  const btn = document.createElement('div');
  btn.id = 'dsp-editor-btn';
  btn.textContent = '⚙';
  btn.title = 'DSP 编辑器';
  Object.assign(btn.style, {
    position: 'fixed', zIndex: 99999, bottom: '80px', right: '20px',
    width: '44px', height: '44px', borderRadius: '50%',
    background: '#1a1a2e', color: '#e0d6b0', fontSize: '22px',
    lineHeight: '44px', textAlign: 'center', cursor: 'grab',
    userSelect: 'none', boxShadow: '0 2px 12px rgba(0,0,0,.5)',
    fontFamily: 'sans-serif', transition: 'opacity .15s', opacity: '.55',
  });
  btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
  btn.addEventListener('mouseleave', () => { if (!panelVisible) btn.style.opacity = '.55'; });
  (function () {
    let dx, dy;
    btn.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const r = btn.getBoundingClientRect();
      dx = e.clientX - r.left; dy = e.clientY - r.top;
      const onMove = ev => {
        btn.style.left = (ev.clientX - dx) + 'px';
        btn.style.top = (ev.clientY - dy) + 'px';
        btn.style.bottom = 'auto'; btn.style.right = 'auto';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        btn.style.cursor = 'grab';
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  })();
  btn.addEventListener('click', e => { e.preventDefault(); togglePanel(); });
  document.body.appendChild(btn);

  // --- Overlay & Panel ---
  const overlay = document.createElement('div');
  overlay.id = 'dsp-editor-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: 99998,
    background: 'rgba(0,0,0,.4)', display: 'none',
    justifyContent: 'center', alignItems: 'center',
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) hidePanel(); });
  document.body.appendChild(overlay);

  const panel = document.createElement('div');
  panel.id = 'dsp-editor-panel';
  Object.assign(panel.style, {
    background: '#0f0f1a', color: '#d4ccb0', borderRadius: '12px',
    padding: '20px 24px', maxHeight: '85vh', width: '680px', maxWidth: '92vw',
    overflow: 'auto', fontFamily: '"Segoe UI", "PingFang SC", sans-serif',
    fontSize: '13px', boxShadow: '0 8px 40px rgba(0,0,0,.7)',
    border: '1px solid #2a2a40',
  });
  overlay.appendChild(panel);

  // --- Title ---
  const titleRow = document.createElement('div');
  Object.assign(titleRow.style, {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #2a2a40',
  });
  titleRow.innerHTML = '<strong style="font-size:16px">🛠 DSP 编辑器</strong><span style="color:#888;font-size:12px">修改后即时生效</span>';
  panel.appendChild(titleRow);

  // --- Global Multiplier ---
  const multRow = document.createElement('div');
  Object.assign(multRow.style, {
    display: 'flex', gap: '8px', marginBottom: '10px',
    padding: '8px 12px', background: '#1a1a2e', borderRadius: '6px',
    alignItems: 'center',
  });
  const multLabel = document.createElement('span');
  multLabel.textContent = '全局倍率: ';
  multLabel.style.color = '#ff8';
  multLabel.style.fontSize = '13px';
  multLabel.style.fontWeight = 'bold';
  const multInput = document.createElement('input');
  multInput.type = 'number'; multInput.step = '0.1'; multInput.min = '0'; multInput.value = '2';
  Object.assign(multInput.style, {
    width: '60px', padding: '3px 8px', borderRadius: '4px',
    border: '1px solid #555', background: '#111', color: '#e0d6b0',
    fontSize: '13px', textAlign: 'center',
  });
  const multHint = document.createElement('span');
  multHint.textContent = '× 设备数 · 并行线 · 矿机 · 物流载具';
  multHint.style.color = '#666';
  multHint.style.fontSize = '11px';
  const multBtn = document.createElement('button');
  multBtn.textContent = '应用';
  Object.assign(multBtn.style, {
    padding: '4px 16px', borderRadius: '6px', border: '1px solid #5a5',
    background: '#2a4a2a', color: '#8f8', cursor: 'pointer',
    fontSize: '13px', fontWeight: 'bold',
  });
  multBtn.addEventListener('click', async () => {
    if (!game) return;
    const f = parseFloat(multInput.value);
    if (isNaN(f) || f < 0) return;
    const R = v => Math.max(v === 0 ? 0 : 1, Math.round(v * f));
    for (const e of game.state.entities) {
      if (e.kind === 'vein' && (e.minerCount || 0) > 0) {
        e.minerCount = R(e.minerCount);
        e.machineCount = e.minerCount;
      } else if (e.kind !== 'vein' && e.buildingId && (e.machineCount || 0) > 0) {
        e.machineCount = R(e.machineCount);
      }
      if ((e.buildingId === 'planetary_logistics_station' || e.buildingId === 'interstellar_logistics_station') && (e.stationDrones || 0) > 0) {
        e.stationDrones = R(e.stationDrones);
      }
      if (e.buildingId === 'interstellar_logistics_station') {
        if ((e.stationVessels || 0) > 0) e.stationVessels = R(e.stationVessels);
        if ((e.stationWarpers || 0) > 0) e.stationWarpers = R(e.stationWarpers);
      }
    }
    // Smart recalc belt lanes instead of simple multiply
    multBtn.disabled = true;
    const changed = await autoCalcBeltLanes();
    multBtn.disabled = false;
    commit();
    if (document.querySelector('#dsp-editor-panel')?.style.display !== 'none') {
      if (typeof autoLanesStatus !== 'undefined') autoLanesStatus.textContent = `已更新 ${changed} 条线路`;
      setTimeout(() => { if (typeof autoLanesStatus !== 'undefined') autoLanesStatus.textContent = ''; }, 3000);
    }
  });
  multRow.appendChild(multLabel);
  multRow.appendChild(multInput);
  multRow.appendChild(multBtn);
  // Auto lanes button (right side)
  const autoLanesBtn = document.createElement('button');
  autoLanesBtn.textContent = '⚡ 智能并行线';
  autoLanesBtn.title = '按设备产量/消耗量自动设置所有传送带并行数';
  Object.assign(autoLanesBtn.style, {
    padding: '4px 12px', borderRadius: '6px', border: '1px solid #fa8',
    background: '#3a2a1a', color: '#fa8', cursor: 'pointer',
    fontSize: '12px', marginLeft: 'auto',
  });
  const autoLanesStatus = document.createElement('span');
  autoLanesStatus.style.cssText = 'font-size:11px;color:#8f8;margin-left:6px;';
  autoLanesBtn.addEventListener('click', async () => {
    autoLanesBtn.disabled = true;
    autoLanesBtn.textContent = '计算中...';
    const n = await autoCalcBeltLanes();
    autoLanesBtn.textContent = '⚡ 智能并行线';
    autoLanesBtn.disabled = false;
    autoLanesStatus.textContent = `已更新 ${n} 条传送带`;
    setTimeout(() => { autoLanesStatus.textContent = ''; }, 3000);
  });
  multRow.appendChild(autoLanesBtn);
  multRow.appendChild(autoLanesStatus);
  multRow.appendChild(multHint);
  panel.appendChild(multRow);

  // --- Tabs ---
  const tabBar = document.createElement('div');
  Object.assign(tabBar.style, {
    display: 'flex', gap: '4px', marginBottom: '10px', flexWrap: 'wrap',
  });
  const tabs = [
    { id: 'construction', label: '施工托盘' },
    { id: 'veins', label: '矿脉矿机' },
    { id: 'buildings', label: '已部署设备' },
    { id: 'belts', label: '运输线路' },
    { id: 'dyson', label: '戴森球' },
    { id: 'planettray', label: '星球物资' },
  ];
  const tabButtons = {};
  for (const t of tabs) {
    const tb = document.createElement('button');
    tb.textContent = t.label;
    Object.assign(tb.style, {
      padding: '6px 14px', borderRadius: '6px', border: '1px solid #2a2a40',
      background: t.id === currentTab ? '#2a2a50' : 'transparent',
      color: t.id === currentTab ? '#e0d6b0' : '#666', cursor: 'pointer',
      fontSize: '12px', transition: '.15s',
    });
    tb.addEventListener('click', () => switchTab(t.id));
    tabButtons[t.id] = tb;
    tabBar.appendChild(tb);
  }
  panel.appendChild(tabBar);

  // --- Content ---
  const content = document.createElement('div');
  content.id = 'dsp-editor-content';
  panel.appendChild(content);

  // --- Footer ---
  const footer = document.createElement('div');
  Object.assign(footer.style, {
    marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #2a2a40',
    display: 'flex', gap: '8px', justifyContent: 'flex-end',
  });
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '关闭';
  Object.assign(closeBtn.style, {
    padding: '6px 18px', borderRadius: '6px', border: '1px solid #3a3a55',
    background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: '13px',
  });
  closeBtn.addEventListener('click', hidePanel);
  footer.appendChild(closeBtn);
  panel.appendChild(footer);

  // --- Tab switching ---
  function switchTab(id) {
    currentTab = id;
    for (const [tid, tb] of Object.entries(tabButtons)) {
      tb.style.background = tid === id ? '#2a2a50' : 'transparent';
      tb.style.color = tid === id ? '#e0d6b0' : '#666';
    }
    renderContent();
  }

  function renderContent() {
    content.innerHTML = '';
    if (!game) return;
    if (currentTab === 'construction') renderConstruction();
    else if (currentTab === 'veins') renderVeins();
    else if (currentTab === 'buildings') renderBuildings();
    else if (currentTab === 'belts') renderBelts();
    else if (currentTab === 'dyson') renderDyson();
    else if (currentTab === 'planettray') renderPlanetTray();
  }

  // helper: get display label for an entity
  function entityLabel(id) {
    if (!game) return id;
    const e = game.state.entities.find(x => x.id === id);
    if (!e) return id;
    if (e.kind === 'vein') return RESOURCE_NAMES[e.resourceId] || e.resourceId;
    return ITEM_LABELS[e.buildingId] || e.buildingId || id;
  }

  // helper: get entity planet
  function entityPlanet(id) {
    if (!game) return null;
    const e = game.state.entities.find(x => x.id === id);
    return e ? e.planetId : null;
  }

  // helper: calculate max throughput (items/s) for an entity producing/consuming itemId
  let _recipeDb = null, _buildingDb = null;
  let _gameCorePromise = null;
  async function ensureGameCore() {
    if (_recipeDb && _buildingDb) return;
    if (_gameCorePromise) { await _gameCorePromise; return; }
    _gameCorePromise = (async () => {
      try {
        const resources = performance.getEntriesByType('resource');
        const url = resources.find(r => r.name.includes('game-core'))?.name;
        if (url) {
          const mod = await import(url);
          // Search module exports for objects matching RecipeDefinition and BuildingDefinition shapes
          let recipes = null, buildings = null;
          for (const key of Object.keys(mod)) {
            const val = mod[key];
            if (val && typeof val === 'object' && !Array.isArray(val)) {
              const values = Object.values(val);
              if (values.length === 0) continue;
              const sample = values.find(v => v && typeof v === 'object');
              if (!sample) continue;
              if ('duration' in sample && 'inputs' in sample && 'outputs' in sample && 'buildingId' in sample) {
                recipes = val;
              }
              if ('speed' in sample && 'kind' in sample && 'inputCapacity' in sample) {
                buildings = val;
              }
            }
          }
          if (recipes && buildings) {
            _recipeDb = (id) => recipes[id] || null;
            _buildingDb = (id) => buildings[id] || null;
            return;
          }
        }
        console.log('[DSP Editor] Failed to load game core');
      } catch (e) { console.log('[DSP Editor] Async error:', e); }
    })();
    await _gameCorePromise;
  }
  const BELT_SPEED = { 1: 6, 2: 12, 3: 30 };

  function calcOutputRate(entity, itemId) {
    if (!entity || !itemId) return 0;
    const machCount = entity.kind === 'vein' ? (entity.minerCount || 0) : (entity.machineCount || 0);
    if (machCount === 0) return 0;

    if (entity.kind === 'vein') {
      const baseSpeed = { mining_machine: 0.5, oil_extractor: 1, water_pump: 1 };
      const ext = entity.extractorBuildingId || 'mining_machine';
      return machCount * (baseSpeed[ext] || 0.5);
    }

    // Handle extractor buildings that sit on veins but appear as separate entities
    if (!entity.recipeId && entity.buildingId && ['mining_machine', 'oil_extractor', 'water_pump'].includes(entity.buildingId)) {
      const baseSpeed = { mining_machine: 0.5, oil_extractor: 1, water_pump: 1 };
      return machCount * (baseSpeed[entity.buildingId] || 0.5);
    }

    if (entity.recipeId && _recipeDb) {
      try {
        const recipe = _recipeDb(entity.recipeId);
        if (!recipe) return 0;
        const outputs = recipe.outputs || recipe.products || [];
        const output = outputs.find(o => o.itemId === itemId || o.id === itemId);
        if (!output) return 0;
        const bld = _buildingDb(entity.buildingId);
        const speed = bld?.speed || 1;
        return machCount * (output.amount || output.count || 1) * (speed / recipe.duration);
      } catch (e) { return 0; }
    }
    return 0;
  }

  function calcInputRate(entity, itemId) {
    if (!entity || !itemId || !entity.recipeId || !_recipeDb) return 0;
    const machCount = entity.machineCount || 0;
    if (machCount === 0) return 0;
    try {
      const recipe = _recipeDb(entity.recipeId);
      if (!recipe) return 0;
      const inputs = recipe.inputs || recipe.ingredients || [];
      const input = inputs.find(i => i.itemId === itemId || i.id === itemId);
      if (!input) return 0;
      const bld = _buildingDb(entity.buildingId);
      const speed = bld?.speed || 1;
      return machCount * (input.amount || input.count || 1) * (speed / recipe.duration);
    } catch { return 0; }
  }

  async function autoCalcBeltLanes() {
    if (!game) return 0;
    await ensureGameCore();
    if (!_recipeDb) { console.log('[DSP Editor] No recipe DB, skipping'); return 0; }
    const belts = game.state.belts || [];
    let changed = 0;
    for (const b of belts) {
      const src = game.state.entities.find(e => e.id === b.source);
      const tgt = game.state.entities.find(e => e.id === b.target);
      const outRate = calcOutputRate(src, b.itemId);
      const inRate = calcInputRate(tgt, b.itemId);
      // 以下游消耗为准（需求驱动），若下游无消耗则用上游产出
      const demand = inRate > 0 ? inRate : outRate;
      if (demand === 0) continue;
      const beltSpeed = BELT_SPEED[b.tier] || 6;
      const stackSize = b.stack || 1;
      const BUFFER = 1.1;
      const needed = Math.min(4096, Math.max(1, Math.ceil(demand * BUFFER / (beltSpeed * stackSize))));
      if (b.lanes !== needed) { b.lanes = needed; changed++; }
    }
    commit();
    return changed;
  }

  // ======== Construction Tab ========
  function renderConstruction() {
    const c = game.state.construction || {};
    // 合并 ITEM_LABELS 和 construction 中实际存在的 key，确保不遗漏
    const allKeys = [...new Set([...Object.keys(ITEM_LABELS), ...Object.keys(c)])];
    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px',
    });
    // batch row
    const countRow = document.createElement('div');
    Object.assign(countRow.style, {
      gridColumn: '1 / -1', display: 'flex', gap: '6px',
      marginBottom: '6px', padding: '6px 8px', background: '#1a1a2e',
      borderRadius: '6px', alignItems: 'center',
    });
    const countLabel = document.createElement('span');
    countLabel.textContent = '批量设为: ';
    countLabel.style.color = '#888';
    const countInput = document.createElement('input');
    countInput.type = 'number'; countInput.min = 0; countInput.value = 0;
    Object.assign(countInput.style, {
      width: '60px', padding: '2px 6px', borderRadius: '4px',
      border: '1px solid #333', background: '#111', color: '#e0d6b0', fontSize: '12px',
    });
    const batchBtn = document.createElement('button');
    batchBtn.textContent = '应用';
    Object.assign(batchBtn.style, {
      padding: '3px 12px', borderRadius: '4px', border: '1px solid #3a3a55',
      background: '#2a2a50', color: '#e0d6b0', cursor: 'pointer', fontSize: '12px',
    });
    batchBtn.addEventListener('click', () => {
      const v = parseInt(countInput.value, 10);
      if (isNaN(v) || v < 0 || !game) return;
      for (const key of allKeys) {
        game.state.construction[key] = v;
      }
      commit(); renderConstruction();
    });
    countRow.appendChild(countLabel);
    countRow.appendChild(countInput);
    countRow.appendChild(batchBtn);
    grid.appendChild(countRow);

    for (const key of allKeys) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0',
      });
      const lbl = document.createElement('span');
      lbl.textContent = ITEM_LABELS[key] || key;
      Object.assign(lbl.style, {
        flex: '1', fontSize: '12px', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      });
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = 0;
      inp.value = c[key] ?? 0;
      Object.assign(inp.style, {
        width: '70px', padding: '3px 6px', borderRadius: '4px',
        border: '1px solid #333', background: '#1a1a2e', color: '#e0d6b0',
        fontSize: '12px', textAlign: 'right',
      });
      inp.addEventListener('input', () => {
        const v = parseInt(inp.value, 10);
        if (!isNaN(v) && v >= 0 && game) {
          game.state.construction[key] = v;
          commit();
        }
      });
      row.appendChild(lbl);
      row.appendChild(inp);
      grid.appendChild(row);
    }
    content.appendChild(grid);
  }

  // ======== Veins Tab ========
  function renderVeins() {
    content.innerHTML = '';
    if (!game) return;
    const veins = game.state.entities.filter(e => e.kind === 'vein');
    const byPlanet = {};
    for (const v of veins) {
      const p = v.planetId || 'unknown';
      if (!byPlanet[p]) byPlanet[p] = [];
      byPlanet[p].push(v);
    }
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, { display: 'flex', flexDirection: 'column', gap: '10px' });

    // Global batch set row
    const globalBatchRow = document.createElement('div');
    Object.assign(globalBatchRow.style, {
      display: 'flex', gap: '8px', padding: '6px 10px', background: '#15152a',
      borderRadius: '6px', alignItems: 'center',
    });
    const globalBatchLabel = document.createElement('span');
    globalBatchLabel.textContent = '全部星球批量设矿机: ';
    globalBatchLabel.style.cssText = 'font-size:12px;color:#ff8;';
    const globalBatchInput = document.createElement('input');
    globalBatchInput.type = 'number'; globalBatchInput.min = 0; globalBatchInput.value = 0;
    Object.assign(globalBatchInput.style, {
      width: '60px', padding: '2px 6px', borderRadius: '4px',
      border: '1px solid #333', background: '#111', color: '#e0d6b0', fontSize: '12px', textAlign: 'center',
    });
    const globalBatchBtn = document.createElement('button');
    globalBatchBtn.textContent = '应用';
    Object.assign(globalBatchBtn.style, {
      padding: '3px 14px', borderRadius: '4px', border: '1px solid #5a5',
      background: '#2a4a2a', color: '#8f8', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
    });
    globalBatchBtn.addEventListener('click', () => {
      const v = parseInt(globalBatchInput.value, 10);
      if (isNaN(v) || v < 0 || !game) return;
      for (const e of game.state.entities) {
        if (e.kind === 'vein') {
          e.minerCount = v;
          e.machineCount = v;
          if (v > 0) e.extractorBuildingId = getExtractor(e.resourceId);
          const cur = game.state.construction[e.extractorBuildingId || 'mining_machine'] || 0;
          if (v > cur) game.state.construction[e.extractorBuildingId || 'mining_machine'] = v + 10;
        }
      }
      commit(); renderVeins();
    });
    globalBatchRow.appendChild(globalBatchLabel);
    globalBatchRow.appendChild(globalBatchInput);
    globalBatchRow.appendChild(globalBatchBtn);
    wrapper.appendChild(globalBatchRow);

    for (const [planetId, vlist] of Object.entries(byPlanet)) {
      const section = document.createElement('div');
      const header = document.createElement('div');
      header.textContent = PLANET_NAMES[planetId] || planetId;
      Object.assign(header.style, {
        fontSize: '13px', fontWeight: 'bold', color: '#8af', marginBottom: '4px', padding: '4px 0',
      });
      section.appendChild(header);

      // Per-planet batch set row
      const planetBatchRow = document.createElement('div');
      Object.assign(planetBatchRow.style, {
        display: 'flex', gap: '6px', marginBottom: '6px',
        padding: '4px 8px', background: '#1a1a2e', borderRadius: '6px', alignItems: 'center',
      });
      const planetBatchLabel = document.createElement('span');
      planetBatchLabel.textContent = '批量设矿机: ';
      planetBatchLabel.style.cssText = 'font-size:11px;color:#888;';
      const planetBatchInput = document.createElement('input');
      planetBatchInput.type = 'number'; planetBatchInput.min = 0; planetBatchInput.value = 0;
      Object.assign(planetBatchInput.style, {
        width: '50px', padding: '2px 6px', borderRadius: '4px',
        border: '1px solid #333', background: '#111', color: '#e0d6b0', fontSize: '11px', textAlign: 'center',
      });
      const planetBatchBtn = document.createElement('button');
      planetBatchBtn.textContent = '应用';
      Object.assign(planetBatchBtn.style, {
        padding: '2px 10px', borderRadius: '4px', border: '1px solid #3a3a55',
        background: '#2a2a50', color: '#e0d6b0', cursor: 'pointer', fontSize: '11px',
      });
      planetBatchBtn.addEventListener('click', () => {
        const v = parseInt(planetBatchInput.value, 10);
        if (isNaN(v) || v < 0 || !game) return;
        for (const e of game.state.entities) {
          if (e.kind === 'vein' && e.planetId === planetId) {
            e.minerCount = v;
            e.machineCount = v;
            if (v > 0) e.extractorBuildingId = getExtractor(e.resourceId);
            const cur = game.state.construction[e.extractorBuildingId || 'mining_machine'] || 0;
            if (v > cur) game.state.construction[e.extractorBuildingId || 'mining_machine'] = v + 10;
          }
        }
        commit(); renderVeins();
      });
      planetBatchRow.appendChild(planetBatchLabel);
      planetBatchRow.appendChild(planetBatchInput);
      planetBatchRow.appendChild(planetBatchBtn);
      section.appendChild(planetBatchRow);

      const grid = document.createElement('div');
      Object.assign(grid.style, { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px' });

      for (const v of vlist) {
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 0',
        });
        const lbl = document.createElement('span');
        const resName = RESOURCE_NAMES[v.resourceId] || v.resourceId;
        lbl.textContent = `${resName} (${v.id})`;
        Object.assign(lbl.style, {
          flex: '1', fontSize: '11px', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        });
        const inp = document.createElement('input');
        inp.type = 'number'; inp.min = 0;
        inp.value = v.minerCount || 0;
        Object.assign(inp.style, {
          width: '55px', padding: '2px 5px', borderRadius: '4px',
          border: '1px solid #333', background: '#1a1a2e', color: '#e0d6b0',
          fontSize: '11px', textAlign: 'right',
        });
        inp.addEventListener('input', () => {
          const n = parseInt(inp.value, 10);
          if (isNaN(n) || n < 0 || !game) return;
          const entity = game.state.entities.find(e => e.id === v.id);
          if (!entity) return;
          entity.minerCount = n;
          entity.machineCount = n;
          entity.extractorBuildingId = getExtractor(entity.resourceId);
          const cur = game.state.construction[entity.extractorBuildingId] || 0;
          if (n > cur) game.state.construction[entity.extractorBuildingId] = n + 10;
          commit();
        });
        row.appendChild(lbl);
        row.appendChild(inp);
        grid.appendChild(row);
      }
      section.appendChild(grid);
      wrapper.appendChild(section);
    }
    content.appendChild(wrapper);
  }

  // ======== Buildings Tab ========
  function renderBuildings() {
    content.innerHTML = '';
    if (!game) return;
    const buildings = game.state.entities.filter(e =>
      e.kind !== 'vein' && e.buildingId && e.machineCount !== undefined
    );
    if (buildings.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '暂无已部署的生产设备。在画布上放置建筑后，它们会出现在这里。';
      Object.assign(empty.style, { color: '#666', padding: '20px', textAlign: 'center' });
      content.appendChild(empty);
      return;
    }
    const byPlanet = {};
    for (const b of buildings) {
      const p = b.planetId || 'unknown';
      if (!byPlanet[p]) byPlanet[p] = [];
      byPlanet[p].push(b);
    }
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, { display: 'flex', flexDirection: 'column', gap: '10px' });

    // Global batch set row
    const globalBatchRow = document.createElement('div');
    Object.assign(globalBatchRow.style, {
      display: 'flex', gap: '8px', padding: '6px 10px', background: '#15152a',
      borderRadius: '6px', alignItems: 'center',
    });
    const globalBatchLabel = document.createElement('span');
    globalBatchLabel.textContent = '全部星球批量设台数: ';
    globalBatchLabel.style.cssText = 'font-size:12px;color:#ff8;';
    const globalBatchInput = document.createElement('input');
    globalBatchInput.type = 'number'; globalBatchInput.min = 0; globalBatchInput.value = 0;
    Object.assign(globalBatchInput.style, {
      width: '60px', padding: '2px 6px', borderRadius: '4px',
      border: '1px solid #333', background: '#111', color: '#e0d6b0', fontSize: '12px', textAlign: 'center',
    });
    const globalBatchBtn = document.createElement('button');
    globalBatchBtn.textContent = '应用';
    Object.assign(globalBatchBtn.style, {
      padding: '3px 14px', borderRadius: '4px', border: '1px solid #5a5',
      background: '#2a4a2a', color: '#8f8', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
    });
    globalBatchBtn.addEventListener('click', () => {
      const v = parseInt(globalBatchInput.value, 10);
      if (isNaN(v) || v < 0 || !game) return;
      for (const e of game.state.entities) {
        if (e.kind !== 'vein' && e.buildingId && e.machineCount !== undefined) {
          e.machineCount = v;
          const cur = game.state.construction[e.buildingId] || 0;
          if (v > cur) game.state.construction[e.buildingId] = v + 10;
        }
      }
      commit(); renderBuildings();
    });
    globalBatchRow.appendChild(globalBatchLabel);
    globalBatchRow.appendChild(globalBatchInput);
    globalBatchRow.appendChild(globalBatchBtn);
    wrapper.appendChild(globalBatchRow);

    for (const [planetId, blist] of Object.entries(byPlanet)) {
      const section = document.createElement('div');
      const header = document.createElement('div');
      header.textContent = PLANET_NAMES[planetId] || planetId;
      Object.assign(header.style, {
        fontSize: '13px', fontWeight: 'bold', color: '#8af', marginBottom: '4px', padding: '4px 0',
      });
      section.appendChild(header);

      // Per-planet batch set row
      const planetBatchRow = document.createElement('div');
      Object.assign(planetBatchRow.style, {
        display: 'flex', gap: '6px', marginBottom: '6px',
        padding: '4px 8px', background: '#1a1a2e', borderRadius: '6px', alignItems: 'center',
      });
      const planetBatchLabel = document.createElement('span');
      planetBatchLabel.textContent = '批量设台数: ';
      planetBatchLabel.style.cssText = 'font-size:11px;color:#888;';
      const planetBatchInput = document.createElement('input');
      planetBatchInput.type = 'number'; planetBatchInput.min = 0; planetBatchInput.value = 0;
      Object.assign(planetBatchInput.style, {
        width: '50px', padding: '2px 6px', borderRadius: '4px',
        border: '1px solid #333', background: '#111', color: '#e0d6b0', fontSize: '11px', textAlign: 'center',
      });
      const planetBatchBtn = document.createElement('button');
      planetBatchBtn.textContent = '应用';
      Object.assign(planetBatchBtn.style, {
        padding: '2px 10px', borderRadius: '4px', border: '1px solid #3a3a55',
        background: '#2a2a50', color: '#e0d6b0', cursor: 'pointer', fontSize: '11px',
      });
      planetBatchBtn.addEventListener('click', () => {
        const v = parseInt(planetBatchInput.value, 10);
        if (isNaN(v) || v < 0 || !game) return;
        for (const e of game.state.entities) {
          if (e.planetId === planetId && e.kind !== 'vein' && e.buildingId && e.machineCount !== undefined) {
            e.machineCount = v;
            const cur = game.state.construction[e.buildingId] || 0;
            if (v > cur) game.state.construction[e.buildingId] = v + 10;
          }
        }
        commit(); renderBuildings();
      });
      planetBatchRow.appendChild(planetBatchLabel);
      planetBatchRow.appendChild(planetBatchInput);
      planetBatchRow.appendChild(planetBatchBtn);
      section.appendChild(planetBatchRow);
      const grid = document.createElement('div');
      Object.assign(grid.style, { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px' });

      for (const b of blist) {
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 0',
        });
        const lbl = document.createElement('span');
        const name = ITEM_LABELS[b.buildingId] || b.buildingId;
        const recipe = b.recipeId ? ` [${b.recipeId}]` : '';
        lbl.textContent = `${name}${recipe}`;
        Object.assign(lbl.style, {
          flex: '1', fontSize: '11px', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        });
        const inp = document.createElement('input');
        inp.type = 'number'; inp.min = 0;
        inp.value = b.machineCount || 0;
        Object.assign(inp.style, {
          width: '55px', padding: '2px 5px', borderRadius: '4px',
          border: '1px solid #333', background: '#1a1a2e', color: '#e0d6b0',
          fontSize: '11px', textAlign: 'right',
        });
        inp.addEventListener('input', () => {
          const n = parseInt(inp.value, 10);
          if (isNaN(n) || n < 0 || !game) return;
          const entity = game.state.entities.find(e => e.id === b.id);
          if (!entity) return;
          entity.machineCount = n;
          const cur = game.state.construction[entity.buildingId] || 0;
          if (n > cur) game.state.construction[entity.buildingId] = n + 10;
          commit();
        });
        row.appendChild(lbl);
        row.appendChild(inp);
        grid.appendChild(row);
      }
      section.appendChild(grid);
      wrapper.appendChild(section);
    }
    content.appendChild(wrapper);
  }

  // ======== Belts Tab ========
  function renderBelts() {
    content.innerHTML = '';
    if (!game) return;
    const belts = game.state.belts || [];
    if (belts.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '暂无运输线路。在画布上连接设备后，传输带会出现在这里。';
      Object.assign(empty.style, { color: '#666', padding: '20px', textAlign: 'center' });
      content.appendChild(empty);
      return;
    }

    const byPlanet = {};
    for (const b of belts) {
      const p = b.planetId || 'unknown';
      if (!byPlanet[p]) byPlanet[p] = [];
      byPlanet[p].push(b);
    }

    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, { display: 'flex', flexDirection: 'column', gap: '10px' });

    // Auto-calculate button (top of belts tab)
    const autoRow = document.createElement('div');
    Object.assign(autoRow.style, {
      display: 'flex', gap: '8px', padding: '6px 10px', background: '#15152a',
      borderRadius: '6px', alignItems: 'center',
    });
    const autoLbl = document.createElement('span');
    autoLbl.textContent = '按设备需求自动计算并行数: ';
    autoLbl.style.cssText = 'font-size:12px;color:#ff8;';
    const autoBtn = document.createElement('button');
    autoBtn.textContent = '一键计算';
    Object.assign(autoBtn.style, {
      padding: '4px 14px', borderRadius: '4px', border: '1px solid #5a5',
      background: '#2a4a2a', color: '#8f8', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
    });
    const autoStatus = document.createElement('span');
    autoStatus.style.cssText = 'font-size:11px;color:#888;';
    autoBtn.addEventListener('click', async () => {
      autoBtn.disabled = true;
      autoBtn.textContent = '计算中...';
      const n = await autoCalcBeltLanes();
      autoBtn.textContent = '一键计算';
      autoBtn.disabled = false;
      autoStatus.textContent = `已更新 ${n} 条线路`;
      renderBelts();
    });
    autoRow.appendChild(autoLbl);
    autoRow.appendChild(autoBtn);
    autoRow.appendChild(autoStatus);
    wrapper.appendChild(autoRow);

    // Global batch set row (all planets)
    const globalBatchRow = document.createElement('div');
    Object.assign(globalBatchRow.style, {
      display: 'flex', gap: '8px', padding: '6px 10px', background: '#15152a',
      borderRadius: '6px', alignItems: 'center',
    });
    const globalBatchLabel = document.createElement('span');
    globalBatchLabel.textContent = '全部星球批量设并行数: ';
    globalBatchLabel.style.cssText = 'font-size:12px;color:#ff8;';
    const globalBatchInput = document.createElement('input');
    globalBatchInput.type = 'number'; globalBatchInput.min = 1; globalBatchInput.max = 4096; globalBatchInput.value = 1;
    Object.assign(globalBatchInput.style, {
      width: '60px', padding: '2px 6px', borderRadius: '4px',
      border: '1px solid #333', background: '#111', color: '#e0d6b0', fontSize: '12px', textAlign: 'center',
    });
    const globalBatchBtn = document.createElement('button');
    globalBatchBtn.textContent = '应用';
    Object.assign(globalBatchBtn.style, {
      padding: '3px 14px', borderRadius: '4px', border: '1px solid #5a5',
      background: '#2a4a2a', color: '#8f8', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
    });
    globalBatchBtn.addEventListener('click', () => {
      const v = parseInt(globalBatchInput.value, 10);
      if (isNaN(v) || v < 1 || !game) return;
      for (const b of (game.state.belts || [])) b.lanes = Math.min(4096, Math.floor(v));
      commit(); renderBelts();
    });
    globalBatchRow.appendChild(globalBatchLabel);
    globalBatchRow.appendChild(globalBatchInput);
    globalBatchRow.appendChild(globalBatchBtn);
    const globalMaxBtn = document.createElement('button');
    globalMaxBtn.textContent = '最大';
    globalMaxBtn.title = '全部设为 4096';
    Object.assign(globalMaxBtn.style, {
      padding: '3px 10px', borderRadius: '4px', border: '1px solid #fa8',
      background: '#3a2a1a', color: '#fa8', cursor: 'pointer', fontSize: '12px',
    });
    globalMaxBtn.addEventListener('click', () => {
      globalBatchInput.value = 4096;
    });
    globalBatchRow.appendChild(globalMaxBtn);
    wrapper.appendChild(globalBatchRow);

    for (const [planetId, blist] of Object.entries(byPlanet)) {
      const section = document.createElement('div');
      const header = document.createElement('div');
      const totalLanes = blist.reduce((s, b) => s + (b.lanes || 1), 0);
      header.textContent = `${PLANET_NAMES[planetId] || planetId} (${blist.length} 条, 共 ${totalLanes} 股)`;
      Object.assign(header.style, {
        fontSize: '13px', fontWeight: 'bold', color: '#8af',
        marginBottom: '4px', padding: '4px 0',
      });
      section.appendChild(header);

      // batch lanes set
      const batchRow = document.createElement('div');
      Object.assign(batchRow.style, {
        display: 'flex', gap: '6px', marginBottom: '6px',
        padding: '4px 8px', background: '#1a1a2e', borderRadius: '6px', alignItems: 'center',
      });
      const batchLabel = document.createElement('span');
      batchLabel.textContent = '批量设并行数: ';
      batchLabel.style.color = '#888';
      batchLabel.style.fontSize = '12px';
      const batchInput = document.createElement('input');
      batchInput.type = 'number'; batchInput.min = 1; batchInput.max = 4096; batchInput.value = 1;
      Object.assign(batchInput.style, {
        width: '50px', padding: '2px 6px', borderRadius: '4px',
        border: '1px solid #333', background: '#111', color: '#e0d6b0', fontSize: '12px',
      });
      const batchApply = document.createElement('button');
      batchApply.textContent = '应用';
      Object.assign(batchApply.style, {
        padding: '2px 10px', borderRadius: '4px', border: '1px solid #3a3a55',
        background: '#2a2a50', color: '#e0d6b0', cursor: 'pointer', fontSize: '12px',
      });
      batchApply.addEventListener('click', () => {
        const v = parseInt(batchInput.value, 10);
        if (isNaN(v) || v < 1 || !game) return;
        for (const b of blist) b.lanes = Math.min(4096, Math.floor(v));
        commit(); renderBelts();
      });
      batchRow.appendChild(batchLabel);
      batchRow.appendChild(batchInput);
      batchRow.appendChild(batchApply);
      section.appendChild(batchRow);

      const grid = document.createElement('div');
      Object.assign(grid.style, { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px' });

      for (const b of blist) {
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 0',
        });
        const srcName = entityLabel(b.source);
        const tgtName = entityLabel(b.target);
        const itemName = TRAY_ITEMS[b.itemId] || b.itemId || '??';
        const lbl = document.createElement('span');
        lbl.textContent = `${itemName}: ${srcName} → ${tgtName}`;
        Object.assign(lbl.style, {
          flex: '1', fontSize: '11px', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        });

        const laneInput = document.createElement('input');
        laneInput.type = 'number'; laneInput.min = 1; laneInput.max = 4096;
        laneInput.value = b.lanes || 1;
        Object.assign(laneInput.style, {
          width: '45px', padding: '2px 4px', borderRadius: '4px',
          border: '1px solid #333', background: '#1a1a2e', color: '#e0d6b0',
          fontSize: '11px', textAlign: 'right',
        });
        laneInput.addEventListener('input', () => {
          const v = parseInt(laneInput.value, 10);
          if (isNaN(v) || v < 1 || !game) return;
          const belt = game.state.belts?.find(x => x.source === b.source && x.target === b.target && x.itemId === b.itemId);
          if (belt) belt.lanes = Math.min(4096, Math.floor(v));
          commit();
        });

        const laneLbl = document.createElement('span');
        laneLbl.textContent = '股';
        laneLbl.style.color = '#888';
        laneLbl.style.fontSize = '10px';

        const tierInput = document.createElement('select');
        const tiers = [1, 2, 3];
        for (const t of tiers) {
          const opt = document.createElement('option');
          opt.value = t; opt.textContent = `T${t}`;
          if ((b.tier || 1) === t) opt.selected = true;
          tierInput.appendChild(opt);
        }
        Object.assign(tierInput.style, {
          width: '44px', padding: '2px', borderRadius: '4px',
          border: '1px solid #333', background: '#1a1a2e', color: '#e0d6b0',
          fontSize: '10px', cursor: 'pointer',
        });
        tierInput.addEventListener('change', () => {
          const belt = game.state.belts?.find(x => x.source === b.source && x.target === b.target && x.itemId === b.itemId);
          if (belt) belt.tier = parseInt(tierInput.value, 10);
          commit();
        });

        row.appendChild(lbl);
        row.appendChild(laneInput);
        row.appendChild(laneLbl);
        row.appendChild(tierInput);
        grid.appendChild(row);
      }
      section.appendChild(grid);
      wrapper.appendChild(section);
    }
    content.appendChild(wrapper);
  }

  // ======== Dyson Tab ========
  function renderDyson() {
    if (!game) return;
    const s = game.state;
    const sw = s.dysonSwarm || {};
    const sp = s.dysonSphere || {};
    const eng = s.dysonEngineering || {};
    const plans = s.dysonPlans || {};
    const sysNames = { helios: '赫利俄斯', borealis: '北冕座', aurora: '极光', ember: '烬星',
      sirius: '天狼', white_dwarf: '白矮星', neutron: '赫卡忒', blue_giant: '蓝巨星' };

    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, { display: 'flex', flexDirection: 'column', gap: '10px' });

    // --- Summary ---
    const summary = document.createElement('div');
    Object.assign(summary.style, {
      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 12px',
      padding: '8px 10px', background: '#15152a', borderRadius: '8px',
    });
    const sumFields = [
      ['结构点数', sp.structurePoints ?? 0, v => { s.dysonSphere.structurePoints = Math.max(0, Math.floor(v)); commit(); }],
      ['运载火箭', sp.totalRocketsLaunched ?? 0, v => { s.dysonSphere.totalRocketsLaunched = Math.max(0, Math.floor(v)); commit(); }],
      ['壳面太阳帆', sp.shellSails ?? 0, v => { s.dysonSphere.shellSails = Math.max(0, Math.floor(v)); commit(); }],
      ['在轨太阳帆', sw.sailsInOrbit ?? 0, v => { s.dysonSwarm.sailsInOrbit = Math.max(0, Math.floor(v)); commit(); }],
      ['累计发射太阳帆', sw.totalLaunched ?? 0, v => { s.dysonSwarm.totalLaunched = Math.max(0, Math.floor(v)); commit(); }],
      ['射线接收 (MW)', (sw.receiverLoadKw ?? 0) / 1000, v => { s.dysonSwarm.receiverLoadKw = Math.max(0, v * 1000); commit(); }],
    ];
    for (const [label, val, onChange] of sumFields) {
      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '4px' });
      const lbl = document.createElement('span');
      lbl.textContent = label;
      Object.assign(lbl.style, { fontSize: '11px', color: '#aaa', flex: '1' });
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = 0; inp.value = val;
      Object.assign(inp.style, {
        width: '80px', padding: '2px 5px', borderRadius: '4px',
        border: '1px solid #333', background: '#1a1a2e', color: '#e0d6b0',
        fontSize: '11px', textAlign: 'right',
      });
      inp.addEventListener('input', () => {
        const v = parseFloat(inp.value);
        if (!isNaN(v) && v >= 0) onChange(v);
      });
      row.appendChild(lbl);
      row.appendChild(inp);
      summary.appendChild(row);
    }
    wrapper.appendChild(summary);

    // --- Engineering ---
    const engBox = document.createElement('div');
    Object.assign(engBox.style, {
      padding: '8px 10px', background: '#15152a', borderRadius: '8px',
    });
    const engTitle = document.createElement('div');
    engTitle.textContent = '🚀 发射工程';
    Object.assign(engTitle.style, { fontSize: '13px', fontWeight: 'bold', color: '#fa8', marginBottom: '6px' });
    engBox.appendChild(engTitle);

    const engGrid = document.createElement('div');
    Object.assign(engGrid.style, { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 12px' });

    const engFields = [
      ['发射节流阀', eng.launchThrottle ?? 1, ['0.25', '0.5', '0.75', '1'].includes(String(eng.launchThrottle)) ? ['0.25', '0.5', '0.75', '1'] : null,
        v => { s.dysonEngineering.launchThrottle = v; commit(); }],
      ['已消耗能量 (MJ)', eng.launchEnergySpentMj ?? 0, null,
        v => { s.dysonEngineering.launchEnergySpentMj = Math.max(0, Math.floor(v)); commit(); }],
    ];
    for (const [label, val, opts, onChange] of engFields) {
      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '4px' });
      const lbl = document.createElement('span');
      lbl.textContent = label;
      Object.assign(lbl.style, { fontSize: '11px', color: '#aaa', flex: '1' });
      if (opts) {
        const sel = document.createElement('select');
        for (const o of opts) {
          const opt = document.createElement('option');
          opt.value = o; opt.textContent = o + '×';
          if (String(val) === o) opt.selected = true;
          sel.appendChild(opt);
        }
        Object.assign(sel.style, {
          padding: '2px 4px', borderRadius: '4px', border: '1px solid #333',
          background: '#1a1a2e', color: '#e0d6b0', fontSize: '11px', cursor: 'pointer',
        });
        sel.addEventListener('change', () => onChange(parseFloat(sel.value)));
        row.appendChild(lbl);
        row.appendChild(sel);
      } else {
        const inp = document.createElement('input');
        inp.type = 'number'; inp.min = 0; inp.value = val;
        Object.assign(inp.style, {
          width: '80px', padding: '2px 5px', borderRadius: '4px',
          border: '1px solid #333', background: '#1a1a2e', color: '#e0d6b0',
          fontSize: '11px', textAlign: 'right',
        });
        inp.addEventListener('input', () => {
          const v = parseFloat(inp.value);
          if (!isNaN(v) && v >= 0) onChange(v);
        });
        row.appendChild(lbl);
        row.appendChild(inp);
      }
      engGrid.appendChild(row);
    }

    // Launch mode
    const modeRow = document.createElement('div');
    Object.assign(modeRow.style, { display: 'flex', alignItems: 'center', gap: '4px' });
    const modeLbl = document.createElement('span');
    modeLbl.textContent = '发射模式';
    Object.assign(modeLbl.style, { fontSize: '11px', color: '#aaa', flex: '1' });
    const modeSel = document.createElement('select');
    for (const m of ['balanced', 'swarm', 'sphere']) {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = { balanced: '均衡', swarm: '优先戴森云', sphere: '优先戴森球' }[m] || m;
      if ((eng.launchMode || 'balanced') === m) opt.selected = true;
      modeSel.appendChild(opt);
    }
    Object.assign(modeSel.style, {
      padding: '2px 4px', borderRadius: '4px', border: '1px solid #333',
      background: '#1a1a2e', color: '#e0d6b0', fontSize: '11px', cursor: 'pointer',
    });
    modeSel.addEventListener('change', () => { s.dysonEngineering.launchMode = modeSel.value; commit(); });
    modeRow.appendChild(modeLbl);
    modeRow.appendChild(modeSel);
    engGrid.appendChild(modeRow);

    engBox.appendChild(engGrid);
    wrapper.appendChild(engBox);

    // --- Per-system orbits + plans ---
    for (const [sysId, sysLabel] of Object.entries(sysNames)) {
      if (!eng.orbitsBySystem?.[sysId] && !plans[sysId]) continue;
      const sec = document.createElement('div');
      Object.assign(sec.style, { padding: '8px 10px', background: '#15152a', borderRadius: '8px' });

      const secTitle = document.createElement('div');
      secTitle.textContent = `⭐ ${sysLabel} (${sysId})`;
      Object.assign(secTitle.style, { fontSize: '13px', fontWeight: 'bold', color: '#8af', marginBottom: '6px' });
      sec.appendChild(secTitle);

      // Orbits
      const orbits = eng.orbitsBySystem?.[sysId] || [];
      if (orbits.length > 0) {
        const orbTitle = document.createElement('div');
        orbTitle.textContent = `太阳帆轨道 (${orbits.length})`;
        Object.assign(orbTitle.style, { fontSize: '12px', color: '#8c8', marginBottom: '3px' });
        sec.appendChild(orbTitle);

        for (let oi = 0; oi < orbits.length; oi++) {
          const orb = orbits[oi];
          const orbRow = document.createElement('div');
          Object.assign(orbRow.style, {
            display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 4px',
            background: oi % 2 === 0 ? '#111' : 'transparent', borderRadius: '4px',
          });

          const name = document.createElement('span');
          name.textContent = orb.name;
          Object.assign(name.style, { fontSize: '11px', color: '#aaa', width: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });

          const makeOrbInput = (field, label, w = '52px') => {
            const lbl = document.createElement('span');
            lbl.textContent = label;
            lbl.style.cssText = 'font-size:10px;color:#666;margin-left:4px;';
            const inp = document.createElement('input');
            inp.type = 'number'; inp.min = 0; inp.value = orb[field] ?? 0;
            Object.assign(inp.style, {
              width: w, padding: '1px 3px', borderRadius: '3px',
              border: '1px solid #333', background: '#1a1a2e', color: '#e0d6b0',
              fontSize: '10px', textAlign: 'right',
            });
            inp.addEventListener('input', () => {
              const v = parseInt(inp.value, 10);
              if (!isNaN(v) && v >= 0) { orb[field] = v; commit(); }
            });
            orbRow.appendChild(lbl);
            orbRow.appendChild(inp);
          };

          orbRow.appendChild(name);
          makeOrbInput('sailsInOrbit', '在轨');
          makeOrbInput('totalLaunched', '发射');
          makeOrbInput('totalExpired', '衰减');
          makeOrbInput('radius', '半径', '60px');

          const incLbl = document.createElement('span');
          incLbl.textContent = '倾角';
          incLbl.style.cssText = 'font-size:10px;color:#666;margin-left:4px;';
          const incInp = document.createElement('input');
          incInp.type = 'number'; incInp.value = orb.inclination ?? 0;
          Object.assign(incInp.style, {
            width: '45px', padding: '1px 3px', borderRadius: '3px',
            border: '1px solid #333', background: '#1a1a2e', color: '#e0d6b0',
            fontSize: '10px', textAlign: 'right',
          });
          incInp.addEventListener('input', () => {
            const v = parseFloat(incInp.value);
            if (!isNaN(v)) { orb.inclination = v; commit(); }
          });
          orbRow.appendChild(incLbl);
          orbRow.appendChild(incInp);

          sec.appendChild(orbRow);
        }
      }

      // Plan layers
      const plan = plans[sysId];
      if (plan && plan.layers && plan.layers.length > 0) {
        const lyTitle = document.createElement('div');
        lyTitle.textContent = `戴森壳层 (${plan.layers.length})`;
        Object.assign(lyTitle.style, { fontSize: '12px', color: '#fa8', marginTop: '6px', marginBottom: '3px' });
        sec.appendChild(lyTitle);

        for (const layer of plan.layers) {
          const lyBox = document.createElement('div');
          Object.assign(lyBox.style, {
            margin: '3px 0', padding: '4px 6px', background: '#111', borderRadius: '4px',
          });

          const lyHeader = document.createElement('div');
          Object.assign(lyHeader.style, { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' });
          const lyName = document.createElement('span');
          lyName.textContent = layer.name || layer.id;
          Object.assign(lyName.style, { fontSize: '11px', fontWeight: 'bold', color: '#fc0', flex: '1' });
          lyHeader.appendChild(lyName);

          const makeField = (label, val, onChange, w = '60px') => {
            const span = document.createElement('span');
            span.textContent = label;
            span.style.cssText = 'font-size:10px;color:#666;';
            const inp = document.createElement('input');
            inp.type = 'number'; inp.min = 0; inp.value = val;
            Object.assign(inp.style, {
              width: w, padding: '1px 3px', borderRadius: '3px',
              border: '1px solid #333', background: '#1a1a2e', color: '#e0d6b0',
              fontSize: '10px', textAlign: 'right',
            });
            inp.addEventListener('input', () => {
              const v = parseFloat(inp.value);
              if (!isNaN(v) && v >= 0) { onChange(v); commit(); }
            });
            lyHeader.appendChild(span);
            lyHeader.appendChild(inp);
          };

          makeField('半径', layer.radius, v => { layer.radius = v; });
          makeField('倾角', layer.inclination, v => { layer.inclination = v; });
          makeField('经度', layer.longitude, v => { layer.longitude = v; });

          sec.appendChild(lyHeader);

          // Nodes
          if (layer.nodes && layer.nodes.length > 0) {
            const nTitle = document.createElement('div');
            nTitle.textContent = `节点 (${layer.nodes.length})`;
            Object.assign(nTitle.style, { fontSize: '10px', color: '#8cf', marginTop: '2px' });
            lyBox.appendChild(nTitle);

            const batchN = document.createElement('div');
            Object.assign(batchN.style, { display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '2px' });
            const batchNLbl = document.createElement('span');
            batchNLbl.textContent = '批量完成节点: ';
            batchNLbl.style.cssText = 'font-size:10px;color:#666;';
            const batchNInp = document.createElement('input');
            batchNInp.type = 'number'; batchNInp.min = 0; batchNInp.value = 100;
            Object.assign(batchNInp.style, {
              width: '50px', padding: '1px 4px', borderRadius: '3px',
              border: '1px solid #333', background: '#111', color: '#e0d6b0', fontSize: '10px',
            });
            const batchNBtn = document.createElement('button');
            batchNBtn.textContent = '设值';
            Object.assign(batchNBtn.style, {
              padding: '1px 8px', borderRadius: '3px', border: '1px solid #3a3a55',
              background: '#2a2a50', color: '#e0d6b0', cursor: 'pointer', fontSize: '10px',
            });
            batchNBtn.addEventListener('click', () => {
              const v = parseInt(batchNInp.value, 10);
              if (isNaN(v) || v < 0) return;
              for (const n of layer.nodes) {
                n.completedStructurePoints = Math.min(n.requiredStructurePoints, v);
              }
              commit();
            });
            batchN.appendChild(batchNLbl);
            batchN.appendChild(batchNInp);
            batchN.appendChild(batchNBtn);
            lyBox.appendChild(batchN);

            for (const node of layer.nodes) {
              const nrow = document.createElement('div');
              Object.assign(nrow.style, { display: 'flex', alignItems: 'center', gap: '4px', padding: '1px 4px', fontSize: '10px' });
              const nid = document.createElement('span');
              const nshort = node.id.split('_').slice(-2).join('_');
              nid.textContent = nshort;
              Object.assign(nid.style, { width: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#888' });
              nrow.appendChild(nid);
              const nProg = document.createElement('span');
              nProg.textContent = `${node.completedStructurePoints ?? 0} / ${node.requiredStructurePoints ?? 0}`;
              nProg.style.cssText = 'color:#888;width:70px;font-size:9px;';
              nrow.appendChild(nProg);
              const nInp = document.createElement('input');
              nInp.type = 'number'; nInp.min = 0; nInp.value = node.completedStructurePoints ?? 0;
              Object.assign(nInp.style, {
                width: '55px', padding: '1px 3px', borderRadius: '3px',
                border: '1px solid #333', background: '#1a1a2e', color: '#e0d6b0', fontSize: '10px', textAlign: 'right',
              });
              nInp.addEventListener('input', () => {
                const v = parseInt(nInp.value, 10);
                if (!isNaN(v) && v >= 0) { node.completedStructurePoints = Math.min(node.requiredStructurePoints, v); commit(); }
              });
              nrow.appendChild(nInp);
              lyBox.appendChild(nrow);
            }
          }

          // Frames
          if (layer.frames && layer.frames.length > 0) {
            const fTitle = document.createElement('div');
            fTitle.textContent = `框架 (${layer.frames.length})`;
            Object.assign(fTitle.style, { fontSize: '10px', color: '#fa8', marginTop: '4px' });
            lyBox.appendChild(fTitle);
            for (const frame of layer.frames) {
              const frow = document.createElement('div');
              Object.assign(frow.style, { display: 'flex', alignItems: 'center', gap: '4px', padding: '1px 4px', fontSize: '10px' });
              const fid = document.createElement('span');
              const fshort = frame.id.split('_').slice(-2).join('_');
              fid.textContent = fshort;
              Object.assign(fid.style, { width: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#888' });
              frow.appendChild(fid);
              const fProg = document.createElement('span');
              fProg.textContent = `${frame.completedStructurePoints ?? 0} / ${frame.requiredStructurePoints ?? 0}`;
              fProg.style.cssText = 'color:#888;width:70px;font-size:9px;';
              frow.appendChild(fProg);
              const fInp = document.createElement('input');
              fInp.type = 'number'; fInp.min = 0; fInp.value = frame.completedStructurePoints ?? 0;
              Object.assign(fInp.style, {
                width: '55px', padding: '1px 3px', borderRadius: '3px',
                border: '1px solid #333', background: '#1a1a2e', color: '#e0d6b0', fontSize: '10px', textAlign: 'right',
              });
              fInp.addEventListener('input', () => {
                const v = parseInt(fInp.value, 10);
                if (!isNaN(v) && v >= 0) { frame.completedStructurePoints = Math.min(frame.requiredStructurePoints, v); commit(); }
              });
              frow.appendChild(fInp);
              lyBox.appendChild(frow);
            }
          }

          // Shells
          if (layer.shells && layer.shells.length > 0) {
            const sTitle = document.createElement('div');
            sTitle.textContent = `壳面 (${layer.shells.length})`;
            Object.assign(sTitle.style, { fontSize: '10px', color: '#8f8', marginTop: '4px' });
            lyBox.appendChild(sTitle);
            for (const shell of layer.shells) {
              const srow = document.createElement('div');
              Object.assign(srow.style, { display: 'flex', alignItems: 'center', gap: '4px', padding: '1px 4px', fontSize: '10px' });
              const sid = document.createElement('span');
              const sshort = shell.id.split('_').slice(-2).join('_');
              sid.textContent = sshort;
              Object.assign(sid.style, { width: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#888' });
              srow.appendChild(sid);
              const sProg = document.createElement('span');
              sProg.textContent = `${shell.absorbedSails ?? 0} / ${shell.sailCapacity ?? 0}`;
              sProg.style.cssText = 'color:#888;width:70px;font-size:9px;';
              srow.appendChild(sProg);
              const sInp = document.createElement('input');
              sInp.type = 'number'; sInp.min = 0; sInp.value = shell.absorbedSails ?? 0;
              Object.assign(sInp.style, {
                width: '55px', padding: '1px 3px', borderRadius: '3px',
                border: '1px solid #333', background: '#1a1a2e', color: '#e0d6b0', fontSize: '10px', textAlign: 'right',
              });
              sInp.addEventListener('input', () => {
                const v = parseInt(sInp.value, 10);
                if (!isNaN(v) && v >= 0) { shell.absorbedSails = Math.min(shell.sailCapacity, v); commit(); }
              });
              srow.appendChild(sInp);
              lyBox.appendChild(srow);
            }
          }

          sec.appendChild(lyBox);
        }
      }
      wrapper.appendChild(sec);
    }
    content.appendChild(wrapper);
  }

  // ======== Planet Tray Tab ========
  function renderPlanetTray() {
    if (!game) return;

    const planetTrays = game.state.planetTrays || {};
    const planetIds = Object.keys(planetTrays).sort();
    if (planetIds.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '未找到行星物资数据。';
      Object.assign(empty.style, { color: '#666', padding: '20px', textAlign: 'center' });
      content.appendChild(empty);
      return;
    }

    // Planet selector
    const selectorRow = document.createElement('div');
    Object.assign(selectorRow.style, {
      display: 'flex', gap: '6px', marginBottom: '10px',
      padding: '6px 8px', background: '#1a1a2e', borderRadius: '6px',
      alignItems: 'center', flexWrap: 'wrap',
    });
    const selLabel = document.createElement('span');
    selLabel.textContent = '选择星球: ';
    selLabel.style.color = '#888';
    selectorRow.appendChild(selLabel);

    let selectedPlanet = planetIds[0];
    const planetBtns = {};
    for (const pid of planetIds) {
      const pb = document.createElement('button');
      const pname = PLANET_NAMES[pid] || pid;
      const tray = planetTrays[pid] || {};
      const itemCount = Object.values(tray).filter(v => v > 0).length;
      pb.textContent = `${pname} (${itemCount})`;
      Object.assign(pb.style, {
        padding: '3px 10px', borderRadius: '4px', border: '1px solid #2a2a40',
        background: pid === selectedPlanet ? '#2a2a50' : 'transparent',
        color: pid === selectedPlanet ? '#e0d6b0' : '#666', cursor: 'pointer',
        fontSize: '11px',
      });
      pb.addEventListener('click', () => {
        selectedPlanet = pid;
        for (const [id, b] of Object.entries(planetBtns)) {
          b.style.background = id === pid ? '#2a2a50' : 'transparent';
          b.style.color = id === pid ? '#e0d6b0' : '#666';
        }
        renderTrayItems(pid);
      });
      planetBtns[pid] = pb;
      selectorRow.appendChild(pb);
    }
    content.appendChild(selectorRow);

    // Tray items container
    const trayContainer = document.createElement('div');
    trayContainer.id = 'dsp-tray-items';
    content.appendChild(trayContainer);

    renderTrayItems(selectedPlanet);

    function renderTrayItems(planetId) {
      trayContainer.innerHTML = '';
      const tray = planetTrays[planetId] || {};

      // Batch set row
      const batchRow = document.createElement('div');
      Object.assign(batchRow.style, {
        display: 'flex', gap: '6px', marginBottom: '8px',
        padding: '6px 8px', background: '#1a1a2e', borderRadius: '6px',
        alignItems: 'center',
      });
      const batchLabel = document.createElement('span');
      batchLabel.textContent = '批量设为: ';
      batchLabel.style.color = '#888';
      const batchInput = document.createElement('input');
      batchInput.type = 'number'; batchInput.min = 0; batchInput.value = 0;
      Object.assign(batchInput.style, {
        width: '60px', padding: '2px 6px', borderRadius: '4px',
        border: '1px solid #333', background: '#111', color: '#e0d6b0', fontSize: '12px',
      });
      const batchApply = document.createElement('button');
      batchApply.textContent = '应用';
      Object.assign(batchApply.style, {
        padding: '3px 12px', borderRadius: '4px', border: '1px solid #3a3a55',
        background: '#2a2a50', color: '#e0d6b0', cursor: 'pointer', fontSize: '12px',
      });
      batchApply.addEventListener('click', () => {
        const v = parseInt(batchInput.value, 10);
        if (isNaN(v) || v < 0 || !game) return;
        const target = game.state.planetTrays[planetId];
        if (!target) return;
        for (const id of Object.keys(TRAY_ITEMS)) {
          target[id] = v;
        }
        commit();
        renderTrayItems(planetId);
        // update planet button count
        const pb = planetBtns[planetId];
        if (pb) {
          const itemCount = Object.values(target).filter(x => x > 0).length;
          const pname = PLANET_NAMES[planetId] || planetId;
          pb.textContent = `${pname} (${itemCount})`;
        }
      });
      batchRow.appendChild(batchLabel);
      batchRow.appendChild(batchInput);
      batchRow.appendChild(batchApply);
      // Clear tray button
      const clearBtn = document.createElement('button');
      clearBtn.textContent = '清空';
      Object.assign(clearBtn.style, {
        padding: '3px 12px', borderRadius: '4px',
        border: '1px solid #5a2a2a', background: 'transparent',
        color: '#b66', cursor: 'pointer', fontSize: '12px', marginLeft: 'auto',
      });
      clearBtn.addEventListener('click', () => {
        if (!game) return;
        const target = game.state.planetTrays[planetId];
        if (!target) return;
        for (const id of Object.keys(target)) {
          delete target[id];
        }
        commit();
        renderTrayItems(planetId);
        const pb = planetBtns[planetId];
        if (pb) {
          const pname = PLANET_NAMES[planetId] || planetId;
          pb.textContent = `${pname} (0)`;
        }
      });
      batchRow.appendChild(clearBtn);
      trayContainer.appendChild(batchRow);

      // Items by category
      for (const cat of TRAY_ITEM_CATEGORIES) {
        const catSection = document.createElement('div');
        const catHeader = document.createElement('div');
        catHeader.textContent = cat.name;
        Object.assign(catHeader.style, {
          fontSize: '12px', fontWeight: 'bold', color: '#8c8',
          marginTop: '6px', marginBottom: '2px', padding: '2px 0',
        });
        catSection.appendChild(catHeader);

        const grid = document.createElement('div');
        Object.assign(grid.style, {
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px',
        });

        for (const [itemId, itemName] of cat.items) {
          const row = document.createElement('div');
          Object.assign(row.style, {
            display: 'flex', alignItems: 'center', gap: '5px', padding: '1px 0',
          });
          const lbl = document.createElement('span');
          lbl.textContent = itemName;
          Object.assign(lbl.style, {
            flex: '1', fontSize: '11px', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          });
          const inp = document.createElement('input');
          inp.type = 'number'; inp.min = 0;
          inp.value = tray[itemId] ?? 0;
          Object.assign(inp.style, {
            width: '65px', padding: '2px 5px', borderRadius: '4px',
            border: '1px solid #333', background: '#1a1a2e', color: '#e0d6b0',
            fontSize: '11px', textAlign: 'right',
          });
          inp.addEventListener('input', () => {
            const v = parseInt(inp.value, 10);
            if (isNaN(v) || v < 0 || !game) return;
            const target = game.state.planetTrays[planetId];
            if (!target) return;
            if (v === 0) {
              delete target[itemId];
            } else {
              target[itemId] = v;
            }
            commit();
            // update button count
            const pb = planetBtns[planetId];
            if (pb) {
              const itemCount = Object.values(target).filter(x => x > 0).length;
              const pname = PLANET_NAMES[planetId] || planetId;
              pb.textContent = `${pname} (${itemCount})`;
            }
          });
          row.appendChild(lbl);
          row.appendChild(inp);
          grid.appendChild(row);
        }
        catSection.appendChild(grid);
        trayContainer.appendChild(catSection);
      }
    }
  }

  // ======== Panel show/hide ========
  function showPanel() {
    if (!sync()) { alert('未检测到游戏运行状态，请先进入工厂。'); return; }
    panelVisible = true;
    btn.style.opacity = '1';
    renderContent();
    overlay.style.display = 'flex';
  }

  function hidePanel() {
    panelVisible = false;
    btn.style.opacity = '.55';
    overlay.style.display = 'none';
  }

  function togglePanel() {
    if (panelVisible) hidePanel();
    else showPanel();
  }

  // ======== FPS Counter ========
  const fpsBtn = document.createElement('div');
  fpsBtn.id = 'dsp-fps-btn';
  fpsBtn.textContent = '-- FPS';
  Object.assign(fpsBtn.style, {
    position: 'fixed', zIndex: 99999, top: '12px', right: '20px',
    padding: '3px 10px', borderRadius: '6px',
    background: 'rgba(15,15,26,.85)', color: '#8f8',
    fontSize: '12px', fontFamily: '"Consolas","Courier New",monospace',
    cursor: 'grab', userSelect: 'none',
    boxShadow: '0 1px 6px rgba(0,0,0,.4)',
    border: '1px solid #2a2a40',
    lineHeight: '20px',
  });

  (function () {
    let dx, dy;
    fpsBtn.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const r = fpsBtn.getBoundingClientRect();
      dx = e.clientX - r.left; dy = e.clientY - r.top;
      const onMove = ev => {
        fpsBtn.style.left = (ev.clientX - dx) + 'px';
        fpsBtn.style.top = (ev.clientY - dy) + 'px';
        fpsBtn.style.right = 'auto';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        fpsBtn.style.cursor = 'grab';
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  })();
  document.body.appendChild(fpsBtn);

  // FPS calculation
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let currentFps = 0;

  function tickFps() {
    frameCount++;
    const now = performance.now();
    const elapsed = now - lastFpsTime;
    if (elapsed >= 500) {
      currentFps = Math.round(frameCount / (elapsed / 1000));
      fpsBtn.textContent = currentFps + ' FPS';
      if (currentFps < 30) fpsBtn.style.color = '#f88';
      else if (currentFps < 55) fpsBtn.style.color = '#ff8';
      else fpsBtn.style.color = '#8f8';
      frameCount = 0;
      lastFpsTime = now;
    }
    requestAnimationFrame(tickFps);
  }
  requestAnimationFrame(tickFps);

  // Wait for game state
  let retries = 0;
  function waitForGame() {
    if (!sync()) {
      if (++retries > 100) return;
      setTimeout(waitForGame, 500);
    }
  }
  waitForGame();

  // Periodic re-sync — only update ref, never rebuild inputs (would reset editing)
  setInterval(() => {
    const found = findGameState();
    if (found && found.state) game = found;
  }, 2000);
})();
