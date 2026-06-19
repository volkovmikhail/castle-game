import { tiles } from '../constants/tiles.js';
import {
  BARN_TOOL_KEY,
  BLACKSMITH_TOOL_KEY,
  HOUSE_TOOL_KEY,
  KNIGHT_TOOL_KEY,
  canAfford,
  getNumericCost,
  getPlacementCostEntry,
  subtractResources,
} from '../constants/economy.js';
import { KNIGHT_SPRITE_HEIGHT, KNIGHT_SPRITE_WIDTH } from '../constants/knight-atlas.js';
import { PLAYER_PROFILES } from '../constants/players.js';
import {
  FARM_GROWTH_STAGE_MS,
  FARM_GROWTH_STAGES,
  FARM_RIPE_BEFORE_AUTO_HARVEST_MS,
  getMarketConstructionStageDurationMs,
  WHEAT_PER_FARM_HARVEST,
} from '../constants/buildings-progress.js';
import {
  SHOP_WHEAT_PER_ONE_GOLD,
  SHOP_WHEAT_PER_SPENT_GOLD,
  SHOP_WOOD_PER_ONE_GOLD,
  SHOP_WOOD_PER_SPENT_GOLD,
} from '../constants/shop-exchange.js';
import {
  BLACKSMITH_COMPLETED_SPRITE_TYPE,
  BLACKSMITH_CONSTRUCTION_SPRITE_TYPES,
  getKnightUpgradeCost,
  maxKnightUpgradeLevelForBlacksmiths,
} from '../constants/knight-upgrades.js';
import { BUILDING_REGEN_HP_PER_SECOND } from '../constants/structure-hp.js';
import {
  BASE_STORAGE_CAP_WHEAT_WOOD,
  cloneStartingResources,
  getKnightChopWoodForForestSprite,
  GOLD_PER_KNIGHT_COMBINE_PLANTS_CHOP,
  GOLD_PER_KNIGHT_ROCK_CHOP,
  GOLD_PER_KNIGHT_TWO_ROCKS_CHOP,
  BASE_KNIGHT_SLOTS,
  KNIGHT_SLOTS_PER_RESIDENTIAL_HOUSE,
  RESIDENTIAL_HOUSE_COMPLETED_TYPES,
  STORAGE_BONUS_PER_BARN_WHEAT_WOOD,
  WOOD_PER_KNIGHT_COMBINE_PLANTS_CHOP,
  WOOD_PER_KNIGHT_LOGS_CHOP,
} from '../constants/resources.js';
import { TILE_SIZE } from '../constants/sizes.js';
import { TREE_REGROW_INTERVAL_MS } from '../constants/forest-regrowth.js';
import {
  TEST_KNIGHTS_ENABLED,
  TEST_KNIGHT_SPAWNS_NEAR_YELLOW_CASTLE,
} from '../constants/test-knights.js';
import {
  WORLD_HEIGHT_PX,
  WORLD_MIN_VISIBLE_EDGE_PX,
  WORLD_WIDTH_PX,
} from '../constants/world.js';
import { SnowOverlay } from './atmosphere/snow-overlay.js';
import { Random } from '../common/random.js';
import { tryMatureOneSapling, tryMatureOneTreeToBig, tryRegrowOneTree } from './forest-regrowth.js';
import { isForestFloorDecalSpriteType, isTreeSpriteType } from '../common/grid-path.js';
import { createBuildingHp } from './entities/building-hp.js';
import { TreesGenerator } from './generators/trees-generator.js';
import { KnightSystem } from './knights/knight-system.js';

const MAX_BUILD_DISTANCE_CELLS = 2;
const HOUSE_NEIGHBOR_RADIUS_CELLS = 3;

/** Готовые сараи: вместимость считается только по ним. */
const BARN_CAPACITY_SPRITE_TYPES = new Set(['houseBarn', 'houseBarnSide']);

/** Стадии стройки сарая — клик показывает тост (как магазин). */
const BARN_UNDER_CONSTRUCTION_SPRITES = new Set([
  'houseBarnStage1',
  'houseBarnStage2',
  'houseBarnSideStage1',
  'houseBarnSideStage2',
]);

/** @type {readonly ('house' | 'houseSide' | 'houseDouble')[]} */
const RESIDENTIAL_HOUSE_VARIANTS = ['house', 'houseSide', 'houseDouble'];

const RESIDENTIAL_HOUSE_COMPLETED_SPRITES = new Set(RESIDENTIAL_HOUSE_COMPLETED_TYPES);

const RESIDENTIAL_HOUSE_UNDER_CONSTRUCTION_SPRITES = new Set([
  'houseStage1',
  'houseStage2',
  'houseSideStage1',
  'houseSideStage2',
  'houseDoubleStage1',
  'houseDoubleStage2',
]);

/** @type {{ width: number; height: number; type: string }} */
const KNIGHT_SPAWN_FOOTPRINT = { type: 'knight', width: TILE_SIZE, height: TILE_SIZE };

/**
 * @param {'house' | 'houseSide' | 'houseDouble'} variant
 * @param {1 | 2} stage
 */
