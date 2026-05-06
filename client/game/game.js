import { tiles } from '../constants/tiles.js';
import { DEFAULT_BUILDING_KEY } from '../constants/buildings-toolbar.js';
import {
  KNIGHT_TOOL_KEY,
  canAfford,
  getNumericCost,
  getPlacementCostEntry,
  subtractResources,
} from '../constants/economy.js';
import { KNIGHT_SPRITE_SIZE } from '../constants/knight-atlas.js';
import { PLAYER_PROFILES } from '../constants/players.js';
import {
  FARM_GROWTH_STAGE_MS,
  FARM_GROWTH_STAGES,
  getMarketConstructionStageDurationMs,
  WHEAT_PER_FARM_HARVEST,
} from '../constants/buildings-progress.js';
import {
  SHOP_WHEAT_PER_ONE_GOLD,
  SHOP_WHEAT_PER_SPENT_GOLD,
  SHOP_WOOD_PER_ONE_GOLD,
  SHOP_WOOD_PER_SPENT_GOLD,
} from '../constants/shop-exchange.js';
import { cloneStartingResources, WOOD_PER_KNIGHT_TREE_CHOP } from '../constants/resources.js';
import { TILE_SIZE } from '../constants/sizes.js';
import { TREE_REGROW_INTERVAL_MS } from '../constants/forest-regrowth.js';
import {
  WORLD_HEIGHT_PX,
  WORLD_MIN_VISIBLE_EDGE_PX,
  WORLD_WIDTH_PX,
} from '../constants/world.js';
import './atmosphere/castle-flags.js';
import { SnowOverlay } from './atmosphere/snow-overlay.js';
import { tryRegrowOneTree } from './forest-regrowth.js';
import { TreesGenerator } from './generators/trees-generator.js';
import { KnightSystem } from './knights/knight-system.js';

const MAX_BUILD_DISTANCE_CELLS = 2;
const HOUSE_NEIGHBOR_RADIUS_CELLS = 3;

/** @type {{ width: number; height: number; type: string }} */
const KNIGHT_SPAWN_FOOTPRINT = { type: 'knight', width: TILE_SIZE, height: TILE_SIZE };

export class Game {
  /** @type {KnightSystem} */
  #knightSystem;

  /** @type {Map<string, import('../constants/resources.js').PlayerResources>} */
  #playerResources = new Map();

  /**
   * Таймеры постройки магазина и роста фермы.
   * @type {(
   *   | { kind: 'market'; x: number; y: number; step: 0 | 1; nextAt: number }
   *   | { kind: 'farm'; x: number; y: number; nextAt: number }
   * )[]}
   */
  #progressJobs = [];

  /** Накопление времени до следующего выращивания одного дерева. */
  #treeRegrowAccumMs = 0;

