/**
 * Серверная авторитетная симуляция партии (headless, без рендера/UI/controls).
 *
 * Переиспользует «листовые» модули клиента как есть (они уже принимают явные
 * аргументы и owner-id, без браузера): StateManager, KnightSystem, TreesGenerator,
 * forest-regrowth, экономика, константы. Оркестрация (валидация/стройка/экономика)
 * портирована из client/game/game.js, но multiplayer-aware: вместо `this.localPlayer`
 * — параметр `actingPlayerId`, вместо `this.ui.*` — коды результата для intent.
 *
 * Тех-долг: часть геометрии/прогресса дублирует game.js — позже вынести в общий
 * модуль и переиспользовать на обеих сторонах.
 */

import { tiles } from '../../client/constants/tiles.js';
import {
  BARN_TOOL_KEY,
  BLACKSMITH_TOOL_KEY,
  HOUSE_TOOL_KEY,
  KNIGHT_TOOL_KEY,
  canAfford,
  getNumericCost,
  getPlacementCostEntry,
  subtractResources,
} from '../../client/constants/economy.js';
import {
  KNIGHT_SPRITE_HEIGHT,
  KNIGHT_SPRITE_WIDTH,
} from '../../client/constants/knight-atlas.js';
import {
  FARM_GROWTH_STAGE_MS,
  FARM_GROWTH_STAGES,
  FARM_RIPE_BEFORE_AUTO_HARVEST_MS,
  getMarketConstructionStageDurationMs,
  WHEAT_PER_FARM_HARVEST,
} from '../../client/constants/buildings-progress.js';
import {
  SHOP_WHEAT_PER_ONE_GOLD,
  SHOP_WHEAT_PER_SPENT_GOLD,
  SHOP_WOOD_PER_ONE_GOLD,
  SHOP_WOOD_PER_SPENT_GOLD,
} from '../../client/constants/shop-exchange.js';
import {
  BLACKSMITH_COMPLETED_SPRITE_TYPE,
  getKnightUpgradeCost,
  maxKnightUpgradeLevelForBlacksmiths,
} from '../../client/constants/knight-upgrades.js';
import { BUILDING_REGEN_HP_PER_SECOND } from '../../client/constants/structure-hp.js';
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
} from '../../client/constants/resources.js';
import { TILE_SIZE } from '../../client/constants/sizes.js';
import { TREE_REGROW_INTERVAL_MS } from '../../client/constants/forest-regrowth.js';
import { WORLD_HEIGHT_PX, WORLD_WIDTH_PX } from '../../client/constants/world.js';
import { Random } from '../../client/common/random.js';
import {
  tryMatureOneSapling,
  tryMatureOneTreeToBig,
  tryRegrowOneTree,
} from '../../client/game/forest-regrowth.js';
import {
  isForestFloorDecalSpriteType,
  isTreeSpriteType,
} from '../../client/common/grid-path.js';
import { createBuildingHp } from '../../client/game/entities/building-hp.js';
import { TreesGenerator } from '../../client/game/generators/trees-generator.js';
import { KnightSystem } from '../../client/game/knights/knight-system.js';
import { StateManager } from '../../client/engine/state/state-manager.js';

const MAX_BUILD_DISTANCE_CELLS = 2;
const HOUSE_NEIGHBOR_RADIUS_CELLS = 3;

const BARN_CAPACITY_SPRITE_TYPES = new Set(['houseBarn', 'houseBarnSide']);
const RESIDENTIAL_HOUSE_VARIANTS = ['house', 'houseSide', 'houseDouble'];
const RESIDENTIAL_HOUSE_COMPLETED_SPRITES = new Set(RESIDENTIAL_HOUSE_COMPLETED_TYPES);
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

export class WorldSim {
  /**
   * @param {{ seed: number, slots: import('../constants/slots.js').PlayerSlot[] }} opts
   */
  constructor({ seed, slots }) {
    this.seed = seed >>> 0;
    this.slots = slots;
    /** userId активных игроков. */
    this.playerIds = slots.map((s) => s.userId);

    this.stateManager = new StateManager();
    this.knightSystem = new KnightSystem({
      applyChopHit: (anchorTx, anchorTy, knightOwnerId, damage) =>
        this.#applyChopHit(anchorTx, anchorTy, knightOwnerId, damage),
    });

    /** @type {Map<string, import('../../client/constants/resources.js').PlayerResources>} */
    this.playerResources = new Map();
    /** @type {Map<string, { healthLevel: number; attackLevel: number }>} */
    this.playerKnightUpgrades = new Map();

    /** @type {any[]} таймеры стройки/роста (см. game.js #progressJobs). */
    this.progressJobs = [];
    this.treeRegrowAccumMs = 0;

    /** Версия карты: ++ при любой мутации клеток (для дельты снапшота). */
    this.stateVersion = 1;
    /** Слоты выбывших с прошлого тика (разрушен замок / выход). */
    this.pendingEliminations = [];
    /** Жив ли слот. */
    this.aliveSlots = new Map(slots.map((s) => [s.slot, true]));

    this.#resetPlayerResources();
    this.#generateWorld();
    this.#placeInitialCastles();
    this.#enforceStorageCapsAllPlayers();
  }