function residentialHouseStageKey(variant, stage) {
  if (variant === 'house') {
    return stage === 1 ? 'houseStage1' : 'houseStage2';
  }
  return stage === 1 ? `${variant}Stage1` : `${variant}Stage2`;
}

export class Game {
  /** @type {KnightSystem} */
  #knightSystem;

  /** @type {Map<string, import('../constants/resources.js').PlayerResources>} */
  #playerResources = new Map();

  /** @type {Map<string, { healthLevel: number; attackLevel: number }>} */
  #playerKnightUpgrades = new Map();

  /**
   * Таймеры постройки магазина / фермерского дома и роста фермы.
   * @type {(
   *   | { kind: 'market'; x: number; y: number; step: 0 | 1; nextAt: number }
   *   | { kind: 'houseFarmBuild'; x: number; y: number; step: 0 | 1; nextAt: number }
   *   | {
   *       kind: 'barnBuild';
   *       x: number;
   *       y: number;
   *       step: 0 | 1;
   *       variant: 'houseBarn' | 'houseBarnSide';
   *       nextAt: number;
   *     }
   *   | {
   *       kind: 'residentialHouseBuild';
   *       x: number;
   *       y: number;
   *       step: 0 | 1;
   *       variant: 'house' | 'houseSide' | 'houseDouble';
   *       nextAt: number;
   *     }
   *   | { kind: 'blacksmithBuild'; x: number; y: number; step: 0 | 1; nextAt: number }
   *   | { kind: 'farmHouseHarvestWait'; x: number; y: number; nextAt: number }
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
      applyChopHit: (anchorTx, anchorTy, knightOwnerId, damage) => {
        this.#applyChopHit(anchorTx, anchorTy, knightOwnerId, damage);
      },
    });
  }

  /**
   * Урон по дереву или вражескому зданию (якорь — левый верх отпечатка).
   *
   * @param {number} anchorTx
   * @param {number} anchorTy
   * @param {string} knightOwnerId
   * @param {number} damage
   */
  #applyChopHit(anchorTx, anchorTy, knightOwnerId, damage) {
    const state = this.stateManager.getState();
    const cell = state.get(`${anchorTx}:${anchorTy}`);
    if (!cell?.entity || typeof cell.entity.hp !== 'number') {
      return;
    }

    const ent = cell.entity;

    if (isTreeSpriteType(cell.spriteType)) {
      ent.hp -= damage;
      ent.lastDamagedAtMs = performance.now();
      if (ent.hp <= 0) {
        const spriteType = cell.spriteType;
        const st = spriteType.toLowerCase();
        this.stateManager.deleteCell({ x: anchorTx, y: anchorTy });
        const resources = this.#playerResources.get(knightOwnerId);
        if (resources) {
          if (st === 'rock') {
            resources.gold += GOLD_PER_KNIGHT_ROCK_CHOP;
          } else if (st === 'tworocks') {
            resources.gold += GOLD_PER_KNIGHT_TWO_ROCKS_CHOP;
          } else if (st === 'logs') {
            resources.wood += WOOD_PER_KNIGHT_LOGS_CHOP;
          } else if (st === 'combineplants') {
            resources.gold += GOLD_PER_KNIGHT_COMBINE_PLANTS_CHOP;
            resources.wood += WOOD_PER_KNIGHT_COMBINE_PLANTS_CHOP;
          } else {
            resources.wood += getKnightChopWoodForForestSprite(st);
          }
          if (knightOwnerId === this.localPlayer.userId) {
            this.ui.setResources(resources);
          }
        }
        this.#placeForestChopFloorDecal(anchorTx, anchorTy, spriteType);
      }
      return;
    }

    if (cell.spriteType === 'knight' || !cell.ownerUserId || cell.ownerUserId === knightOwnerId) {
      return;
    }