  /**
   * Creates an instance of Game.
   *
   * @typedef {import('../engine/canvas-renderer.js').CanvasRenderer} CanvasRenderer
   * @typedef {import('../engine/controls.js').Controls} Controls
   * @typedef {import('../engine/state/state-manager.js').StateManager} StateManager
   * @typedef {import('../ui/ui.js').UI} UI
   *
   * @constructor
   * @param {{
   *   renderer: CanvasRenderer,
   *   controls: Controls,
   *   stateManager: StateManager,
   *   ui: UI,
   *   knightImage: CanvasImageSource,
   * }} options
   */
  constructor({ renderer, controls, stateManager, ui, knightImage }) {
    this.renderer = renderer;
    this.controls = controls;
    this.stateManager = stateManager;
    this.ui = ui;
    /** @type {CanvasImageSource} */
    this.knightImage = knightImage;

    /** @type {SnowOverlay | null} */
    this.snow = null;
    this.localPlayer = PLAYER_PROFILES[0];

    this.#knightSystem = new KnightSystem({
      deleteTreeAt: (x, y, ownerUserId) => {
        this.stateManager.deleteCell({ x, y });
        const resources = this.#playerResources.get(ownerUserId);
        if (resources) {
          resources.wood += WOOD_PER_KNIGHT_TREE_CHOP;
          if (ownerUserId === this.localPlayer.userId) {
            this.ui.setResources(resources);
          }
        }
      },
    });
  }

  init() {
    //TestTilesGenerator.generateAllTiles(this.stateManager);
    this.ui.setPlayerBadge(this.localPlayer);
    this.#setupWorld();
  }

  /** Пересобрать мир под текущий размер канваса (resize окна / панели). */
  resizeViewport() {
    this.#setupWorld();
  }

  #setupWorld() {
    this.stateManager.clear();
    this.#knightSystem.clear();
    this.#progressJobs = [];
    this.#treeRegrowAccumMs = 0;

    const rendererSize = this.renderer.getRendererSize();
    this.controls.setViewportSize({ width: rendererSize.width, height: rendererSize.height });

    const visibleOuterMarginX = Math.max(0, rendererSize.width - WORLD_MIN_VISIBLE_EDGE_PX);
    const visibleOuterMarginY = Math.max(0, rendererSize.height - WORLD_MIN_VISIBLE_EDGE_PX);

    const fromX = Math.floor(-visibleOuterMarginX / TILE_SIZE) * TILE_SIZE;
    const fromY = Math.floor(-visibleOuterMarginY / TILE_SIZE) * TILE_SIZE;
    const toX = Math.ceil((WORLD_WIDTH_PX + visibleOuterMarginX - TILE_SIZE) / TILE_SIZE) * TILE_SIZE;
    const toY = Math.ceil((WORLD_HEIGHT_PX + visibleOuterMarginY - TILE_SIZE) / TILE_SIZE) * TILE_SIZE;

    TreesGenerator.generateTrees(this.stateManager, {
      from: { x: fromX, y: fromY },
      to: { x: toX, y: toY },
    });
    this.#resetPlayerResources();
    this.#placeInitialCastles();
    this.#syncResourcesUi();

    this.snow = new SnowOverlay({
      width: rendererSize.width,
      height: rendererSize.height,
    });
  }

  render() {
    this.renderer.clear();
    this.renderer.drawWorldBorder({
      scrollOffset: this.controls.getScrollOffset(),
      x: 0,
      y: 0,
      width: WORLD_WIDTH_PX,
      height: WORLD_HEIGHT_PX,
    });

    const buildingKey = this.ui.getSelectedBuilding() ?? DEFAULT_BUILDING_KEY;
    const tileData = buildingKey === KNIGHT_TOOL_KEY ? KNIGHT_SPAWN_FOOTPRINT : tiles[buildingKey];
    const { tx, ty } = this.controls.getSelectedCoords();

    this.renderer.drawSelector({
      tx,
      ty,
      width: tileData.width,
      height: tileData.height,
    });

    const showPlayerIndicators = this.controls.isSpacePressed();

    this.renderer.drawState({
      state: this.stateManager.getState(),
      scrollOffset: this.controls.getScrollOffset(),
      showPlayerIndicators,
      localPlayerUserId: this.localPlayer.userId,
    });

    this.#knightSystem.render(
      this.renderer.ctx,
      this.controls.getScrollOffset(),
      this.knightImage,
      showPlayerIndicators,
      this.localPlayer.userId
    );

    const marqueeDraft = this.controls.getMarqueeDraftWorldRect();
    if (marqueeDraft) {
      const ctx = this.renderer.ctx;
      const { offsetX, offsetY } = this.controls.getScrollOffset();
      const rx = Math.round(marqueeDraft.minX + offsetX);
      const ry = Math.round(marqueeDraft.minY + offsetY);
      const rw = Math.max(1, Math.round(marqueeDraft.maxX - marqueeDraft.minX));
      const rh = Math.max(1, Math.round(marqueeDraft.maxY - marqueeDraft.minY));
      ctx.save();
      ctx.strokeStyle = 'rgb(120, 220, 255)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
    }

    this.snow?.render(this.renderer.ctx, this.controls.getScrollOffset());
  }

  update(timeStep) {
    this.snow?.update(timeStep, this.controls.getScrollOffset());

    this.#treeRegrowAccumMs += timeStep;
    while (this.#treeRegrowAccumMs >= TREE_REGROW_INTERVAL_MS) {
      this.#treeRegrowAccumMs -= TREE_REGROW_INTERVAL_MS;
      tryRegrowOneTree(this.stateManager, WORLD_WIDTH_PX, WORLD_HEIGHT_PX);
    }

    this.#processProgressJobs();

    const right = this.controls.consumeRightClickWorld();
    if (right) {
      this.#knightSystem.issueOrder(
        right.wx,
        right.wy,
        this.stateManager,
        WORLD_WIDTH_PX,
        WORLD_HEIGHT_PX,
        this.localPlayer.userId,
        (msg) => this.ui.showToast(msg)
      );
    }

    const marqueeRect = this.controls.consumeMarqueeSelectionWorldRect();
    if (marqueeRect !== null) {
      this.#knightSystem.selectUnitsInWorldRect(
        marqueeRect.minX,
        marqueeRect.minY,
        marqueeRect.maxX,
        marqueeRect.maxY,
        this.localPlayer.userId
      );
    }

    const clickedCords = this.controls.getClickedCoords();

    if (clickedCords !== null) {
      const { tx, ty, shiftKey, worldPx, worldPy } = clickedCords;

      if (!this.#knightSystem.trySelectAt(worldPx, worldPy, shiftKey, this.localPlayer.userId)) {
        this.#knightSystem.clearSelection();

        const selectedBuilding = this.ui.getSelectedBuilding() ?? DEFAULT_BUILDING_KEY;

        if (!this.#tryHarvestFarm(tx, ty) && !this.#tryOpenShop(tx, ty)) {
          if (selectedBuilding === KNIGHT_TOOL_KEY) {
            const validationError = this.#validatePlacement({
              x: tx,
              y: ty,
              tileData: KNIGHT_SPAWN_FOOTPRINT,
            });
            if (validationError) {
              this.ui.showToast(validationError);
            } else {
              const affordError = this.#tryAffordPlacement(KNIGHT_TOOL_KEY);
              if (affordError) {
                this.ui.showToast(affordError);
              } else {
                this.#payForPlacement(KNIGHT_TOOL_KEY);
                const half = KNIGHT_SPRITE_SIZE / 2;
                let spawnX = worldPx - half;
                let spawnY = worldPy - half;
                const minX = tx;
                const minY = ty;
                const maxX = tx + TILE_SIZE - KNIGHT_SPRITE_SIZE;
                const maxY = ty + TILE_SIZE - KNIGHT_SPRITE_SIZE;
                spawnX = Math.max(minX, Math.min(maxX, spawnX));
                spawnY = Math.max(minY, Math.min(maxY, spawnY));
                this.#knightSystem.spawn({
                  x: spawnX,
                  y: spawnY,
                  ownerUserId: this.localPlayer.userId,
                });
              }
            }
          } else {
            const placementTileKey =
              selectedBuilding === 'market' ? 'marketStage1' : selectedBuilding;
            const tileData = tiles[placementTileKey];
            const validationError = this.#validatePlacement({
              x: tx,
              y: ty,
              tileData,
            });

            if (validationError) {
              this.ui.showToast(validationError);
            } else {
              const uniqueError = this.#tryUniquePlacementRule(selectedBuilding);
              if (uniqueError) {
                this.ui.showToast(uniqueError);
              } else {
                const affordError = this.#tryAffordPlacement(selectedBuilding);
                if (affordError) {
                  this.ui.showToast(affordError);
                } else {
                  this.#payForPlacement(selectedBuilding);
                  this.stateManager.setCell({
                    x: tx,
                    y: ty,
                    tileData,
                    ownerUserId: this.localPlayer.userId,
                  });
                  if (selectedBuilding === 'market') {
                    this.#registerMarketConstruction(tx, ty);
                  } else if (selectedBuilding === 'farmStage1') {
                    this.#registerFarmGrowth(tx, ty);
                  }
                }
              }
            }
          }
        }
      }
    }

    this.#knightSystem.update(timeStep, this.stateManager, WORLD_WIDTH_PX, WORLD_HEIGHT_PX);
  }

  #resetPlayerResources() {
    this.#playerResources.clear();
    for (const playerProfile of PLAYER_PROFILES) {
      this.#playerResources.set(playerProfile.userId, cloneStartingResources());
    }
  }

  #syncResourcesUi() {
    const resources = this.#playerResources.get(this.localPlayer.userId);
    if (resources) {
      this.ui.setResources(resources);
    }
  }

  /**
   * @param {string} toolKey
   * @returns {string | null}
   */
  #tryUniquePlacementRule(toolKey) {
    const entry = getPlacementCostEntry(toolKey);
    if (!entry.uniquePerPlayer) {
      return null;
    }
    if (toolKey === 'market' && this.#playerHasAnyMarket(this.localPlayer.userId)) {
      return 'Магазин можно построить только один раз.';
    }
    return null;
  }

  /**
   * @param {string} toolKey
   * @returns {string | null}
   */
  #tryAffordPlacement(toolKey) {
    const resources = this.#playerResources.get(this.localPlayer.userId);
    if (!resources) {
      return 'Нет данных ресурсов.';
    }
    if (!canAfford(resources, getNumericCost(toolKey))) {
      return 'Недостаточно ресурсов.';
    }
    return null;
  }

  /**
   * @param {string} toolKey
   */
  #payForPlacement(toolKey) {
    const resources = this.#playerResources.get(this.localPlayer.userId);
    if (!resources) {
      return;
    }
    subtractResources(resources, getNumericCost(toolKey));
    this.ui.setResources(resources);
  }

  /**
   * @param {{ x: number; y: number; tileData: { type: string; width: number; height: number } }} param0
   * @returns {string | null}
   */
  #validatePlacement({ x, y, tileData }) {
    if (!this.#isInsideWorld({ x, y, tileData })) {
      return 'Нельзя строить за пределами мира.';
    }

    const blockingCell = this.#getBlockingCellInArea({ x, y, tileData });
    if (blockingCell) {
      if (this.#isTreeSpriteType(blockingCell.spriteType)) {
        return 'Нельзя ставить здание поверх дерева. Сначала расчистите место.';
      }
      return 'Нельзя ставить здание на занятую клетку.';
    }

    if (!this.#hasOwnedCellInRadius({ x, y, tileData, radiusCells: MAX_BUILD_DISTANCE_CELLS })) {
      return 'Слишком далеко от вашего дома: максимум 2 клетки.';
    }

    if (
      this.#isHomeBuildingType(tileData.type)
      && !this.#hasOwnedHomeInRadius({ x, y, tileData, radiusCells: HOUSE_NEIGHBOR_RADIUS_CELLS })
    ) {
      return 'Для дома рядом (до 3 клеток) нужен ещё один ваш дом.';
    }

    return null;
  }

  /**
   * @param {{ x: number; y: number; tileData: { width: number; height: number } }} param0
   * @returns {boolean}
   */
  #isInsideWorld({ x, y, tileData }) {
    const maxX = WORLD_WIDTH_PX - tileData.width;
    const maxY = WORLD_HEIGHT_PX - tileData.height;

    return x >= 0 && y >= 0 && x <= maxX && y <= maxY;
  }

  /**
   * @param {string} spriteType
   * @returns {boolean}
   */
  #isHomeBuildingType(spriteType) {
    return (
      spriteType === 'castle' ||
      spriteType === 'houseFarm' ||
      spriteType.startsWith('farmStage') ||
      spriteType.startsWith('house')
    );
  }

  /**
   * @param {string} spriteType
   * @returns {boolean}
   */
  #isTreeSpriteType(spriteType) {
    const type = spriteType.toLowerCase();
    return type.includes('tree') || type.includes('spruce');
  }

  /**
   * @param {{ x: number; y: number; tileData: { width: number; height: number } }} param0
   * @returns {boolean}
   */
  #getBlockingCellInArea({ x, y, tileData }) {
    const state = this.stateManager.getState();
    const cellsWide = tileData.width / TILE_SIZE;
    const cellsHigh = tileData.height / TILE_SIZE;

    for (let ix = 0; ix < cellsWide; ix++) {
      for (let iy = 0; iy < cellsHigh; iy++) {
        const checkX = x + ix * TILE_SIZE;
        const checkY = y + iy * TILE_SIZE;

        const cell = state.get(`${checkX}:${checkY}`);
        if (cell) {
          return cell;
        }
      }
    }

    return null;
  }

  /**
   * @param {{ x: number; y: number; tileData: { width: number; height: number }; radiusCells: number }} param0
   * @returns {boolean}
   */
  #hasOwnedCellInRadius({ x, y, tileData, radiusCells }) {
    const target = this.#getTileRect({ x, y, tileData });

    for (const [coords, cell] of this.stateManager.getState().entries()) {
      if (cell.ownerUserId !== this.localPlayer.userId) {
        continue;
      }

      const [cellX, cellY] = coords.split(':').map(Number);
      const distance = this.#distanceFromRectToTile({
        rect: target,
        tileX: cellX / TILE_SIZE,
        tileY: cellY / TILE_SIZE,
      });

      if (distance <= radiusCells) {
        return true;
      }
    }

    return false;
  }

  /**
   * @param {{ x: number; y: number; tileData: { width: number; height: number }; radiusCells: number }} param0
   * @returns {boolean}
   */
  #hasOwnedHomeInRadius({ x, y, tileData, radiusCells }) {
    const target = this.#getTileRect({ x, y, tileData });

    for (const [coords, cell] of this.stateManager.getState().entries()) {
      if (cell.ownerUserId !== this.localPlayer.userId || !this.#isHomeBuildingType(cell.spriteType)) {
        continue;
      }

      const [cellX, cellY] = coords.split(':').map(Number);
      const distance = this.#distanceFromRectToTile({
        rect: target,
        tileX: cellX / TILE_SIZE,
        tileY: cellY / TILE_SIZE,
      });

      if (distance <= radiusCells) {
        return true;
      }
    }

    return false;
  }

  /**
   * @param {{ x: number; y: number; tileData: { width: number; height: number } }} param0
   * @returns {{ minTx: number; maxTx: number; minTy: number; maxTy: number }}
   */
  #getTileRect({ x, y, tileData }) {
    const minTx = x / TILE_SIZE;
    const minTy = y / TILE_SIZE;
    const maxTx = minTx + tileData.width / TILE_SIZE - 1;
    const maxTy = minTy + tileData.height / TILE_SIZE - 1;

    return { minTx, maxTx, minTy, maxTy };
  }

  /**
   * @param {{
   *   rect: { minTx: number; maxTx: number; minTy: number; maxTy: number };
   *   tileX: number;
   *   tileY: number;
   * }} param0
   * @returns {number}
   */
  #distanceFromRectToTile({ rect, tileX, tileY }) {
    const dx = tileX < rect.minTx ? rect.minTx - tileX : tileX > rect.maxTx ? tileX - rect.maxTx : 0;
    const dy = tileY < rect.minTy ? rect.minTy - tileY : tileY > rect.maxTy ? tileY - rect.maxTy : 0;

    return Math.max(dx, dy);
  }

  #placeInitialCastles() {
    for (const playerProfile of PLAYER_PROFILES) {
      this.stateManager.setCell({
        x: playerProfile.castleStart.x,
        y: playerProfile.castleStart.y,
        tileData: tiles.castle,
        ownerUserId: playerProfile.userId,
      });
    }
  }

  #processProgressJobs() {
    const now = performance.now();
    const stageMs = getMarketConstructionStageDurationMs();
    const keep = [];

    for (const job of this.#progressJobs) {
      if (now < job.nextAt) {
        keep.push(job);
        continue;
      }

      if (job.kind === 'market') {
        if (job.step === 0) {
          this.#replaceTileAt(job.x, job.y, 'marketStage2');
          job.step = 1;
          job.nextAt = now + stageMs;
          keep.push(job);
        } else {
          this.#replaceTileAt(job.x, job.y, 'market');
        }
        continue;
      }

      if (job.kind === 'farm') {
        if (this.#advanceFarmGrowthJob(job, now)) {
          keep.push(job);
        }
      }
    }

    this.#progressJobs = keep;
  }

  /**
   * @param {string} tileKey
   */
  #replaceTileAt(x, y, tileKey) {
    const state = this.stateManager.getState();
    const key = `${x}:${y}`;
    const cell = state.get(key);
    if (!cell?.isRenderable) {
      return;
    }
    const ownerUserId = cell.ownerUserId;
    const tileData = tiles[tileKey];
    if (!tileData) {
      return;
    }
    this.stateManager.deleteCell({ x, y });
    this.stateManager.setCell({ x, y, tileData, ownerUserId });
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  #registerMarketConstruction(x, y) {
    this.#progressJobs.push({
      kind: 'market',
      x,
      y,
      step: 0,
      nextAt: performance.now() + getMarketConstructionStageDurationMs(),
    });
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  #registerFarmGrowth(x, y) {
    this.#progressJobs.push({
      kind: 'farm',
      x,
      y,
      nextAt: performance.now() + FARM_GROWTH_STAGE_MS,
    });
  }

  /**
   * @param {{ kind: 'farm'; x: number; y: number; nextAt: number }} job
   * @param {number} now
   * @returns {boolean} оставить задачу в очереди
   */
  #advanceFarmGrowthJob(job, now) {
    const state = this.stateManager.getState();
    const cell = state.get(`${job.x}:${job.y}`);
    if (!cell?.isRenderable) {
      return false;
    }

    const t = cell.spriteType;
    const idx = FARM_GROWTH_STAGES.indexOf(t);
    if (idx < 0 || idx >= FARM_GROWTH_STAGES.length - 1) {
      return false;
    }

    const nextType = FARM_GROWTH_STAGES[idx + 1];
    this.#replaceTileAt(job.x, job.y, nextType);

    if (nextType === 'farmStage4') {
      return false;
    }

    job.nextAt = now + FARM_GROWTH_STAGE_MS;
    return true;
  }

  /**
   * Клик по магазину: модалка обмена или сообщение.
   *
   * @param {number} tx
   * @param {number} ty
   * @returns {boolean} true если клик относится к магазину (обработан)
   */
  #tryOpenShop(tx, ty) {
    const cell = this.stateManager.getState().get(`${tx}:${ty}`);
    if (!cell?.isRenderable) {
      return false;
    }

    if (cell.spriteType === 'marketStage1' || cell.spriteType === 'marketStage2') {
      this.ui.showToast('Магазин ещё строится.');
      return true;
    }

    if (cell.spriteType !== 'market') {
      return false;
    }

    if (cell.ownerUserId !== this.localPlayer.userId) {
      this.ui.showToast('Это не ваш магазин.');
      return true;
    }

    this.ui.openMarketShop({
      getResources: () => this.#playerResources.get(this.localPlayer.userId),
      onExchange: (kind, qty) => this.#shopExchange(kind, qty),
    });
    return true;
  }

  /**
   * @param {'wheatToGold' | 'woodToGold' | 'goldToWood' | 'goldToWheat'} kind
   * @param {number} qty
   * @returns {{ ok: boolean; message?: string }}
   */
  #shopExchange(kind, qty) {
    const q = Math.floor(Number(qty));
    if (!Number.isFinite(q) || q <= 0) {
      return { ok: false, message: 'Укажите количество больше нуля.' };
    }

    const resources = this.#playerResources.get(this.localPlayer.userId);
    if (!resources) {
      return { ok: false, message: 'Нет данных ресурсов.' };
    }

    switch (kind) {
      case 'wheatToGold': {
        const batches = Math.floor(q / SHOP_WHEAT_PER_ONE_GOLD);
        if (batches < 1) {
          return { ok: false, message: `Нужно минимум ${SHOP_WHEAT_PER_ONE_GOLD} пшеницы.` };
        }
        const cost = batches * SHOP_WHEAT_PER_ONE_GOLD;
        if (resources.wheat < cost) {
          return { ok: false, message: 'Недостаточно пшеницы.' };
        }
        resources.wheat -= cost;
        resources.gold += batches;
        break;
      }
      case 'woodToGold': {
        const batches = Math.floor(q / SHOP_WOOD_PER_ONE_GOLD);
        if (batches < 1) {
          return { ok: false, message: `Нужно минимум ${SHOP_WOOD_PER_ONE_GOLD} дерева.` };
        }
        const cost = batches * SHOP_WOOD_PER_ONE_GOLD;
        if (resources.wood < cost) {
          return { ok: false, message: 'Недостаточно дерева.' };
        }
        resources.wood -= cost;
        resources.gold += batches;
        break;
      }
      case 'goldToWood': {
        if (resources.gold < q) {
          return { ok: false, message: 'Недостаточно золота.' };
        }
        resources.gold -= q;
        resources.wood += q * SHOP_WOOD_PER_SPENT_GOLD;
        break;
      }
      case 'goldToWheat': {
        if (resources.gold < q) {
          return { ok: false, message: 'Недостаточно золота.' };
        }
        resources.gold -= q;
        resources.wheat += q * SHOP_WHEAT_PER_SPENT_GOLD;
        break;
      }
      default:
        return { ok: false, message: 'Неизвестный тип обмена.' };
    }

    this.ui.setResources(resources);
    return { ok: true };
  }

  /**
   * @param {number} tx
   * @param {number} ty
   * @returns {boolean} клик обработан (в т.ч. чужая ферма — тост)
   */
  #tryHarvestFarm(tx, ty) {
    const cell = this.stateManager.getState().get(`${tx}:${ty}`);
    if (!cell?.isRenderable || cell.spriteType !== 'farmStage4') {
      return false;
    }

    if (cell.ownerUserId !== this.localPlayer.userId) {
      this.ui.showToast('Это не ваша ферма.');
      return true;
    }

    const resources = this.#playerResources.get(this.localPlayer.userId);
    if (resources) {
      resources.wheat += WHEAT_PER_FARM_HARVEST;
      this.ui.setResources(resources);
    }

    this.#replaceTileAt(tx, ty, 'farmStage1');
    this.#registerFarmGrowth(tx, ty);
    return true;
  }

  /**
   * @param {string} userId
   * @returns {boolean}
   */
  #playerHasAnyMarket(userId) {
    const constructionOrDone = new Set(['market', 'marketStage1', 'marketStage2']);
    for (const [, cell] of this.stateManager.getState().entries()) {
      if (cell.isRenderable && cell.ownerUserId === userId && constructionOrDone.has(cell.spriteType)) {
        return true;
      }
    }
    return false;
  }
}