  #bump() {
    this.stateVersion++;
  }

  getWorldInfo() {
    return { tiles: 64, tileSize: TILE_SIZE, width: WORLD_WIDTH_PX, height: WORLD_HEIGHT_PX };
  }

  #resetPlayerResources() {
    for (const slot of this.slots) {
      this.playerResources.set(slot.userId, cloneStartingResources());
      this.playerKnightUpgrades.set(slot.userId, { healthLevel: 0, attackLevel: 0 });
    }
  }

  #generateWorld() {
    // Фиксированный мир 64×64 (без вьюпорт-полей, как на клиенте).
    TreesGenerator.generateTrees(this.stateManager, {
      from: { x: 0, y: 0 },
      to: { x: WORLD_WIDTH_PX - TILE_SIZE, y: WORLD_HEIGHT_PX - TILE_SIZE },
      knightOccupiedTileKeys: new Set(),
    });
    this.#bump();
  }

  #placeInitialCastles() {
    for (const slot of this.slots) {
      this.stateManager.setCell({
        x: slot.castleStart.x,
        y: slot.castleStart.y,
        tileData: tiles.castle,
        ownerUserId: slot.userId,
        entity: createBuildingHp(),
      });
    }
    this.#bump();
  }

  // ── Тик ───────────────────────────────────────────────────────────────────

  /** @param {number} timeStep мс */
  tick(timeStep) {
    this.treeRegrowAccumMs += timeStep;
    let regrew = false;
    while (this.treeRegrowAccumMs >= TREE_REGROW_INTERVAL_MS) {
      this.treeRegrowAccumMs -= TREE_REGROW_INTERVAL_MS;
      const knightKeys = this.knightSystem.getOccupiedTileKeys();
      tryMatureOneSapling(this.stateManager, knightKeys);
      tryMatureOneTreeToBig(this.stateManager, knightKeys);
      tryRegrowOneTree(this.stateManager, WORLD_WIDTH_PX, WORLD_HEIGHT_PX, knightKeys);
      regrew = true;
    }
    if (regrew) {
      this.#bump();
    }

    this.#processProgressJobs();
    this.#regenerateBuildingHp(timeStep);
    this.knightSystem.update(timeStep, this.stateManager, WORLD_WIDTH_PX, WORLD_HEIGHT_PX);
    this.#enforceStorageCapsAllPlayers();
  }

  /** @param {number} dtMs */
  #regenerateBuildingHp(dtMs) {
    const state = this.stateManager.getState();
    const seen = new Set();
    const rate = BUILDING_REGEN_HP_PER_SECOND / 1000;
    for (const [, cell] of state.entries()) {
      const ent = cell.entity;
      if (!ent?.regenerates || typeof ent.hp !== 'number' || seen.has(ent)) {
        continue;
      }
      seen.add(ent);
      if (ent.hp < ent.maxHp) {
        ent.hp = Math.min(ent.maxHp, ent.hp + rate * dtMs);
      }
    }
  }

  // ── Намерения игроков ──────────────────────────────────────────────────────

  /**
   * @param {number} slot
   * @param {{ type: string, payload: any }} intent
   * @returns {{ ok: boolean, error?: string }}
   */
  applyIntent(slot, intent) {
    if (!this.aliveSlots.get(slot)) {
      return { ok: false, error: 'You are eliminated.' };
    }
    const def = this.slots.find((s) => s.slot === slot);
    if (!def) {
      return { ok: false, error: 'Unknown slot.' };
    }
    const playerId = def.userId;
    const p = intent?.payload ?? {};

    switch (intent?.type) {
      case 'placeBuilding':
        return this.#intentPlaceBuilding(playerId, p);
      case 'trainKnight':
        return this.#intentTrainKnight(playerId, p);
      case 'moveOrder':
        return this.#intentMoveOrder(playerId, p);
      case 'shopExchange':
        return this.#shopExchange(playerId, p.kind, p.qty);
      case 'upgradeArmy':
        return this.#upgradeKnightArmy(playerId, p.kind);
      case 'harvestFarm':
        return this.#intentHarvestFarm(playerId, p);
      default:
        return { ok: false, error: 'Unknown intent.' };
    }
  }

  /**
   * @param {string} playerId
   * @param {{ toolKey: string, tx: number, ty: number }} p
   */
  #intentPlaceBuilding(playerId, p) {
    const { toolKey, tx, ty } = p;

    /** @type {'houseBarn' | 'houseBarnSide' | null} */
    let barnVariant = null;
    /** @type {'house' | 'houseSide' | 'houseDouble' | null} */
    let residentialVariant = null;
    let placementTileKey;
    if (toolKey === 'market') {
      placementTileKey = 'marketStage1';
    } else if (toolKey === 'houseFarm') {
      placementTileKey = 'houseFarmStage1';
    } else if (toolKey === BARN_TOOL_KEY) {
      barnVariant = Random.getRandomFromRange(0, 1) === 0 ? 'houseBarn' : 'houseBarnSide';
      placementTileKey = barnVariant === 'houseBarn' ? 'houseBarnStage1' : 'houseBarnSideStage1';
    } else if (toolKey === HOUSE_TOOL_KEY) {
      residentialVariant =
        RESIDENTIAL_HOUSE_VARIANTS[Random.getRandomFromRange(0, RESIDENTIAL_HOUSE_VARIANTS.length - 1)];
      placementTileKey = residentialHouseStageKey(residentialVariant, 1);
    } else if (toolKey === BLACKSMITH_TOOL_KEY) {
      placementTileKey = 'houseBlacksmithStage1';
    } else {
      placementTileKey = toolKey;
    }
    const tileData = tiles[placementTileKey];
    if (!tileData) {
      return { ok: false, error: 'Unknown building.' };
    }

    const validationError = this.#validatePlacement(playerId, { x: tx, y: ty, tileData });
    if (validationError) {
      return { ok: false, error: validationError };
    }
    const uniqueError = this.#tryUniquePlacementRule(playerId, toolKey);
    if (uniqueError) {
      return { ok: false, error: uniqueError };
    }
    const affordError = this.#tryAffordPlacement(playerId, toolKey);
    if (affordError) {
      return { ok: false, error: affordError };
    }

    this.#payForPlacement(playerId, toolKey);
    this.stateManager.setCell({
      x: tx,
      y: ty,
      tileData,
      ownerUserId: playerId,
      entity: createBuildingHp(),
    });
    if (toolKey === 'market') {
      this.#registerMarketConstruction(tx, ty);
    } else if (toolKey === 'houseFarm') {
      this.#registerHouseFarmConstruction(tx, ty);
    } else if (toolKey === BARN_TOOL_KEY && barnVariant) {
      this.#registerBarnConstruction(tx, ty, barnVariant);
    } else if (toolKey === HOUSE_TOOL_KEY && residentialVariant) {
      this.#registerResidentialHouseConstruction(tx, ty, residentialVariant);
    } else if (toolKey === BLACKSMITH_TOOL_KEY) {
      this.#registerBlacksmithConstruction(tx, ty);
    } else if (toolKey === 'farmStage1') {
      this.#registerFarmGrowth(tx, ty);
    }
    this.#bump();
    return { ok: true };
  }

  /**
   * @param {string} playerId
   * @param {{ worldPx: number, worldPy: number }} p
   */
  #intentTrainKnight(playerId, p) {
    const tx = Math.floor(p.worldPx / TILE_SIZE) * TILE_SIZE;
    const ty = Math.floor(p.worldPy / TILE_SIZE) * TILE_SIZE;

    const validationError = this.#validatePlacement(playerId, {
      x: tx,
      y: ty,
      tileData: KNIGHT_SPAWN_FOOTPRINT,
    });
    if (validationError) {
      return { ok: false, error: validationError };
    }
    const capError = this.#tryKnightCapacityForSpawn(playerId);
    if (capError) {
      return { ok: false, error: capError };
    }
    const affordError = this.#tryAffordPlacement(playerId, KNIGHT_TOOL_KEY);
    if (affordError) {
      return { ok: false, error: affordError };
    }

    this.#payForPlacement(playerId, KNIGHT_TOOL_KEY);
    let spawnX = p.worldPx - KNIGHT_SPRITE_WIDTH / 2;
    let spawnY = p.worldPy - KNIGHT_SPRITE_HEIGHT / 2;
    spawnX = Math.max(tx, Math.min(tx + TILE_SIZE - KNIGHT_SPRITE_WIDTH, spawnX));
    spawnY = Math.max(ty, Math.min(ty + TILE_SIZE - KNIGHT_SPRITE_HEIGHT, spawnY));
    const army = this.#getKnightUpgrades(playerId);
    this.knightSystem.spawn({
      x: spawnX,
      y: spawnY,
      ownerUserId: playerId,
      healthLevel: army.healthLevel,
      attackLevel: army.attackLevel,
    });
    return { ok: true };
  }

  /**
   * @param {string} playerId
   * @param {{ wx: number, wy: number, knightIds: number[] }} p
   */
  #intentMoveOrder(playerId, p) {
    const ids = Array.isArray(p.knightIds) ? p.knightIds : [];
    if (ids.length === 0) {
      return { ok: false, error: 'No knights selected.' };
    }
    this.knightSystem.selectByIds(ids, playerId);
    if (p.moveOnly) {
      // ЛКМ-клик: чистое перемещение, без рубки/атаки.
      this.knightSystem.issuePlainMove(
        p.wx,
        p.wy,
        this.stateManager,
        WORLD_WIDTH_PX,
        WORLD_HEIGHT_PX,
        playerId,
        () => {}
      );
    } else {
      // ПКМ: контекстный приказ (атака/рубка/идти).
      this.knightSystem.issueOrder(
        p.wx,
        p.wy,
        this.stateManager,
        WORLD_WIDTH_PX,
        WORLD_HEIGHT_PX,
        playerId,
        () => {}
      );
    }
    return { ok: true };
  }

  /**
   * @param {string} playerId
   * @param {{ tx: number, ty: number }} p
   */
  #intentHarvestFarm(playerId, p) {
    const cell = this.stateManager.getState().get(`${p.tx}:${p.ty}`);
    if (!cell?.isRenderable || cell.spriteType !== 'farmStage4') {
      return { ok: false, error: 'Nothing to harvest.' };
    }
    if (cell.ownerUserId !== playerId) {
      return { ok: false, error: 'This is not your farm.' };
    }
    this.#harvestFarmCell(p.tx, p.ty);
    return { ok: true };
  }

  // ── Урон/рубка (callback из KnightSystem) ───────────────────────────────────

  /**
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
        const resources = this.playerResources.get(knightOwnerId);
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
        }
        this.#placeForestChopFloorDecal(anchorTx, anchorTy, spriteType);
        this.#bump();
      }
      return;
    }

    if (cell.spriteType === 'knight' || !cell.ownerUserId || cell.ownerUserId === knightOwnerId) {
      return;
    }

    ent.hp -= damage;
    ent.lastDamagedAtMs = performance.now();
    if (ent.hp <= 0) {
      const destroyedType = cell.spriteType;
      const destroyedOwner = cell.ownerUserId;
      const tileData = tiles[destroyedType];
      if (tileData) {
        this.#replaceDestroyedBuildingFootprintWithDecals(anchorTx, anchorTy, tileData);
      }
      this.#bump();
      if (destroyedType === 'castle') {
        this.#onCastleDestroyed(destroyedOwner);
      }
    }
  }

  /** Замок разрушен — владелец выбывает (у каждого один замок). */
  #onCastleDestroyed(ownerUserId) {
    const def = this.slots.find((s) => s.userId === ownerUserId);
    if (!def || !this.aliveSlots.get(def.slot)) {
      return;
    }
    this.aliveSlots.set(def.slot, false);
    this.pendingEliminations.push(def.slot);
  }

  /**
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

  // ── Прогресс стройки / фермы (порт game.js) ─────────────────────────────────

  #processProgressJobs() {
    const now = performance.now();
    const stageMs = getMarketConstructionStageDurationMs();
    const queue = this.progressJobs;
    this.progressJobs = [];
    let changed = false;

    for (const job of queue) {
      if (now < job.nextAt) {
        this.progressJobs.push(job);
        continue;
      }
      changed = true;

      if (job.kind === 'market') {
        if (job.step === 0) {
          this.#replaceTileAt(job.x, job.y, 'marketStage2');
          job.step = 1;
          job.nextAt = now + stageMs;
          this.progressJobs.push(job);
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
          this.progressJobs.push(job);
        } else {
          this.#replaceTileAt(job.x, job.y, 'houseFarm');
          this.#autoHarvestRipeWheatAroundHouseFarm(job.x, job.y);
        }
        continue;
      }
      if (job.kind === 'barnBuild') {
        const stage2Key = job.variant === 'houseBarn' ? 'houseBarnStage2' : 'houseBarnSideStage2';
        if (job.step === 0) {
          this.#replaceTileAt(job.x, job.y, stage2Key);
          job.step = 1;
          job.nextAt = now + stageMs;
          this.progressJobs.push(job);
        } else {
          this.#replaceTileAt(job.x, job.y, job.variant);
        }
        continue;
      }
      if (job.kind === 'residentialHouseBuild') {
        const stage2Key = residentialHouseStageKey(job.variant, 2);
        if (job.step === 0) {
          this.#replaceTileAt(job.x, job.y, stage2Key);
          job.step = 1;
          job.nextAt = now + stageMs;
          this.progressJobs.push(job);
        } else {
          this.#replaceTileAt(job.x, job.y, job.variant);
        }
        continue;
      }
      if (job.kind === 'blacksmithBuild') {
        if (job.step === 0) {
          this.#replaceTileAt(job.x, job.y, 'houseBlacksmithStage2');
          job.step = 1;
          job.nextAt = now + stageMs;
          this.progressJobs.push(job);
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
          this.progressJobs.push(job);
        }
        continue;
      }
    }
    if (changed) {
      this.#bump();
    }
  }

  #replaceTileAt(x, y, tileKey) {
    const state = this.stateManager.getState();
    const cell = state.get(`${x}:${y}`);
    if (!cell?.isRenderable) {
      return;
    }
    const ownerUserId = cell.ownerUserId;
    const tileData = tiles[tileKey];
    if (!tileData) {
      return;
    }
    this.stateManager.deleteCell({ x, y });
    this.stateManager.setCell({ x, y, tileData, ownerUserId, entity: createBuildingHp() });
  }

  #registerMarketConstruction(x, y) {
    this.progressJobs.push({ kind: 'market', x, y, step: 0, nextAt: performance.now() + getMarketConstructionStageDurationMs() });
  }
  #registerHouseFarmConstruction(x, y) {
    this.progressJobs.push({ kind: 'houseFarmBuild', x, y, step: 0, nextAt: performance.now() + getMarketConstructionStageDurationMs() });
  }
  #registerBarnConstruction(x, y, variant) {
    this.progressJobs.push({ kind: 'barnBuild', x, y, step: 0, variant, nextAt: performance.now() + getMarketConstructionStageDurationMs() });
  }
  #registerResidentialHouseConstruction(x, y, variant) {
    this.progressJobs.push({ kind: 'residentialHouseBuild', x, y, step: 0, variant, nextAt: performance.now() + getMarketConstructionStageDurationMs() });
  }
  #registerBlacksmithConstruction(x, y) {
    this.progressJobs.push({ kind: 'blacksmithBuild', x, y, step: 0, nextAt: performance.now() + getMarketConstructionStageDurationMs() });
  }
  #registerFarmGrowth(x, y) {
    this.progressJobs.push({ kind: 'farm', x, y, nextAt: performance.now() + FARM_GROWTH_STAGE_MS });
  }

  #enqueueDelayedHouseFarmAutoHarvest(fx, fy) {
    for (const j of this.progressJobs) {
      if (j.kind === 'farmHouseHarvestWait' && j.x === fx && j.y === fy) {
        return;
      }
    }
    this.progressJobs.push({ kind: 'farmHouseHarvestWait', x: fx, y: fy, nextAt: performance.now() + FARM_RIPE_BEFORE_AUTO_HARVEST_MS });
  }

  #advanceFarmGrowthJob(job, now) {
    const state = this.stateManager.getState();
    const cell = state.get(`${job.x}:${job.y}`);
    if (!cell?.isRenderable) {
      return false;
    }
    const idx = FARM_GROWTH_STAGES.indexOf(cell.spriteType);
    if (idx < 0 || idx >= FARM_GROWTH_STAGES.length - 1) {
      return false;
    }
    const nextType = FARM_GROWTH_STAGES[idx + 1];
    this.#replaceTileAt(job.x, job.y, nextType);
    if (nextType === 'farmStage4') {
      const grown = this.stateManager.getState().get(`${job.x}:${job.y}`);
      const ownerId = grown?.ownerUserId;
      if (ownerId && this.#hasCompletedHouseFarmAdjacentToFarmCell(job.x, job.y, ownerId)) {
        this.#enqueueDelayedHouseFarmAutoHarvest(job.x, job.y);
      }
      return false;
    }
    job.nextAt = now + FARM_GROWTH_STAGE_MS;
    return true;
  }

  #hasCompletedHouseFarmAdjacentToFarmCell(farmPx, farmPy, ownerUserId) {
    const ftx = farmPx / TILE_SIZE;
    const fty = farmPy / TILE_SIZE;
    const state = this.stateManager.getState();
    for (let dtx = -1; dtx <= 1; dtx++) {
      for (let dty = -1; dty <= 1; dty++) {
        if (dtx === 0 && dty === 0) {
          continue;
        }
        const cell = state.get(`${(ftx + dtx) * TILE_SIZE}:${(fty + dty) * TILE_SIZE}`);
        if (cell?.spriteType === 'houseFarm' && cell.ownerUserId === ownerUserId) {
          return true;
        }
      }
    }
    return false;
  }

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

  #harvestFarmCell(tx, ty) {
    const cell = this.stateManager.getState().get(`${tx}:${ty}`);
    if (!cell?.isRenderable || cell.spriteType !== 'farmStage4') {
      return false;
    }
    this.progressJobs = this.progressJobs.filter(
      (j) => !(j.kind === 'farmHouseHarvestWait' && j.x === tx && j.y === ty)
    );
    const ownerUserId = cell.ownerUserId;
    const resources = ownerUserId ? this.playerResources.get(ownerUserId) : null;
    if (resources) {
      resources.wheat += WHEAT_PER_FARM_HARVEST;
    }
    this.#replaceTileAt(tx, ty, 'farmStage1');
    this.#registerFarmGrowth(tx, ty);
    this.#bump();
    return true;
  }

  // ── Экономика: магазин / апгрейды / лимиты ──────────────────────────────────

  #getKnightUpgrades(userId) {
    return this.playerKnightUpgrades.get(userId) ?? { healthLevel: 0, attackLevel: 0 };
  }

  #countBlacksmithsForPlayer(userId) {
    let n = 0;
    for (const [, cell] of this.stateManager.getState()) {
      if (cell.ownerUserId === userId && cell.spriteType === BLACKSMITH_COMPLETED_SPRITE_TYPE) {
        n++;
      }
    }
    return n;
  }

  #tryKnightCapacityForSpawn(userId) {
    const max = this.#maxKnightsForPlayer(userId);
    const current = this.knightSystem.countKnightsForOwner(userId);
    if (current >= max) {
      return `Knight limit: ${current}/${max}. Build a house (+${KNIGHT_SLOTS_PER_RESIDENTIAL_HOUSE}).`;
    }
    return null;
  }

  #maxKnightsForPlayer(userId) {
    let houses = 0;
    for (const [, cell] of this.stateManager.getState()) {
      if (cell.ownerUserId === userId && RESIDENTIAL_HOUSE_COMPLETED_SPRITES.has(cell.spriteType)) {
        houses++;
      }
    }
    return BASE_KNIGHT_SLOTS + houses * KNIGHT_SLOTS_PER_RESIDENTIAL_HOUSE;
  }

  #maxStoredWheatWoodForPlayer(userId) {
    let barns = 0;
    for (const [, cell] of this.stateManager.getState()) {
      if (cell.ownerUserId === userId && BARN_CAPACITY_SPRITE_TYPES.has(cell.spriteType)) {
        barns++;
      }
    }
    return BASE_STORAGE_CAP_WHEAT_WOOD + barns * STORAGE_BONUS_PER_BARN_WHEAT_WOOD;
  }

  #enforceStorageCapsAllPlayers() {
    for (const [userId, res] of this.playerResources) {
      const max = this.#maxStoredWheatWoodForPlayer(userId);
      res.wheat = Math.min(res.wheat, max);
      res.wood = Math.min(res.wood, max);
    }
  }

  #tryUniquePlacementRule(userId, toolKey) {
    const entry = getPlacementCostEntry(toolKey);
    if (!entry.uniquePerPlayer) {
      return null;
    }
    if (toolKey === 'market' && this.#playerHasAnyMarket(userId)) {
      return 'Market can only be built once.';
    }
    return null;
  }

  #tryAffordPlacement(userId, toolKey) {
    const resources = this.playerResources.get(userId);
    if (!resources) {
      return 'No resource data.';
    }
    if (!canAfford(resources, getNumericCost(toolKey))) {
      return 'Not enough resources.';
    }
    return null;
  }

  #payForPlacement(userId, toolKey) {
    const resources = this.playerResources.get(userId);
    if (resources) {
      subtractResources(resources, getNumericCost(toolKey));
    }
  }

  #playerHasAnyMarket(userId) {
    const set = new Set(['market', 'marketStage1', 'marketStage2']);
    for (const [, cell] of this.stateManager.getState()) {
      if (cell.isRenderable && cell.ownerUserId === userId && set.has(cell.spriteType)) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param {string} userId
   * @param {'wheatToGold' | 'woodToGold' | 'goldToWood' | 'goldToWheat'} kind
   * @param {number} qty
   */
  #shopExchange(userId, kind, qty) {
    const q = Math.floor(Number(qty));
    if (!Number.isFinite(q) || q <= 0) {
      return { ok: false, error: 'Enter an amount greater than zero.' };
    }
    const resources = this.playerResources.get(userId);
    if (!resources) {
      return { ok: false, error: 'No resource data.' };
    }
    switch (kind) {
      case 'wheatToGold': {
        const batches = Math.floor(q / SHOP_WHEAT_PER_ONE_GOLD);
        if (batches < 1) {
          return { ok: false, error: `You need at least ${SHOP_WHEAT_PER_ONE_GOLD} wheat.` };
        }
        const cost = batches * SHOP_WHEAT_PER_ONE_GOLD;
        if (resources.wheat < cost) {
          return { ok: false, error: 'Not enough wheat.' };
        }
        resources.wheat -= cost;
        resources.gold += batches;
        break;
      }
      case 'woodToGold': {
        const batches = Math.floor(q / SHOP_WOOD_PER_ONE_GOLD);
        if (batches < 1) {
          return { ok: false, error: `You need at least ${SHOP_WOOD_PER_ONE_GOLD} wood.` };
        }
        const cost = batches * SHOP_WOOD_PER_ONE_GOLD;
        if (resources.wood < cost) {
          return { ok: false, error: 'Not enough wood.' };
        }
        resources.wood -= cost;
        resources.gold += batches;
        break;
      }
      case 'goldToWood': {
        if (resources.gold < q) {
          return { ok: false, error: 'Not enough gold.' };
        }
        resources.gold -= q;
        resources.wood += q * SHOP_WOOD_PER_SPENT_GOLD;
        break;
      }
      case 'goldToWheat': {
        if (resources.gold < q) {
          return { ok: false, error: 'Not enough gold.' };
        }
        resources.gold -= q;
        resources.wheat += q * SHOP_WHEAT_PER_SPENT_GOLD;
        break;
      }
      default:
        return { ok: false, error: 'Unknown exchange type.' };
    }
    this.#enforceStorageCapsAllPlayers();
    return { ok: true };
  }

  /**
   * @param {string} userId
   * @param {'health' | 'attack'} kind
   */
  #upgradeKnightArmy(userId, kind) {
    const up = this.#getKnightUpgrades(userId);
    const blacksmithCount = this.#countBlacksmithsForPlayer(userId);
    const maxLevel = maxKnightUpgradeLevelForBlacksmiths(blacksmithCount);
    if (blacksmithCount < 1) {
      return { ok: false, error: 'A blacksmith is required to upgrade knights.' };
    }
    const current = kind === 'health' ? up.healthLevel : up.attackLevel;
    if (current >= maxLevel) {
      return { ok: false, error: `Max for ${blacksmithCount} blacksmiths: ${maxLevel} levels.` };
    }
    const nextLevel = current + 1;
    const resources = this.playerResources.get(userId);
    if (!resources) {
      return { ok: false, error: 'No resource data.' };
    }
    const cost = getKnightUpgradeCost(kind, nextLevel);
    if (!canAfford(resources, cost)) {
      return { ok: false, error: 'Not enough resources.' };
    }
    subtractResources(resources, cost);
    if (kind === 'health') {
      up.healthLevel = nextLevel;
    } else {
      up.attackLevel = nextLevel;
    }
    this.knightSystem.applyArmyUpgradesToOwner(userId, up.healthLevel, up.attackLevel);
    return { ok: true };
  }

  // ── Валидация размещения (порт game.js, owner-параметризовано) ───────────────

  #validatePlacement(ownerUserId, { x, y, tileData }) {
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
      this.knightSystem.hasKnightInFootprint(x, y, tileData.width, tileData.height)
    ) {
      return 'Cannot place a building on a knight.';
    }
    if (!this.#hasOwnedCellInRadius(ownerUserId, { x, y, tileData, radiusCells: MAX_BUILD_DISTANCE_CELLS })) {
      return 'Too far from your home: max 2 tiles.';
    }
    if (
      this.#isHomeBuildingType(tileData.type) &&
      !this.#hasOwnedHomeInRadius(ownerUserId, { x, y, tileData, radiusCells: HOUSE_NEIGHBOR_RADIUS_CELLS })
    ) {
      return 'A nearby house (within 3 tiles) is required for this house.';
    }
    return null;
  }

  #isInsideWorld({ x, y, tileData }) {
    return x >= 0 && y >= 0 && x <= WORLD_WIDTH_PX - tileData.width && y <= WORLD_HEIGHT_PX - tileData.height;
  }

  #isHomeBuildingType(spriteType) {
    return (
      spriteType === 'castle' ||
      spriteType === 'houseFarm' ||
      spriteType.startsWith('farmStage') ||
      spriteType.startsWith('house')
    );
  }

  #getBlockingCellInArea({ x, y, tileData }) {
    const state = this.stateManager.getState();
    const cellsWide = tileData.width / TILE_SIZE;
    const cellsHigh = tileData.height / TILE_SIZE;
    for (let ix = 0; ix < cellsWide; ix++) {
      for (let iy = 0; iy < cellsHigh; iy++) {
        const cell = state.get(`${x + ix * TILE_SIZE}:${y + iy * TILE_SIZE}`);
        if (cell && !isForestFloorDecalSpriteType(cell.spriteType)) {
          return cell;
        }
      }
    }
    return null;
  }

  #hasOwnedCellInRadius(ownerUserId, { x, y, tileData, radiusCells }) {
    const target = this.#getTileRect({ x, y, tileData });
    for (const [coords, cell] of this.stateManager.getState().entries()) {
      if (cell.ownerUserId !== ownerUserId) {
        continue;
      }
      const [cellX, cellY] = coords.split(':').map(Number);
      if (this.#distanceFromRectToTile({ rect: target, tileX: cellX / TILE_SIZE, tileY: cellY / TILE_SIZE }) <= radiusCells) {
        return true;
      }
    }
    return false;
  }

  #hasOwnedHomeInRadius(ownerUserId, { x, y, tileData, radiusCells }) {
    const target = this.#getTileRect({ x, y, tileData });
    for (const [coords, cell] of this.stateManager.getState().entries()) {
      if (cell.ownerUserId !== ownerUserId || !this.#isHomeBuildingType(cell.spriteType)) {
        continue;
      }
      const [cellX, cellY] = coords.split(':').map(Number);
      if (this.#distanceFromRectToTile({ rect: target, tileX: cellX / TILE_SIZE, tileY: cellY / TILE_SIZE }) <= radiusCells) {
        return true;
      }
    }
    return false;
  }

  #getTileRect({ x, y, tileData }) {
    const minTx = x / TILE_SIZE;
    const minTy = y / TILE_SIZE;
    return {
      minTx,
      minTy,
      maxTx: minTx + tileData.width / TILE_SIZE - 1,
      maxTy: minTy + tileData.height / TILE_SIZE - 1,
    };
  }

  #distanceFromRectToTile({ rect, tileX, tileY }) {
    const dx = tileX < rect.minTx ? rect.minTx - tileX : tileX > rect.maxTx ? tileX - rect.maxTx : 0;
    const dy = tileY < rect.minTy ? rect.minTy - tileY : tileY > rect.maxTy ? tileY - rect.maxTy : 0;
    return Math.max(dx, dy);
  }

  // ── Снапшот для клиентов ────────────────────────────────────────────────────

  /** @returns {number[]} слоты, выбывшие с прошлого вызова. */
  drainEliminations() {
    if (this.pendingEliminations.length === 0) {
      return [];
    }
    const out = this.pendingEliminations;
    this.pendingEliminations = [];
    return out;
  }

  /** @param {number} slot */
  markSlotDead(slot) {
    this.aliveSlots.set(slot, false);
  }

  /**
   * Снимок мира. `cells` включается только при изменении карты (по версии);
   * рыцари и ресурсы — всегда.
   *
   * @param {number} lastSentVersion версия карты, уже доставленная клиентам
   * @returns {{ v: number, cells: any[] | null, knights: any[], players: object }}
   */
  collectSnapshot(lastSentVersion) {
    const includeCells = this.stateVersion !== lastSentVersion;
    const cells = includeCells ? this.#serializeCells() : null;
    return {
      v: this.stateVersion,
      cells,
      // Полную карту шлём редко; пока её нет — точечно обновляем HP повреждённых
      // объектов (рубка/регенерация), чтобы полоски HP менялись в реальном времени.
      hp: cells ? null : this.#serializeDamagedHp(),
      knights: this.knightSystem.getUnitsSnapshot(),
      players: this.#serializePlayers(),
    };
  }

  /** Координаты+HP только повреждённых renderable-клеток (обычно их немного). */
  #serializeDamagedHp() {
    const out = [];
    for (const [key, cell] of this.stateManager.getState().entries()) {
      if (!cell.isRenderable) {
        continue;
      }
      const ent = cell.entity;
      if (ent && typeof ent.hp === 'number' && typeof ent.maxHp === 'number' && ent.hp < ent.maxHp) {
        const [x, y] = key.split(':').map(Number);
        out.push([x, y, Math.round(ent.hp)]);
      }
    }
    return out;
  }

  /** Только renderable-клетки: клиент восстановит отпечаток через tiles[spriteType]. */
  #serializeCells() {
    const out = [];
    for (const [key, cell] of this.stateManager.getState().entries()) {
      if (!cell.isRenderable) {
        continue;
      }
      const [x, y] = key.split(':').map(Number);
      const ent = cell.entity;
      const hp = ent && typeof ent.hp === 'number' ? Math.round(ent.hp) : null;
      const maxHp = ent && typeof ent.maxHp === 'number' ? ent.maxHp : null;
      out.push([x, y, cell.spriteType, cell.ownerUserId ?? null, hp, maxHp]);
    }
    return out;
  }

  #serializePlayers() {
    /** @type {Record<string, object>} */
    const out = {};
    for (const slot of this.slots) {
      const res = this.playerResources.get(slot.userId) ?? { wheat: 0, wood: 0, gold: 0 };
      const up = this.#getKnightUpgrades(slot.userId);
      out[slot.userId] = {
        slot: slot.slot,
        wheat: res.wheat,
        wood: res.wood,
        gold: res.gold,
        healthLevel: up.healthLevel,
        attackLevel: up.attackLevel,
        knights: this.knightSystem.countKnightsForOwner(slot.userId),
        maxKnights: this.#maxKnightsForPlayer(slot.userId),
        maxStore: this.#maxStoredWheatWoodForPlayer(slot.userId),
        blacksmiths: this.#countBlacksmithsForPlayer(slot.userId),
        alive: this.aliveSlots.get(slot.slot) ?? false,
      };
    }
    return out;
  }
}