    ent.hp -= damage;
    ent.lastDamagedAtMs = performance.now();
    if (ent.hp <= 0) {
      const tileData = tiles[cell.spriteType];
      if (tileData) {
        this.#replaceDestroyedBuildingFootprintWithDecals(anchorTx, anchorTy, tileData);
      }
    }
  }

  /**
   * После сруба: поленья → sticks; камни без декора; остальное — как раньше (цветы/пух).
   *
   * @param {number} anchorTx
   * @param {number} anchorTy
   * @param {string} spriteType
   */
  #placeForestChopFloorDecal(anchorTx, anchorTy, spriteType) {
    const st = spriteType.toLowerCase();
    if (st === 'logs') {
      if (tiles.sticks) {
        this.stateManager.setCell({ x: anchorTx, y: anchorTy, tileData: tiles.sticks, entity: null });
      }
      return;
    }
    if (st === 'rock' || st === 'tworocks') {
      return;
    }
    const isSpruce = st.includes('spruce');
    const roll = Random.getRandomFromRange(0, 2);
    if (roll > 0) {
      const decoKey = isSpruce
        ? roll === 1
          ? 'flower'
          : 'twoFlowers'
        : roll === 1
          ? 'fluff'
          : 'fluff2';
      const decoTile = tiles[decoKey];
      if (decoTile) {
        this.stateManager.setCell({ x: anchorTx, y: anchorTy, tileData: decoTile, entity: null });
      }
    }
  }

  /**
   * Каждая клетка отпечатка: sticks или peel с вероятностью 50%.
   *
   * @param {number} anchorTx
   * @param {number} anchorTy
   * @param {{ width: number; height: number }} tileData
   */
  #replaceDestroyedBuildingFootprintWithDecals(anchorTx, anchorTy, tileData) {
    const cellsWide = tileData.width / TILE_SIZE;
    const cellsHigh = tileData.height / TILE_SIZE;
    for (let ix = 0; ix < cellsWide; ix++) {
      for (let iy = 0; iy < cellsHigh; iy++) {
        const cx = anchorTx + ix * TILE_SIZE;
        const cy = anchorTy + iy * TILE_SIZE;
        this.stateManager.deleteCell({ x: cx, y: cy });
        const decoKey = Random.getRandomFromRange(0, 1) === 0 ? 'sticks' : 'peel';
        const decoTile = tiles[decoKey];
        if (decoTile) {
          this.stateManager.setCell({ x: cx, y: cy, tileData: decoTile, entity: null });
        }
      }
    }
  }

  /**
   * Постепенное восстановление HP зданий (деревья не регенерируются).
   *
   * @param {number} dtMs
   */
  #regenerateBuildingHp(dtMs) {
    const state = this.stateManager.getState();
    /** @type {Set<object>} */
    const seen = new Set();
    const rate = BUILDING_REGEN_HP_PER_SECOND / 1000;
    for (const [, cell] of state.entries()) {
      const ent = cell.entity;
      if (!ent?.regenerates || typeof ent.hp !== 'number') {
        continue;
      }
      if (seen.has(ent)) {
        continue;
      }
      seen.add(ent);
      if (ent.hp >= ent.maxHp) {
        continue;
      }
      ent.hp = Math.min(ent.maxHp, ent.hp + rate * dtMs);
    }
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
      knightOccupiedTileKeys: this.#knightSystem.getOccupiedTileKeys(),
    });
    this.#resetPlayerResources();
    this.#placeInitialCastles();
    this.#enforceStorageCapsAllPlayers();
    this.#spawnTestKnightsIfEnabled();

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

    const buildingKey = this.ui.getSelectedBuilding();
    const { tx, ty } = this.controls.getSelectedCoords();
    if (buildingKey) {
      const tileData =
        buildingKey === KNIGHT_TOOL_KEY
          ? KNIGHT_SPAWN_FOOTPRINT
          : buildingKey === BARN_TOOL_KEY
            ? tiles.houseBarn
            : buildingKey === HOUSE_TOOL_KEY
              ? tiles.house
              : buildingKey === BLACKSMITH_TOOL_KEY
                ? tiles.houseBlacksmith
                : tiles[buildingKey];

      this.renderer.drawSelector({
        tx,
        ty,
        width: tileData.width,
        height: tileData.height,
      });
    } else {
      this.renderer.drawSelector({
        tx,
        ty,
        width: TILE_SIZE,
        height: TILE_SIZE,
      });
    }

    const showPlayerIndicators = this.controls.isSpacePressed();

    this.renderer.drawState({
      state: this.stateManager.getState(),
      scrollOffset: this.controls.getScrollOffset(),
      showPlayerIndicators,
      localPlayerUserId: this.localPlayer.userId,
    });

    this.#knightSystem.render(this.renderer.ctx, this.controls.getScrollOffset(), this.knightImage);

    this.renderer.drawTreesAboveKnights({
      state: this.stateManager.getState(),
      scrollOffset: this.controls.getScrollOffset(),
      occupiedTileKeys: this.#knightSystem.getUpperHalfOccupiedTileKeys(),
    });

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

    const scrollOffset = this.controls.getScrollOffset();
    const state = this.stateManager.getState();

    this.renderer.drawCastleFlagsOnTop({ state, scrollOffset });

    this.renderer.drawPlayerBuildingTrianglesOnTop({
      state,
      scrollOffset,
      showPlayerIndicators,
      localPlayerUserId: this.localPlayer.userId,
    });

    this.#knightSystem.renderLocalPlayerTrianglesOnTop(
      this.renderer.ctx,
      scrollOffset,
      showPlayerIndicators,
      this.localPlayer.userId
    );
  }

  update(timeStep) {
    this.snow?.update(timeStep, this.controls.getScrollOffset());

    this.#treeRegrowAccumMs += timeStep;
    while (this.#treeRegrowAccumMs >= TREE_REGROW_INTERVAL_MS) {
      this.#treeRegrowAccumMs -= TREE_REGROW_INTERVAL_MS;
      const knightKeys = this.#knightSystem.getOccupiedTileKeys();
      tryMatureOneSapling(this.stateManager, knightKeys);
      tryMatureOneTreeToBig(this.stateManager, knightKeys);
      tryRegrowOneTree(this.stateManager, WORLD_WIDTH_PX, WORLD_HEIGHT_PX, knightKeys);
    }

    this.#processProgressJobs();
    this.#regenerateBuildingHp(timeStep);

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

    if (this.controls.consumeSelectAllKnightsRequest()) {
      this.#knightSystem.selectAllKnightsForOwner(this.localPlayer.userId);
    }

    const clickedCords = this.controls.getClickedCoords();

    if (clickedCords !== null) {
      const { tx, ty, shiftKey, worldPx, worldPy } = clickedCords;

      if (!this.#knightSystem.trySelectAt(worldPx, worldPy, shiftKey, this.localPlayer.userId)) {
        this.#knightSystem.clearSelection();

        const selectedBuilding = this.ui.getSelectedBuilding();

        if (
          !this.#tryHarvestFarm(tx, ty) &&
          !this.#tryOpenShop(tx, ty) &&
          !this.#tryOpenKnightUpgrade(tx, ty) &&
          selectedBuilding
        ) {
          if (selectedBuilding === KNIGHT_TOOL_KEY) {
            const validationError = this.#validatePlacement({
              x: tx,
              y: ty,
              tileData: KNIGHT_SPAWN_FOOTPRINT,
            });
            if (validationError) {
              this.ui.showToast(validationError);
            } else {
              const knightCapError = this.#tryKnightCapacityForSpawn(this.localPlayer.userId);
              if (knightCapError) {
                this.ui.showToast(knightCapError);
              } else {
              const affordError = this.#tryAffordPlacement(KNIGHT_TOOL_KEY);
              if (affordError) {
                this.ui.showToast(affordError);
              } else {
                this.#payForPlacement(KNIGHT_TOOL_KEY);
                let spawnX = worldPx - KNIGHT_SPRITE_WIDTH / 2;
                let spawnY = worldPy - KNIGHT_SPRITE_HEIGHT / 2;
                const minX = tx;
                const minY = ty;
                const maxX = tx + TILE_SIZE - KNIGHT_SPRITE_WIDTH;
                const maxY = ty + TILE_SIZE - KNIGHT_SPRITE_HEIGHT;
                spawnX = Math.max(minX, Math.min(maxX, spawnX));
                spawnY = Math.max(minY, Math.min(maxY, spawnY));
                const army = this.#getKnightUpgrades(this.localPlayer.userId);
                this.#knightSystem.spawn({
                  x: spawnX,
                  y: spawnY,
                  ownerUserId: this.localPlayer.userId,
                  healthLevel: army.healthLevel,
                  attackLevel: army.attackLevel,
                });
              }
              }
            }
          } else {
            /** @type {'houseBarn' | 'houseBarnSide' | null} */
            let barnVariant = null;
            /** @type {'house' | 'houseSide' | 'houseDouble' | null} */
            let residentialVariant = null;
            let placementTileKey;
            if (selectedBuilding === 'market') {
              placementTileKey = 'marketStage1';
            } else if (selectedBuilding === 'houseFarm') {
              placementTileKey = 'houseFarmStage1';
            } else if (selectedBuilding === BARN_TOOL_KEY) {
              barnVariant = Random.getRandomFromRange(0, 1) === 0 ? 'houseBarn' : 'houseBarnSide';
              placementTileKey = barnVariant === 'houseBarn' ? 'houseBarnStage1' : 'houseBarnSideStage1';
            } else if (selectedBuilding === HOUSE_TOOL_KEY) {
              residentialVariant =
                RESIDENTIAL_HOUSE_VARIANTS[Random.getRandomFromRange(0, RESIDENTIAL_HOUSE_VARIANTS.length - 1)];
              placementTileKey = residentialHouseStageKey(residentialVariant, 1);
            } else if (selectedBuilding === BLACKSMITH_TOOL_KEY) {
              placementTileKey = 'houseBlacksmithStage1';
            } else {
              placementTileKey = selectedBuilding;
            }
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
                    entity: createBuildingHp(),
                  });
                  if (selectedBuilding === 'market') {
                    this.#registerMarketConstruction(tx, ty);
                  } else if (selectedBuilding === 'houseFarm') {
                    this.#registerHouseFarmConstruction(tx, ty);
                  } else if (selectedBuilding === BARN_TOOL_KEY && barnVariant) {
                    this.#registerBarnConstruction(tx, ty, barnVariant);
                  } else if (selectedBuilding === HOUSE_TOOL_KEY && residentialVariant) {
                    this.#registerResidentialHouseConstruction(tx, ty, residentialVariant);
                  } else if (selectedBuilding === BLACKSMITH_TOOL_KEY) {
                    this.#registerBlacksmithConstruction(tx, ty);
                  } else if (selectedBuilding === 'farmStage1') {
                    this.#registerFarmGrowth(tx, ty);
                  }
                  this.ui.exitBuildMode();
                }
              }
            }
          }
        }
      }
    }

    this.#knightSystem.update(timeStep, this.stateManager, WORLD_WIDTH_PX, WORLD_HEIGHT_PX);
    this.#enforceStorageCapsAllPlayers();
  }

  #resetPlayerResources() {
    this.#playerResources.clear();
    this.#playerKnightUpgrades.clear();
    for (const playerProfile of PLAYER_PROFILES) {
      this.#playerResources.set(playerProfile.userId, cloneStartingResources());
      this.#playerKnightUpgrades.set(playerProfile.userId, { healthLevel: 0, attackLevel: 0 });
    }
  }

  /**
   * @param {string} userId
   * @returns {{ healthLevel: number; attackLevel: number }}
   */
  #getKnightUpgrades(userId) {
    return this.#playerKnightUpgrades.get(userId) ?? { healthLevel: 0, attackLevel: 0 };
  }

  /** @param {string} userId */
  #countBlacksmithsForPlayer(userId) {
    let n = 0;
    for (const [, cell] of this.stateManager.getState()) {
      if (cell.ownerUserId === userId && cell.spriteType === BLACKSMITH_COMPLETED_SPRITE_TYPE) {
        n++;
      }
    }
    return n;
  }

  #syncKnightArmyUi() {
    const userId = this.localPlayer.userId;
    const up = this.#getKnightUpgrades(userId);
    const maxLevel = maxKnightUpgradeLevelForBlacksmiths(this.#countBlacksmithsForPlayer(userId));
    this.ui.setKnightArmyLevels(up.healthLevel, up.attackLevel, maxLevel);
  }

  #syncResourcesUi() {
    const resources = this.#playerResources.get(this.localPlayer.userId);
    if (resources) {
      this.ui.setResources(resources);
    }
  }

  /**
   * @param {string} userId
   * @returns {string | null}
   */
  #tryKnightCapacityForSpawn(userId) {
    const max = this.#maxKnightsForPlayer(userId);
    const current = this.#knightSystem.countKnightsForOwner(userId);
    if (current >= max) {
      return `Лимит рыцарей: ${current}/${max}. Постройте дом (+${KNIGHT_SLOTS_PER_RESIDENTIAL_HOUSE} к лимиту).`;
    }
    return null;
  }

  /** Макс. рыцарей: база + готовые жилые дома владельца. */
  #maxKnightsForPlayer(userId) {
    let houses = 0;
    for (const [, cell] of this.stateManager.getState()) {
      if (cell.ownerUserId === userId && RESIDENTIAL_HOUSE_COMPLETED_SPRITES.has(cell.spriteType)) {
        houses++;
      }
    }
    return BASE_KNIGHT_SLOTS + houses * KNIGHT_SLOTS_PER_RESIDENTIAL_HOUSE;
  }

  /** Лимит пшеницы и дерева по числу готовых сараев владельца на карте. */
  #maxStoredWheatWoodForPlayer(userId) {
    let barns = 0;
    for (const [, cell] of this.stateManager.getState()) {
      if (cell.ownerUserId === userId && BARN_CAPACITY_SPRITE_TYPES.has(cell.spriteType)) {
        barns++;
      }
    }
    return BASE_STORAGE_CAP_WHEAT_WOOD + barns * STORAGE_BONUS_PER_BARN_WHEAT_WOOD;
  }

  /** Обрезка склада; лимиты в UI и строка ресурсов локального игрока. */
  #enforceStorageCapsAllPlayers() {
    for (const [userId, res] of this.#playerResources) {
      const max = this.#maxStoredWheatWoodForPlayer(userId);
      res.wheat = Math.min(res.wheat, max);
      res.wood = Math.min(res.wood, max);
    }
    const localUserId = this.localPlayer.userId;
    const localMax = this.#maxStoredWheatWoodForPlayer(localUserId);
    this.ui.setStorageCaps(localMax, localMax);
    this.ui.setKnightSlots(
      this.#knightSystem.countKnightsForOwner(localUserId),
      this.#maxKnightsForPlayer(localUserId),
    );
    this.#syncKnightArmyUi();
    this.#syncResourcesUi();
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
      return 'Market can only be built once.';
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
      return 'No resource data.';
    }
    if (!canAfford(resources, getNumericCost(toolKey))) {
      return 'Not enough resources.';
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
      return 'Cannot build outside the world.';
    }

    const blockingCell = this.#getBlockingCellInArea({ x, y, tileData });
    if (blockingCell) {
      if (isTreeSpriteType(blockingCell.spriteType)) {
        return 'Cannot place a building over a tree. Clear the spot first.';
      }
      return 'Cannot place a building on an occupied tile.';
    }

    if (
      tileData.type !== 'knight' &&
      this.#knightSystem.hasKnightInFootprint(x, y, tileData.width, tileData.height)
    ) {
      return 'Cannot place a building on a knight.';
    }

    if (!this.#hasOwnedCellInRadius({ x, y, tileData, radiusCells: MAX_BUILD_DISTANCE_CELLS })) {
      return 'Too far from your home: max 2 tiles.';
    }

    if (
      this.#isHomeBuildingType(tileData.type)
      && !this.#hasOwnedHomeInRadius({ x, y, tileData, radiusCells: HOUSE_NEIGHBOR_RADIUS_CELLS })
    ) {
      return 'A nearby house (within 3 tiles) is required for this house.';
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
        if (cell && !isForestFloorDecalSpriteType(cell.spriteType)) {
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
        entity: createBuildingHp(),
      });
    }
  }

  #spawnTestKnightsIfEnabled() {
    if (!TEST_KNIGHTS_ENABLED) {
      return;
    }
    const yellowCastle = this.localPlayer.castleStart;
    this.#knightSystem.spawnTestKnightsNearAnchor(
      yellowCastle,
      TEST_KNIGHT_SPAWNS_NEAR_YELLOW_CASTLE
    );
  }

  #processProgressJobs() {
    const now = performance.now();
    const stageMs = getMarketConstructionStageDurationMs();
    const queue = this.#progressJobs;
    this.#progressJobs = [];

    for (const job of queue) {
      if (now < job.nextAt) {
        this.#progressJobs.push(job);
        continue;
      }

      if (job.kind === 'market') {
        if (job.step === 0) {
          this.#replaceTileAt(job.x, job.y, 'marketStage2');
          job.step = 1;
          job.nextAt = now + stageMs;
          this.#progressJobs.push(job);
        } else {
          this.#replaceTileAt(job.x, job.y, 'market');
        }
        continue;
      }

      if (job.kind === 'houseFarmBuild') {
        if (job.step === 0) {
          this.#replaceTileAt(job.x, job.y, 'houseFarmStage2');
          job.step = 1;
          job.nextAt = now + stageMs;
          this.#progressJobs.push(job);
        } else {
          this.#replaceTileAt(job.x, job.y, 'houseFarm');
          this.#autoHarvestRipeWheatAroundHouseFarm(job.x, job.y);
        }
        continue;
      }

      if (job.kind === 'barnBuild') {
        const stage2Key = job.variant === 'houseBarn' ? 'houseBarnStage2' : 'houseBarnSideStage2';
        const finalKey = job.variant;
        if (job.step === 0) {
          this.#replaceTileAt(job.x, job.y, stage2Key);
          job.step = 1;
          job.nextAt = now + stageMs;
          this.#progressJobs.push(job);
        } else {
          this.#replaceTileAt(job.x, job.y, finalKey);
        }
        continue;
      }

      if (job.kind === 'residentialHouseBuild') {
        const stage2Key = residentialHouseStageKey(job.variant, 2);
        const finalKey = job.variant;
        if (job.step === 0) {
          this.#replaceTileAt(job.x, job.y, stage2Key);
          job.step = 1;
          job.nextAt = now + stageMs;
          this.#progressJobs.push(job);
        } else {
          this.#replaceTileAt(job.x, job.y, finalKey);
        }
        continue;
      }

      if (job.kind === 'blacksmithBuild') {
        if (job.step === 0) {
          this.#replaceTileAt(job.x, job.y, 'houseBlacksmithStage2');
          job.step = 1;
          job.nextAt = now + stageMs;
          this.#progressJobs.push(job);
        } else {
          this.#replaceTileAt(job.x, job.y, BLACKSMITH_COMPLETED_SPRITE_TYPE);
        }
        continue;
      }

      if (job.kind === 'farmHouseHarvestWait') {
        const cell = this.stateManager.getState().get(`${job.x}:${job.y}`);
        const ownerId = cell?.ownerUserId;
        if (
          cell?.spriteType === 'farmStage4' &&
          ownerId &&
          this.#hasCompletedHouseFarmAdjacentToFarmCell(job.x, job.y, ownerId)
        ) {
          this.#harvestFarmCell(job.x, job.y);
        }
        continue;
      }

      if (job.kind === 'farm') {
        if (this.#advanceFarmGrowthJob(job, now)) {
          this.#progressJobs.push(job);
        }
        continue;
      }
    }
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
    this.stateManager.setCell({
      x,
      y,
      tileData,
      ownerUserId,
      entity: createBuildingHp(),
    });
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
  #registerHouseFarmConstruction(x, y) {
    this.#progressJobs.push({
      kind: 'houseFarmBuild',
      x,
      y,
      step: 0,
      nextAt: performance.now() + getMarketConstructionStageDurationMs(),
    });
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {'houseBarn' | 'houseBarnSide'} variant
   */
  #registerBarnConstruction(x, y, variant) {
    this.#progressJobs.push({
      kind: 'barnBuild',
      x,
      y,
      step: 0,
      variant,
      nextAt: performance.now() + getMarketConstructionStageDurationMs(),
    });
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {'house' | 'houseSide' | 'houseDouble'} variant
   */
  #registerResidentialHouseConstruction(x, y, variant) {
    this.#progressJobs.push({
      kind: 'residentialHouseBuild',
      x,
      y,
      step: 0,
      variant,
      nextAt: performance.now() + getMarketConstructionStageDurationMs(),
    });
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  #registerBlacksmithConstruction(x, y) {
    this.#progressJobs.push({
      kind: 'blacksmithBuild',
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
   * Отложенный авто-сбор домом фермера после `farmStage4` (см. `FARM_RIPE_BEFORE_AUTO_HARVEST_MS`).
   *
   * @param {number} fx
   * @param {number} fy
   */
  #enqueueDelayedHouseFarmAutoHarvest(fx, fy) {
    for (const j of this.#progressJobs) {
      if (j.kind === 'farmHouseHarvestWait' && j.x === fx && j.y === fy) {
        return;
      }
    }
    this.#progressJobs.push({
      kind: 'farmHouseHarvestWait',
      x: fx,
      y: fy,
      nextAt: performance.now() + FARM_RIPE_BEFORE_AUTO_HARVEST_MS,
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
      const grown = this.stateManager.getState().get(`${job.x}:${job.y}`);
      const ownerId = grown?.ownerUserId;
      if (
        ownerId &&
        this.#hasCompletedHouseFarmAdjacentToFarmCell(job.x, job.y, ownerId)
      ) {
        this.#enqueueDelayedHouseFarmAutoHarvest(job.x, job.y);
      }
      return false;
    }

    job.nextAt = now + FARM_GROWTH_STAGE_MS;
    return true;
  }

  /**
   * Готовый дом фермера рядом с клеткой поля (Чебышёв ≤ 1), тот же владелец.
   *
   * @param {number} farmPx
   * @param {number} farmPy
   * @param {string} ownerUserId
   */
  #hasCompletedHouseFarmAdjacentToFarmCell(farmPx, farmPy, ownerUserId) {
    const ftx = farmPx / TILE_SIZE;
    const fty = farmPy / TILE_SIZE;
    const state = this.stateManager.getState();

    for (let dtx = -1; dtx <= 1; dtx++) {
      for (let dty = -1; dty <= 1; dty++) {
        if (dtx === 0 && dty === 0) {
          continue;
        }
        const hx = (ftx + dtx) * TILE_SIZE;
        const hy = (fty + dty) * TILE_SIZE;
        const cell = state.get(`${hx}:${hy}`);
        if (cell?.spriteType === 'houseFarm' && cell.ownerUserId === ownerUserId) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Созревшая ферма вокруг готового дома фермера (радиус 1 клетка).
   *
   * @param {number} housePx
   * @param {number} housePy
   */
  #autoHarvestRipeWheatAroundHouseFarm(housePx, housePy) {
    const cell = this.stateManager.getState().get(`${housePx}:${housePy}`);
    const ownerId = cell?.ownerUserId;
    if (!ownerId) {
      return;
    }
    const htx = housePx / TILE_SIZE;
    const hty = housePy / TILE_SIZE;

    for (let dtx = -1; dtx <= 1; dtx++) {
      for (let dty = -1; dty <= 1; dty++) {
        if (dtx === 0 && dty === 0) {
          continue;
        }
        const fx = (htx + dtx) * TILE_SIZE;
        const fy = (hty + dty) * TILE_SIZE;
        const fc = this.stateManager.getState().get(`${fx}:${fy}`);
        if (fc?.spriteType === 'farmStage4' && fc.ownerUserId === ownerId) {
          this.#enqueueDelayedHouseFarmAutoHarvest(fx, fy);
        }
      }
    }
  }

  /**
   * Сбор урожая с созревшего поля (ручной или авто домом фермера после паузы `FARM_RIPE_BEFORE_AUTO_HARVEST_MS`).
   *
   * @param {number} tx
   * @param {number} ty
   * @returns {boolean}
   */
  #harvestFarmCell(tx, ty) {
    const cell = this.stateManager.getState().get(`${tx}:${ty}`);
    if (!cell?.isRenderable || cell.spriteType !== 'farmStage4') {
      return false;
    }

    this.#progressJobs = this.#progressJobs.filter(
      (j) => !(j.kind === 'farmHouseHarvestWait' && j.x === tx && j.y === ty),
    );

    const ownerUserId = cell.ownerUserId;
    const resources = ownerUserId ? this.#playerResources.get(ownerUserId) : null;
    if (resources) {
      resources.wheat += WHEAT_PER_FARM_HARVEST;
      if (ownerUserId === this.localPlayer.userId) {
        this.ui.setResources(resources);
      }
    }

    this.#replaceTileAt(tx, ty, 'farmStage1');
    this.#registerFarmGrowth(tx, ty);
    return true;
  }

  /**
   * Клик по замку или кузнице: прокачка рыцарей.
   *
   * @param {number} tx
   * @param {number} ty
   * @returns {boolean}
   */
  #tryOpenKnightUpgrade(tx, ty) {
    const cell = this.stateManager.getState().get(`${tx}:${ty}`);
    if (!cell) {
      return false;
    }

    if (BLACKSMITH_CONSTRUCTION_SPRITE_TYPES.includes(cell.spriteType)) {
      this.ui.showToast('Blacksmith is still under construction.');
      return true;
    }

    const isCastle = cell.spriteType === 'castle';
    const isBlacksmith = cell.spriteType === BLACKSMITH_COMPLETED_SPRITE_TYPE;
    if (!isCastle && !isBlacksmith) {
      return false;
    }

    if (cell.ownerUserId !== this.localPlayer.userId) {
      this.ui.showToast(isCastle ? 'This is not your castle.' : 'This is not your blacksmith.');
      return true;
    }

    if (this.#countBlacksmithsForPlayer(this.localPlayer.userId) < 1) {
      this.ui.showToast('A blacksmith is required to upgrade knights.');
      return true;
    }

    const userId = this.localPlayer.userId;
    this.ui.openKnightUpgrade({
      getViewState: () => {
        const up = this.#getKnightUpgrades(userId);
        const resources = this.#playerResources.get(userId);
        const blacksmithCount = this.#countBlacksmithsForPlayer(userId);
        return {
          healthLevel: up.healthLevel,
          attackLevel: up.attackLevel,
          maxLevel: maxKnightUpgradeLevelForBlacksmiths(blacksmithCount),
          blacksmithCount,
          resources: resources ? { ...resources } : { wheat: 0, wood: 0, gold: 0 },
        };
      },
      onUpgrade: (kind) => this.#upgradeKnightArmy(userId, kind),
    });
    return true;
  }

  /**
   * @param {string} userId
   * @param {'health' | 'attack'} kind
   * @returns {{ ok: boolean; message?: string }}
   */
  #upgradeKnightArmy(userId, kind) {
    const up = this.#getKnightUpgrades(userId);
    const blacksmithCount = this.#countBlacksmithsForPlayer(userId);
    const maxLevel = maxKnightUpgradeLevelForBlacksmiths(blacksmithCount);
    const current = kind === 'health' ? up.healthLevel : up.attackLevel;

    if (current >= maxLevel) {
      return {
        ok: false,
        message: `Max for ${blacksmithCount} blacksmiths: ${maxLevel} levels.`,
      };
    }

    const nextLevel = current + 1;
    const resources = this.#playerResources.get(userId);
    if (!resources) {
      return { ok: false, message: 'No resource data.' };
    }

    const cost = getKnightUpgradeCost(kind, nextLevel);
    if (!canAfford(resources, cost)) {
      return { ok: false, message: 'Not enough resources.' };
    }

    subtractResources(resources, cost);
    if (kind === 'health') {
      up.healthLevel = nextLevel;
    } else {
      up.attackLevel = nextLevel;
    }

    this.#knightSystem.applyArmyUpgradesToOwner(userId, up.healthLevel, up.attackLevel);

    if (userId === this.localPlayer.userId) {
      this.ui.setResources(resources);
      this.#syncKnightArmyUi();
    }

    return { ok: true };
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
      this.ui.showToast('Market is still under construction.');
      return true;
    }

    if (cell.spriteType === 'houseFarmStage1' || cell.spriteType === 'houseFarmStage2') {
      this.ui.showToast('Farmhouse is still under construction.');
      return true;
    }

    if (BARN_UNDER_CONSTRUCTION_SPRITES.has(cell.spriteType)) {
      this.ui.showToast('Barn is still under construction.');
      return true;
    }

    if (RESIDENTIAL_HOUSE_UNDER_CONSTRUCTION_SPRITES.has(cell.spriteType)) {
      this.ui.showToast('House is still under construction.');
      return true;
    }

    if (BLACKSMITH_CONSTRUCTION_SPRITE_TYPES.includes(cell.spriteType)) {
      this.ui.showToast('Blacksmith is still under construction.');
      return true;
    }

    if (cell.spriteType !== 'market') {
      return false;
    }

    if (cell.ownerUserId !== this.localPlayer.userId) {
      this.ui.showToast('This is not your market.');
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
      return { ok: false, message: 'Enter an amount greater than zero.' };
    }

    const resources = this.#playerResources.get(this.localPlayer.userId);
    if (!resources) {
      return { ok: false, message: 'No resource data.' };
    }

    switch (kind) {
      case 'wheatToGold': {
        const batches = Math.floor(q / SHOP_WHEAT_PER_ONE_GOLD);
        if (batches < 1) {
          return { ok: false, message: `You need at least ${SHOP_WHEAT_PER_ONE_GOLD} wheat.` };
        }
        const cost = batches * SHOP_WHEAT_PER_ONE_GOLD;
        if (resources.wheat < cost) {
          return { ok: false, message: 'Not enough wheat.' };
        }
        resources.wheat -= cost;
        resources.gold += batches;
        break;
      }
      case 'woodToGold': {
        const batches = Math.floor(q / SHOP_WOOD_PER_ONE_GOLD);
        if (batches < 1) {
          return { ok: false, message: `You need at least ${SHOP_WOOD_PER_ONE_GOLD} wood.` };
        }
        const cost = batches * SHOP_WOOD_PER_ONE_GOLD;
        if (resources.wood < cost) {
          return { ok: false, message: 'Not enough wood.' };
        }
        resources.wood -= cost;
        resources.gold += batches;
        break;
      }
      case 'goldToWood': {
        if (resources.gold < q) {
          return { ok: false, message: 'Not enough gold.' };
        }
        resources.gold -= q;
        resources.wood += q * SHOP_WOOD_PER_SPENT_GOLD;
        break;
      }
      case 'goldToWheat': {
        if (resources.gold < q) {
          return { ok: false, message: 'Not enough gold.' };
        }
        resources.gold -= q;
        resources.wheat += q * SHOP_WHEAT_PER_SPENT_GOLD;
        break;
      }
      default:
        return { ok: false, message: 'Unknown exchange type.' };
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
      this.ui.showToast('This is not your farm.');
      return true;
    }

    this.#harvestFarmCell(tx, ty);
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
