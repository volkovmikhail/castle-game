import {
  findPathTiles,
  isTreeSpriteType,
  isWalkableTile,
  neighborStandTiles8ForFootprint,
  neighborStandTiles8ForTree,
  resolveStructureAnchor,
} from '../../common/grid-path.js';
import { drawStructureHpBar } from '../../common/structure-hp-bar.js';
import {
  KNIGHT_CHOP_FRAME_MS,
  KNIGHT_COLLISION_RADIUS,
  KNIGHT_FRAMES_CHOP,
  KNIGHT_FRAMES_RUN,
  KNIGHT_FRAME_IDLE,
  KNIGHT_FRAME_IDLE_ALT,
  KNIGHT_IDLE_ALT_DURATION_MS,
  KNIGHT_IDLE_GAP_MAX_MS,
  KNIGHT_IDLE_GAP_MIN_MS,
  KNIGHT_RUN_FRAME_MS,
  KNIGHT_SPRITE_HEIGHT,
  KNIGHT_SPRITE_WIDTH,
} from '../../constants/knight-atlas.js';
import {
  PLAYER_BUILDING_TRIANGLE_GAP_PX,
  PLAYER_BUILDING_TRIANGLE_HALF_BASE_PX,
  PLAYER_BUILDING_TRIANGLE_HEIGHT_PX,
  PLAYER_INDICATOR_COLOR,
} from '../../constants/player-building-indicator.js';
import { KNIGHT_AUTO_ATTACK_ENEMY_RADIUS_PX } from '../../constants/knight-combat.js';
import { arePlayersEnemies } from '../../constants/players.js';
import {
  knightAttackFromUpgradeLevel,
  knightMaxHpFromUpgradeLevel,
} from '../../constants/knight-upgrades.js';
import { TILE_SIZE } from '../../constants/sizes.js';
import { tiles } from '../../constants/tiles.js';

const MOVE_SPEED_PX_PER_MS = 0.05;
const CHOP_HIT_INTERVAL_MS = 550;
const ARRIVE_EPS_PX = 2.5;
// Микро-сдвиги от коллизий в толпе не считаем "реальным движением".
const STALL_MOVE_EPS_PX = 0.28;
const STALL_IDLE_AFTER_MS = 110;
/** Если в move почти не сдвигается — пересчитать A* к цели. */
const STALL_REPATH_AFTER_MS = 450;
const KNIGHT_STRAIGHT_WALK_SAMPLE_PX = 4;
/**
 * Макс. зазор между хитбоксом рыцаря и тайлом дерева для удара (пиксели).
 * Центр соседнего тайла даёт ~4px зазор до AABB дерева — 3px было мало и рыцари «замирали» перед деревом.
 */
const CHOP_TOUCH_GAP_PX = 1;

/**
 * Минимальное расстояние между двумя осями-выровненными прямоугольниками (0 при касании/пересечении).
 *
 * @param {number} ax
 * @param {number} ay
 * @param {number} aw
 * @param {number} ah
 * @param {number} bx
 * @param {number} by
 * @param {number} bw
 * @param {number} bh
 */
function aabbOuterDistance(ax, ay, aw, ah, bx, by, bw, bh) {
  const dx = Math.max(0, Math.max(bx - (ax + aw), ax - (bx + bw)));
  const dy = Math.max(0, Math.max(by - (ay + ah), ay - (by + bh)));
  return Math.hypot(dx, dy);
}

const KNIGHT_W = KNIGHT_SPRITE_WIDTH;
const KNIGHT_H = KNIGHT_SPRITE_HEIGHT;
const KNIGHT_HALF_W = KNIGHT_W / 2;
const KNIGHT_HALF_H = KNIGHT_H / 2;
// Рамка выделения: на столько пикселей уже по горизонтали с каждой стороны.
const KNIGHT_SELECTION_LR_INSET_PX = 2;

/** @typedef {'idle' | 'move' | 'chop'} KnightMode */

let nextKnightId = 1;

function resetKnightIds() {
  nextKnightId = 1;
}

class KnightUnit {
  /**
   * @param {{
   *   id: number;
   *   ownerUserId: string;
   *   x: number;
   *   y: number;
   *   healthLevel?: number;
   *   attackLevel?: number;
   * }} p
   */
  constructor({ id, ownerUserId, x, y, healthLevel = 0, attackLevel = 0 }) {
    this.id = id;
    this.ownerUserId = ownerUserId;
    this.x = x;
    this.y = y;
    this.healthLevel = healthLevel;
    this.attackLevel = attackLevel;
    this.maxHp = knightMaxHpFromUpgradeLevel(healthLevel);
    this.hp = this.maxHp;
    this.lastDamagedAtMs = 0;
    this.attackDamage = knightAttackFromUpgradeLevel(attackLevel);

    /** @type {KnightMode} */
    this.mode = 'idle';

    /** @type {{ x: number; y: number }[]} */
    this.path = [];

    /** @type {{ x: number; y: number } | null} */
    this.chopTreeTile = null;

    /** @type {number | null} id вражеского рыцаря (цель ближнего боя). */
    this.chopTargetKnightId = null;

    /** Ширина/высота цели удара в px (якорь — chopTreeTile). */
    this.attackFpW = TILE_SIZE;
    this.attackFpH = TILE_SIZE;

    /** Целевой левый верх спрайта после прохождения тайлового пути (пиксели мира). */
    /** @type {{ x: number; y: number } | null} */
    this.pixelGoal = null;

    this.chopCooldownMs = 0;
    this.animMs = 0;

    /** @type {number | null} момент старта цикла «бег»; null — стоим (кадр idle/chop по mode) */
    this.walkAnimStartMs = null;

    /** Зеркалирование спрайта: true — смотрит влево (идёт или рубит слева от цели). */
    this.faceLeft = false;

    /** Позиция в конце предыдущего апдейта (для детекта «бега на месте»). */
    this.lastFrameX = x;
    this.lastFrameY = y;
    /** Накопленное время почти без смещения в режиме move. */
    this.stalledMoveMs = 0;

    /** @type {number | null} начало окна 2-го кадра idle; каждый новый интервал — свой Math.random() для этого рыцаря */
    this.idleNextAltAt = null;
  }

  /** @returns {{ x: number; y: number }} */
  center() {
    return { x: this.x + KNIGHT_HALF_W, y: this.y + KNIGHT_HALF_H };
  }

  /** @returns {{ tx: number; ty: number }} */
  anchorTileOrigin() {
    return {
      tx: Math.floor(this.x / TILE_SIZE) * TILE_SIZE,
      ty: Math.floor(this.y / TILE_SIZE) * TILE_SIZE,
    };
  }
}

export class KnightSystem {
  /** @type {KnightUnit[]} */
  #units = [];

  /** @type {Set<number>} */
  #selectedIds = new Set();

  /** @type {(anchorTx: number, anchorTy: number, knightOwnerId: string, damage: number) => void} */
  #applyChopHit;

  /**
   * @param {{
   *   applyChopHit: (anchorTx: number, anchorTy: number, knightOwnerId: string, damage: number) => void;
   * }} param0
   */
  constructor({ applyChopHit }) {
    this.#applyChopHit = applyChopHit;
  }

  /**
   * Тайлы `${tx}:${ty}`, с которыми пересекается хитбокс хотя бы одного рыцаря (для леса и пр.).
   *
   * @returns {Set<string>}
   */
  getOccupiedTileKeys() {
    const keys = new Set();
    for (const u of this.#units) {
      for (const { tx, ty } of this.#tileOriginsUnderKnight(u.x, u.y)) {
        keys.add(`${tx}:${ty}`);
      }
    }
    return keys;
  }

  /**
   * Есть ли рыцарь на любой клетке отпечатка (левый верх якоря, размеры в px).
   *
   * @param {number} anchorX
   * @param {number} anchorY
   * @param {number} widthPx
   * @param {number} heightPx
   */
  hasKnightInFootprint(anchorX, anchorY, widthPx, heightPx) {
    const occupied = this.getOccupiedTileKeys();
    const cellsWide = widthPx / TILE_SIZE;
    const cellsHigh = heightPx / TILE_SIZE;
    for (let ix = 0; ix < cellsWide; ix++) {
      for (let iy = 0; iy < cellsHigh; iy++) {
        const tx = anchorX + ix * TILE_SIZE;
        const ty = anchorY + iy * TILE_SIZE;
        if (occupied.has(`${tx}:${ty}`)) {
          return true;
        }
      }
    }
    return false;
  }

  clear() {
    this.#units.length = 0;
    this.#selectedIds.clear();
    resetKnightIds();
  }

  /**
   * @param {{
   *   x: number;
   *   y: number;
   *   ownerUserId: string;
   *   healthLevel?: number;
   *   attackLevel?: number;
   * }} p
   * @returns {KnightUnit}
   */
  spawn({ x, y, ownerUserId, healthLevel = 0, attackLevel = 0 }) {
    const unit = new KnightUnit({
      id: nextKnightId++,
      ownerUserId,
      x,
      y,
      healthLevel,
      attackLevel,
    });
    this.#units.push(unit);
    return unit;
  }

  /**
   * Тестовый спавн: смещения от якоря (например `castleStart` жёлтого замка).
   *
   * @param {{ x: number; y: number }} anchor
   * @param {{ ownerUserId: string; offsetX: number; offsetY: number; healthLevel?: number; attackLevel?: number }[]} spawns
   */
  spawnTestKnightsNearAnchor(anchor, spawns) {
    const inset = (TILE_SIZE - KNIGHT_W) / 2;
    for (const s of spawns) {
      this.spawn({
        x: anchor.x + s.offsetX + inset,
        y: anchor.y + s.offsetY + inset,
        ownerUserId: s.ownerUserId,
        healthLevel: s.healthLevel ?? 0,
        attackLevel: s.attackLevel ?? 0,
      });
    }
  }

  /**
   * @param {string} ownerUserId
   * @param {number} healthLevel
   * @param {number} attackLevel
   */
  applyArmyUpgradesToOwner(ownerUserId, healthLevel, attackLevel) {
    const maxHp = knightMaxHpFromUpgradeLevel(healthLevel);
    const attackDamage = knightAttackFromUpgradeLevel(attackLevel);
    for (const u of this.#units) {
      if (u.ownerUserId !== ownerUserId) {
        continue;
      }
      u.healthLevel = healthLevel;
      u.attackLevel = attackLevel;
      u.maxHp = maxHp;
      u.hp = maxHp;
      u.attackDamage = attackDamage;
    }
  }

  /**
   * @param {string} ownerUserId
   * @returns {number}
   */
  countKnightsForOwner(ownerUserId) {
    let n = 0;
    for (const u of this.#units) {
      if (u.ownerUserId === ownerUserId) {
        n++;
      }
    }
    return n;
  }

  /**
   * @param {number} worldPx
   * @param {number} worldPy
   * @param {boolean} shiftKey
   * @param {string} localOwnerId
   * @returns {boolean} true если клик попал по своему рыцарю (выбор обработан)
   */
  trySelectAt(worldPx, worldPy, shiftKey, localOwnerId) {
    for (let i = this.#units.length - 1; i >= 0; i--) {
      const u = this.#units[i];
      if (u.ownerUserId !== localOwnerId) {
        continue;
      }
      if (
        worldPx >= u.x &&
        worldPy >= u.y &&
        worldPx < u.x + KNIGHT_W &&
        worldPy < u.y + KNIGHT_H
      ) {
        if (!shiftKey) {
          this.#selectedIds.clear();
        }
        if (this.#selectedIds.has(u.id)) {
          this.#selectedIds.delete(u.id);
        } else {
          this.#selectedIds.add(u.id);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Снять выделение (клик по пустому месту в режиме управления).
   */
  clearSelection() {
    this.#selectedIds.clear();
  }

  /**
   * Выделить всех рыцарей локального игрока (остальные снимаются).
   *
   * @param {string} localOwnerId
   */
  selectAllKnightsForOwner(localOwnerId) {
    this.#selectedIds.clear();
    for (const u of this.#units) {
      if (u.ownerUserId === localOwnerId) {
        this.#selectedIds.add(u.id);
      }
    }
  }

  /**
   * Выделить всех своих рыцарей, чей хитбокс пересекает прямоугольник в мировых пикселях (min/max по осям).
   *
   * @param {number} wx0
   * @param {number} wy0
   * @param {number} wx1
   * @param {number} wy1
   * @param {string} localOwnerId
   */
  selectUnitsInWorldRect(wx0, wy0, wx1, wy1, localOwnerId) {
    const minX = Math.min(wx0, wx1);
    const minY = Math.min(wy0, wy1);
    const maxX = Math.max(wx0, wx1);
    const maxY = Math.max(wy0, wy1);
    this.#selectedIds.clear();
    const w = KNIGHT_W;
    const h = KNIGHT_H;
    for (const u of this.#units) {
      if (u.ownerUserId !== localOwnerId) {
        continue;
      }
      const overlaps = u.x < maxX && u.x + w > minX && u.y < maxY && u.y + h > minY;
      if (overlaps) {
        this.#selectedIds.add(u.id);
      }
    }
  }

  /**
   * @param {number} worldPx
   * @param {number} worldPy
   * @param {import('../../engine/state/state-manager.js').StateManager} stateManager
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   * @param {string} localOwnerId
   * @param {(msg: string) => void} showToast
   */
  issueOrder(worldPx, worldPy, stateManager, worldWidthPx, worldHeightPx, localOwnerId, showToast) {
    if (this.#selectedIds.size === 0) {
      return;
    }

    const state = stateManager.getState();
    const treeTx = Math.floor(worldPx / TILE_SIZE) * TILE_SIZE;
    const treeTy = Math.floor(worldPy / TILE_SIZE) * TILE_SIZE;
    const treeCell = state.get(`${treeTx}:${treeTy}`);
    const isTree = treeCell && treeCell.isRenderable && isTreeSpriteType(treeCell.spriteType);

    const selected = this.#units.filter((u) => this.#selectedIds.has(u.id) && u.ownerUserId === localOwnerId);
    if (selected.length === 0) {
      return;
    }

    if (isTree) {
      this.#orderChopGroup(selected, { x: treeTx, y: treeTy }, state, worldWidthPx, worldHeightPx, showToast);
      return;
    }

    const enemyKnight = this.#findEnemyKnightAt(worldPx, worldPy, localOwnerId);
    if (enemyKnight) {
      this.#orderAttackKnightGroup(
        selected,
        enemyKnight,
        state,
        worldWidthPx,
        worldHeightPx,
        showToast
      );
      return;
    }

    const structureAnchor = resolveStructureAnchor(treeTx, treeTy, state);
    if (structureAnchor) {
      const anchorCell = state.get(`${structureAnchor.x}:${structureAnchor.y}`);
      const td = anchorCell ? tiles[anchorCell.spriteType] : null;
      if (
        anchorCell &&
        td &&
        !isTreeSpriteType(anchorCell.spriteType) &&
        anchorCell.spriteType !== 'knight' &&
        anchorCell.entity?.hp != null &&
        anchorCell.ownerUserId &&
        anchorCell.ownerUserId !== localOwnerId
      ) {
        const neighbors = neighborStandTiles8ForFootprint(
          structureAnchor.x,
          structureAnchor.y,
          td.width,
          td.height
        ).filter((t) => isWalkableTile(state, t.x, t.y, worldWidthPx, worldHeightPx));
        this.#orderChopGroup(selected, structureAnchor, state, worldWidthPx, worldHeightPx, showToast, {
          footprintW: td.width,
          footprintH: td.height,
          neighborTiles: neighbors,
          cantApproachMsg: 'К зданию не подойти.',
        });
        return;
      }
    }

    const goal = { x: worldPx, y: worldPy };
    let anyPath = false;
    for (const u of selected) {
      const path = findPathTiles(state, u.center(), goal, worldWidthPx, worldHeightPx);
      if (path !== null) {
        u.path = path;
        u.mode = 'move';
        this.#clearMeleeTarget(u);
        u.chopCooldownMs = 0;
        u.walkAnimStartMs = performance.now();
        u.idleNextAltAt = null;
        u.pixelGoal = this.#clampTopLeftToWorld(
          worldPx - KNIGHT_HALF_W,
          worldPy - KNIGHT_HALF_H,
          worldWidthPx,
          worldHeightPx
        );
        anyPath = true;
      }
    }
    if (!anyPath) {
      showToast('Нельзя дойти до этой точки.');
    }
  }

  /**
   * @param {KnightUnit[]} units
   * @param {{ x: number; y: number }} anchorTile якорь цели (левый верх отпечатка)
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   * @param {(msg: string) => void} showToast
   * @param {{ footprintW?: number; footprintH?: number; neighborTiles?: { x: number; y: number }[]; cantApproachMsg?: string }} [opts]
   */
  #orderChopGroup(units, anchorTile, state, worldWidthPx, worldHeightPx, showToast, opts = {}) {
    const footprintW = opts.footprintW ?? TILE_SIZE;
    const footprintH = opts.footprintH ?? TILE_SIZE;
    const cantApproachMsg = opts.cantApproachMsg ?? 'К дереву не подойти.';
    const neighbors =
      opts.neighborTiles ??
      neighborStandTiles8ForTree(anchorTile.x, anchorTile.y).filter((t) =>
        isWalkableTile(state, t.x, t.y, worldWidthPx, worldHeightPx)
      );

    if (neighbors.length === 0) {
      showToast(cantApproachMsg);
      return;
    }

    for (const u of units) {
      const sorted = [...neighbors].sort((a, b) => {
        const da = (a.x + TILE_SIZE / 2 - u.center().x) ** 2 + (a.y + TILE_SIZE / 2 - u.center().y) ** 2;
        const db = (b.x + TILE_SIZE / 2 - u.center().x) ** 2 + (b.y + TILE_SIZE / 2 - u.center().y) ** 2;
        return da - db;
      });

      let picked = null;
      for (const n of sorted) {
        const path = findPathTiles(state, u.center(), { x: n.x, y: n.y }, worldWidthPx, worldHeightPx);
        if (path !== null) {
          picked = { n, path };
          break;
        }
      }

      u.chopTreeTile = { x: anchorTile.x, y: anchorTile.y };
      u.chopTargetKnightId = null;
      u.attackFpW = footprintW;
      u.attackFpH = footprintH;
      u.mode = 'move';
      u.chopCooldownMs = 0;
      u.walkAnimStartMs = performance.now();
      u.idleNextAltAt = null;

      if (picked) {
        u.path = picked.path;
        u.pixelGoal = this.#chopApproachPixelGoalTopLeft(
          anchorTile.x,
          anchorTile.y,
          picked.n.x,
          picked.n.y,
          worldWidthPx,
          worldHeightPx,
          footprintW,
          footprintH
        );
      } else {
        u.path = [];
        u.pixelGoal = null;
      }
    }
  }

  /**
   * @param {KnightUnit[]} units
   * @param {KnightUnit} target
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   * @param {(msg: string) => void} showToast
   */
  #orderAttackKnightGroup(units, target, state, worldWidthPx, worldHeightPx, showToast) {
    for (const u of units) {
      this.#engageEnemyKnight(u, target, state, worldWidthPx, worldHeightPx, showToast);
    }
  }

  /**
   * @param {KnightUnit} u
   * @param {KnightUnit} target
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   * @param {(msg: string) => void} [showToast]
   */
  #engageEnemyKnight(u, target, state, worldWidthPx, worldHeightPx, showToast = () => {}) {
    if (!arePlayersEnemies(u.ownerUserId, target.ownerUserId) || target.hp <= 0) {
      return;
    }
    this.#orderChopGroup(
      [u],
      { x: target.x, y: target.y },
      state,
      worldWidthPx,
      worldHeightPx,
      showToast,
      {
        footprintW: KNIGHT_W,
        footprintH: KNIGHT_H,
        neighborTiles: neighborStandTiles8ForFootprint(target.x, target.y, KNIGHT_W, KNIGHT_H).filter((t) =>
          isWalkableTile(state, t.x, t.y, worldWidthPx, worldHeightPx)
        ),
        cantApproachMsg: 'К рыцарю не подойти.',
      }
    );
    u.chopTreeTile = null;
    u.chopTargetKnightId = target.id;
  }

  /**
   * @param {KnightUnit} u
   * @param {number} radiusPx
   * @returns {KnightUnit | null}
   */
  #findNearestEnemyKnightInRadius(u, radiusPx) {
    if (radiusPx <= 0) {
      return null;
    }
    const ac = u.center();
    const maxDistSq = radiusPx * radiusPx;
    let best = null;
    let bestDistSq = maxDistSq + 1;
    for (const other of this.#units) {
      if (other.id === u.id || !arePlayersEnemies(u.ownerUserId, other.ownerUserId) || other.hp <= 0) {
        continue;
      }
      const oc = other.center();
      const distSq = (oc.x - ac.x) ** 2 + (oc.y - ac.y) ** 2;
      if (distSq <= maxDistSq && distSq < bestDistSq) {
        bestDistSq = distSq;
        best = other;
      }
    }
    return best;
  }

  /**
   * @param {KnightUnit} u
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   */
  #tryAutoEngageNearbyEnemyKnight(u, state, worldWidthPx, worldHeightPx) {
    if (KNIGHT_AUTO_ATTACK_ENEMY_RADIUS_PX <= 0) {
      return;
    }
    if (u.chopTreeTile != null || u.chopTargetKnightId != null) {
      return;
    }
    const enemy = this.#findNearestEnemyKnightInRadius(u, KNIGHT_AUTO_ATTACK_ENEMY_RADIUS_PX);
    if (!enemy) {
      return;
    }
    this.#engageEnemyKnight(u, enemy, state, worldWidthPx, worldHeightPx);
  }

  /**
   * Левый верх спрайта у грани с деревом с выбранной соседней клетки (ближе к удару, чем центр тайла).
   *
   * @param {number} treeTx
   * @param {number} treeTy
   * @param {number} nx
   * @param {number} ny
   * @param {number} worldW
   * @param {number} worldH
   */
  #chopApproachPixelGoalTopLeft(treeTx, treeTy, nx, ny, worldW, worldH, fpW = TILE_SIZE, fpH = TILE_SIZE) {
    const T = TILE_SIZE;
    const K = KNIGHT_W;
    const ox = nx - treeTx;
    const oy = ny - treeTy;
    if (fpW !== TILE_SIZE || fpH !== TILE_SIZE) {
      return this.#clampTopLeftToWorld(nx + (T - K) / 2, ny + (T - KNIGHT_H) / 2, worldW, worldH);
    }
    let x;
    let y;
    if (ox === -T && oy === 0) {
      x = treeTx - K;
      y = treeTy + (T - KNIGHT_H) / 2;
    } else if (ox === T && oy === 0) {
      x = treeTx + T;
      y = treeTy + (T - KNIGHT_H) / 2;
    } else if (ox === 0 && oy === -T) {
      x = treeTx + (T - K) / 2;
      y = treeTy - KNIGHT_H;
    } else if (ox === 0 && oy === T) {
      x = treeTx + (T - K) / 2;
      y = treeTy + T;
    } else if (ox === -T && oy === -T) {
      x = treeTx - K;
      y = treeTy - KNIGHT_H;
    } else if (ox === T && oy === -T) {
      x = treeTx + T - K;
      y = treeTy - K;
    } else if (ox === -T && oy === T) {
      x = treeTx - K;
      y = treeTy + T - KNIGHT_H;
    } else if (ox === T && oy === T) {
      x = treeTx + T - K;
      y = treeTy + T - KNIGHT_H;
    } else {
      x = nx + (T - K) / 2;
      y = ny + (T - K) / 2;
    }
    return this.#clampTopLeftToWorld(x, y, worldW, worldH);
  }

  /**
   * Малый шаг к ближайшей точке на AABB дерева, только по проходимым клеткам.
   *
   * @param {KnightUnit} u
   * @param {{ x: number; y: number }} tree
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @param {number} dtMs
   * @param {number} worldW
   * @param {number} worldH
   */
  #seekTowardChopTree(u, tree, fpW, fpH, state, dtMs, worldW, worldH) {
    const t = tree;
    const cx = u.x + KNIGHT_HALF_W;
    const cy = u.y + KNIGHT_HALF_H;
    const px = Math.max(t.x, Math.min(cx, t.x + fpW));
    const py = Math.max(t.y, Math.min(cy, t.y + fpH));
    let dx = px - cx;
    let dy = py - cy;
    const len = Math.hypot(dx, dy);
    if (len < 0.05) {
      return;
    }
    dx /= len;
    dy /= len;
    const step = MOVE_SPEED_PX_PER_MS * dtMs * 2.25;
    const ncx = cx + dx * step;
    const ncy = cy + dy * step;
    const ntx = this.#clampTopLeftToWorld(ncx - KNIGHT_HALF_W, ncy - KNIGHT_HALF_H, worldW, worldH);
    if (this.#isKnightWalkable(state, ntx.x, ntx.y, worldW, worldH)) {
      u.x = ntx.x;
      u.y = ntx.y;
      if (u.walkAnimStartMs == null) {
        u.walkAnimStartMs = performance.now();
        u.idleNextAltAt = null;
      }
    }
  }

  /**
   * @param {number} dtMs
   * @param {import('../../engine/state/state-manager.js').StateManager} stateManager
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   */
  update(dtMs, stateManager, worldWidthPx, worldHeightPx) {
    const state = stateManager.getState();

    for (const u of this.#units) {
      u.animMs += dtMs;

      this.#tryAutoEngageNearbyEnemyKnight(u, state, worldWidthPx, worldHeightPx);

      if (u.mode === 'chop' && this.#hasMeleeTarget(u)) {
        const rect = this.#getMeleeTargetRect(u, state);
        if (!rect || !this.#isMeleeTargetValid(u, state)) {
          u.mode = 'idle';
          this.#clearMeleeTarget(u);
          u.path = [];
          u.pixelGoal = null;
          u.walkAnimStartMs = null;
          u.idleNextAltAt = null;
          u.faceLeft = false;
          continue;
        }

        if (!this.#isKnightTouchingStructureAabb(u, rect.x, rect.y, rect.w, rect.h)) {
          u.mode = 'move';
          u.path = [];
          u.pixelGoal = null;
          u.walkAnimStartMs = performance.now();
          u.idleNextAltAt = null;
          continue;
        }

        u.chopCooldownMs += dtMs;
        if (u.chopCooldownMs >= CHOP_HIT_INTERVAL_MS) {
          u.chopCooldownMs = 0;
          this.#dealMeleeHit(u, state);
        }

        this.#updateFaceTowardWorldPoint(u, rect.center);
        continue;
      }

      if (u.mode === 'move' && this.#hasMeleeTarget(u)) {
        const rect = this.#getMeleeTargetRect(u, state);
        if (
          rect &&
          this.#isMeleeTargetValid(u, state) &&
          this.#isKnightTouchingStructureAabb(u, rect.x, rect.y, rect.w, rect.h)
        ) {
          u.path = [];
          u.pixelGoal = null;
          u.mode = 'chop';
          u.chopCooldownMs = 0;
          u.walkAnimStartMs = null;
          u.idleNextAltAt = null;
          continue;
        }
      }

      if (!this.#isKnightWalkable(state, u.x, u.y, worldWidthPx, worldHeightPx)) {
        this.#pushKnightOutOfSolids(u, state, worldWidthPx, worldHeightPx);
      }

      if (u.mode === 'move' && u.pixelGoal != null) {
        this.#shortcutPathTowardPixelGoal(u, state, worldWidthPx, worldHeightPx);
      }

      if (u.path.length > 0) {
        const next = u.path[0];
        const targetX = next.x + TILE_SIZE / 2 - KNIGHT_HALF_W;
        const targetY = next.y + TILE_SIZE / 2 - KNIGHT_HALF_H;
        this.#moveToward(u, targetX, targetY, dtMs, state, worldWidthPx, worldHeightPx);

        const dist = Math.hypot(
          u.x + KNIGHT_HALF_W - (next.x + TILE_SIZE / 2),
          u.y + KNIGHT_HALF_H - (next.y + TILE_SIZE / 2)
        );
        if (dist < ARRIVE_EPS_PX) {
          const snapped = this.#clampTopLeftToWorld(targetX, targetY, worldWidthPx, worldHeightPx);
          if (this.#isKnightWalkable(state, snapped.x, snapped.y, worldWidthPx, worldHeightPx)) {
            u.x = snapped.x;
            u.y = snapped.y;
          }
          u.path.shift();
        }
      } else if (u.pixelGoal != null && u.mode === 'move') {
        const g = u.pixelGoal;
        this.#moveToward(u, g.x, g.y, dtMs, state, worldWidthPx, worldHeightPx);
        const dist = Math.hypot(u.x - g.x, u.y - g.y);
        if (dist < ARRIVE_EPS_PX) {
          const snapped = this.#clampTopLeftToWorld(g.x, g.y, worldWidthPx, worldHeightPx);
          if (this.#isKnightWalkable(state, snapped.x, snapped.y, worldWidthPx, worldHeightPx)) {
            u.x = snapped.x;
            u.y = snapped.y;
          }
          u.pixelGoal = null;
        }
      }

      if (u.path.length === 0 && u.mode === 'move' && this.#hasMeleeTarget(u) && !u.pixelGoal) {
        const rect = this.#getMeleeTargetRect(u, state);
        if (
          rect &&
          this.#isMeleeTargetValid(u, state) &&
          this.#isKnightTouchingStructureAabb(u, rect.x, rect.y, rect.w, rect.h)
        ) {
          u.mode = 'chop';
          u.chopCooldownMs = 0;
          u.walkAnimStartMs = null;
          u.idleNextAltAt = null;
        } else if (!rect || !this.#isMeleeTargetValid(u, state)) {
          this.#clearMeleeTarget(u);
          u.mode = 'idle';
          u.walkAnimStartMs = null;
          u.idleNextAltAt = null;
          u.faceLeft = false;
        } else {
          this.#seekTowardChopTree(u, { x: rect.x, y: rect.y }, rect.w, rect.h, state, dtMs, worldWidthPx, worldHeightPx);
        }
        continue;
      }

      if (u.mode === 'move' && u.path.length === 0 && !this.#hasMeleeTarget(u) && !u.pixelGoal) {
        u.mode = 'idle';
        u.walkAnimStartMs = null;
        u.idleNextAltAt = null;
        u.faceLeft = false;
      }
    }

    this.#resolveKnightOverlaps(state, worldWidthPx, worldHeightPx);

    for (const u of this.#units) {
      const moved = Math.hypot(u.x - u.lastFrameX, u.y - u.lastFrameY);

      if (u.mode === 'move') {
        if (moved <= STALL_MOVE_EPS_PX) {
          const stalledBefore = u.stalledMoveMs;
          u.stalledMoveMs += dtMs;
          if (stalledBefore < STALL_REPATH_AFTER_MS && u.stalledMoveMs >= STALL_REPATH_AFTER_MS) {
            this.#tryRepathStuckKnight(u, state, worldWidthPx, worldHeightPx);
          }
          if (u.stalledMoveMs >= STALL_IDLE_AFTER_MS) {
            // Остаёмся в режиме move (чтобы команда не терялась), но анимацию гасим в idle.
            u.walkAnimStartMs = null;
            u.idleNextAltAt = null;
          }
        } else {
          u.stalledMoveMs = 0;
          // Возвращаем бег только при заметном выходе из "затыка",
          // чтобы убрать мерцание run/idle при мелких толчках.
          if (u.walkAnimStartMs == null && moved > STALL_MOVE_EPS_PX * 2.2) {
            u.walkAnimStartMs = performance.now();
            u.idleNextAltAt = null;
          }
        }
      } else {
        u.stalledMoveMs = 0;
      }

      u.lastFrameX = u.x;
      u.lastFrameY = u.y;
    }
  }

  /**
   * Подрезает тайловый A*: если до финальной точки прямая свободна — идём только по ней;
   * иначе убирает лишние изломы, пока виден второй узел пути.
   *
   * @param {KnightUnit} u
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   */
  #shortcutPathTowardPixelGoal(u, state, worldWidthPx, worldHeightPx) {
    const g = u.pixelGoal;
    if (!g) {
      return;
    }
    const ccx = u.x + KNIGHT_HALF_W;
    const ccy = u.y + KNIGHT_HALF_H;
    const gcx = g.x + KNIGHT_HALF_W;
    const gcy = g.y + KNIGHT_HALF_H;

    while (u.path.length >= 2) {
      const p1 = u.path[1];
      const mx = p1.x + TILE_SIZE / 2;
      const my = p1.y + TILE_SIZE / 2;
      if (!this.#hasStraightKnightWalk(state, ccx, ccy, mx, my, worldWidthPx, worldHeightPx)) {
        break;
      }
      u.path.shift();
    }

    if (u.path.length > 0 && this.#hasStraightKnightWalk(state, ccx, ccy, gcx, gcy, worldWidthPx, worldHeightPx)) {
      u.path.length = 0;
    }
  }

  /**
   * Прямая видимость с учётом хитбокса рыцаря (не только центра).
   *
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @param {number} ax центр рыцаря
   * @param {number} ay
   * @param {number} bx
   * @param {number} by
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   */
  #hasStraightKnightWalk(state, ax, ay, bx, by, worldWidthPx, worldHeightPx) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      return this.#isKnightWalkable(
        state,
        ax - KNIGHT_HALF_W,
        ay - KNIGHT_HALF_H,
        worldWidthPx,
        worldHeightPx
      );
    }
    const n = Math.max(1, Math.ceil(len / KNIGHT_STRAIGHT_WALK_SAMPLE_PX));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const cx = ax + dx * t;
      const cy = ay + dy * t;
      if (
        !this.#isKnightWalkable(
          state,
          cx - KNIGHT_HALF_W,
          cy - KNIGHT_HALF_H,
          worldWidthPx,
          worldHeightPx
        )
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   */
  #clampTopLeftToWorld(x, y, worldWidthPx, worldHeightPx) {
    const maxX = worldWidthPx - KNIGHT_W;
    const maxY = worldHeightPx - KNIGHT_H;
    return {
      x: Math.max(0, Math.min(maxX, x)),
      y: Math.max(0, Math.min(maxY, y)),
    };
  }

  /**
   * Все тайлы, с которыми пересекается прямоугольник рыцаря (левый верх — x,y).
   *
   * @param {number} x
   * @param {number} y
   * @returns {{ tx: number; ty: number }[]}
   */
  #tileOriginsUnderKnight(x, y) {
    const w = KNIGHT_W;
    const h = KNIGHT_H;
    const xMax = x + w - 1e-6;
    const yMax = y + h - 1e-6;
    const tx0 = Math.floor(x / TILE_SIZE) * TILE_SIZE;
    const ty0 = Math.floor(y / TILE_SIZE) * TILE_SIZE;
    const tx1 = Math.floor(xMax / TILE_SIZE) * TILE_SIZE;
    const ty1 = Math.floor(yMax / TILE_SIZE) * TILE_SIZE;
    /** @type {{ tx: number; ty: number }[]} */
    const out = [];
    for (let tx = tx0; tx <= tx1; tx += TILE_SIZE) {
      for (let ty = ty0; ty <= ty1; ty += TILE_SIZE) {
        out.push({ tx, ty });
      }
    }
    return out;
  }

  /**
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @param {number} x
   * @param {number} y
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   */
  #isKnightWalkable(state, x, y, worldWidthPx, worldHeightPx) {
    if (x < 0 || y < 0 || x + KNIGHT_W > worldWidthPx || y + KNIGHT_H > worldHeightPx) {
      return false;
    }
    for (const { tx, ty } of this.#tileOriginsUnderKnight(x, y)) {
      if (!isWalkableTile(state, tx, ty, worldWidthPx, worldHeightPx)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Сдвигает рыцаря из пересечения с непроходимыми тайлами (здания, деревья).
   *
   * @param {KnightUnit} u
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   */
  #pushKnightOutOfSolids(u, state, worldWidthPx, worldHeightPx) {
    const maxX = worldWidthPx - KNIGHT_W;
    const maxY = worldHeightPx - KNIGHT_H;

    for (let iter = 0; iter < 16; iter++) {
      if (this.#isKnightWalkable(state, u.x, u.y, worldWidthPx, worldHeightPx)) {
        return;
      }

      const x = u.x;
      const y = u.y;
      const kcx = x + KNIGHT_HALF_W;
      const kcy = y + KNIGHT_HALF_H;
      let pushX = 0;
      let pushY = 0;

      for (const { tx, ty } of this.#tileOriginsUnderKnight(x, y)) {
        if (isWalkableTile(state, tx, ty, worldWidthPx, worldHeightPx)) {
          continue;
        }
        const overlapX = Math.min(x + KNIGHT_W, tx + TILE_SIZE) - Math.max(x, tx);
        const overlapY = Math.min(y + KNIGHT_H, ty + TILE_SIZE) - Math.max(y, ty);
        if (overlapX <= 0 || overlapY <= 0) {
          continue;
        }
        const tcx = tx + TILE_SIZE / 2;
        const tcy = ty + TILE_SIZE / 2;
        if (overlapX < overlapY) {
          pushX += kcx < tcx ? -overlapX : overlapX;
        } else {
          pushY += kcy < tcy ? -overlapY : overlapY;
        }
      }

      if (pushX === 0 && pushY === 0) {
        break;
      }

      u.x = Math.max(0, Math.min(maxX, x + pushX));
      u.y = Math.max(0, Math.min(maxY, y + pushY));
    }
  }

  /**
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   */
  #resolveKnightOverlaps(state, worldWidthPx, worldHeightPx) {
    const units = this.#units;
    const minCenterDist = KNIGHT_COLLISION_RADIUS * 2;
    const hsx = KNIGHT_HALF_W;
    const hsy = KNIGHT_HALF_H;
    const maxX = worldWidthPx - KNIGHT_W;
    const maxY = worldHeightPx - KNIGHT_H;

    for (let round = 0; round < 2; round++) {
      for (let iter = 0; iter < 6; iter++) {
        for (let i = 0; i < units.length; i++) {
          for (let j = i + 1; j < units.length; j++) {
            const a = units[i];
            const b = units[j];
            const acx = a.x + hsx;
            const acy = a.y + hsy;
            const bcx = b.x + hsx;
            const bcy = b.y + hsy;
            let dx = bcx - acx;
            let dy = bcy - acy;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist >= minCenterDist) {
              continue;
            }
            const fullPush = minCenterDist - dist;
            dx /= dist;
            dy /= dist;
            const aChop = a.mode === 'chop';
            const bChop = b.mode === 'chop';
            if (aChop && bChop) {
              continue;
            }
            if (aChop && !bChop) {
              const nx = b.x + dx * fullPush;
              const ny = b.y + dy * fullPush;
              if (this.#isKnightWalkable(state, nx, ny, worldWidthPx, worldHeightPx)) {
                b.x = nx;
                b.y = ny;
              }
            } else if (bChop && !aChop) {
              const nx = a.x - dx * fullPush;
              const ny = a.y - dy * fullPush;
              if (this.#isKnightWalkable(state, nx, ny, worldWidthPx, worldHeightPx)) {
                a.x = nx;
                a.y = ny;
              }
            } else {
              const push = fullPush * 0.5;
              const ax = a.x - dx * push;
              const ay = a.y - dy * push;
              const bx = b.x + dx * push;
              const by = b.y + dy * push;
              const okA = this.#isKnightWalkable(state, ax, ay, worldWidthPx, worldHeightPx);
              const okB = this.#isKnightWalkable(state, bx, by, worldWidthPx, worldHeightPx);
              if (okA && okB) {
                a.x = ax;
                a.y = ay;
                b.x = bx;
                b.y = by;
              } else if (okA && !okB) {
                const bx2 = b.x + dx * fullPush;
                const by2 = b.y + dy * fullPush;
                if (this.#isKnightWalkable(state, bx2, by2, worldWidthPx, worldHeightPx)) {
                  b.x = bx2;
                  b.y = by2;
                } else if (this.#isKnightWalkable(state, ax, ay, worldWidthPx, worldHeightPx)) {
                  a.x = ax;
                  a.y = ay;
                }
              } else if (!okA && okB) {
                const ax2 = a.x - dx * fullPush;
                const ay2 = a.y - dy * fullPush;
                if (this.#isKnightWalkable(state, ax2, ay2, worldWidthPx, worldHeightPx)) {
                  a.x = ax2;
                  a.y = ay2;
                } else if (this.#isKnightWalkable(state, bx, by, worldWidthPx, worldHeightPx)) {
                  b.x = bx;
                  b.y = by;
                }
              }
            }
          }
        }
      }

      for (const u of units) {
        u.x = Math.max(0, Math.min(maxX, u.x));
        u.y = Math.max(0, Math.min(maxY, u.y));
        this.#pushKnightOutOfSolids(u, state, worldWidthPx, worldHeightPx);
      }
    }
  }

  /**
   * Дерево или чужое здание с HP — можно бить с этого якоря.
   *
   * @param {import('../../engine/state/cell.js').Cell} cell
   * @param {string} knightOwnerId
   */
  #canMeleeAnchorCell(cell, knightOwnerId) {
    if (!cell.entity || cell.entity.hp == null) {
      return false;
    }
    if (isTreeSpriteType(cell.spriteType)) {
      return true;
    }
    return (
      cell.spriteType !== 'knight' &&
      !!cell.ownerUserId &&
      cell.ownerUserId !== knightOwnerId
    );
  }

  /**
   * @param {KnightUnit} u
   */
  #hasMeleeTarget(u) {
    return u.chopTreeTile != null || u.chopTargetKnightId != null;
  }

  /**
   * @param {KnightUnit} u
   */
  #clearMeleeTarget(u) {
    u.chopTreeTile = null;
    u.chopTargetKnightId = null;
    u.attackFpW = TILE_SIZE;
    u.attackFpH = TILE_SIZE;
  }

  /**
   * @param {number} id
   * @returns {KnightUnit | null}
   */
  #getUnitById(id) {
    return this.#units.find((unit) => unit.id === id) ?? null;
  }

  /**
   * @param {number} worldPx
   * @param {number} worldPy
   * @param {string} localOwnerId
   * @returns {KnightUnit | null}
   */
  #findEnemyKnightAt(worldPx, worldPy, localOwnerId) {
    for (let i = this.#units.length - 1; i >= 0; i--) {
      const u = this.#units[i];
      if (!arePlayersEnemies(localOwnerId, u.ownerUserId) || u.hp <= 0) {
        continue;
      }
      if (
        worldPx >= u.x &&
        worldPy >= u.y &&
        worldPx < u.x + KNIGHT_W &&
        worldPy < u.y + KNIGHT_H
      ) {
        return u;
      }
    }
    return null;
  }

  /**
   * @param {KnightUnit} u
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @returns {{ x: number; y: number; w: number; h: number; center: { x: number; y: number } } | null}
   */
  #getMeleeTargetRect(u, state) {
    if (u.chopTargetKnightId != null) {
      const target = this.#getUnitById(u.chopTargetKnightId);
      if (!target) {
        return null;
      }
      return {
        x: target.x,
        y: target.y,
        w: KNIGHT_W,
        h: KNIGHT_H,
        center: target.center(),
      };
    }
    if (!u.chopTreeTile) {
      return null;
    }
    const cell = state.get(`${u.chopTreeTile.x}:${u.chopTreeTile.y}`);
    if (!cell?.isRenderable) {
      return null;
    }
    const fpW = u.attackFpW;
    const fpH = u.attackFpH;
    return {
      x: u.chopTreeTile.x,
      y: u.chopTreeTile.y,
      w: fpW,
      h: fpH,
      center: { x: u.chopTreeTile.x + fpW / 2, y: u.chopTreeTile.y + fpH / 2 },
    };
  }

  /**
   * @param {KnightUnit} u
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   */
  #isMeleeTargetValid(u, state) {
    if (u.chopTargetKnightId != null) {
      const target = this.#getUnitById(u.chopTargetKnightId);
      return target != null && arePlayersEnemies(u.ownerUserId, target.ownerUserId) && target.hp > 0;
    }
    if (!u.chopTreeTile) {
      return false;
    }
    const cell = state.get(`${u.chopTreeTile.x}:${u.chopTreeTile.y}`);
    return !!cell?.isRenderable && this.#canMeleeAnchorCell(cell, u.ownerUserId);
  }

  /**
   * @param {KnightUnit} u
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   */
  #dealMeleeHit(u, state) {
    if (u.chopTargetKnightId != null) {
      const target = this.#getUnitById(u.chopTargetKnightId);
      if (target) {
        this.#applyKnightMeleeHit(u.ownerUserId, target, u.attackDamage);
      }
      return;
    }
    if (u.chopTreeTile) {
      this.#applyChopHit(u.chopTreeTile.x, u.chopTreeTile.y, u.ownerUserId, u.attackDamage);
    }
  }

  /**
   * @param {string} attackerOwnerId
   * @param {KnightUnit} target
   * @param {number} damage
   */
  #applyKnightMeleeHit(attackerOwnerId, target, damage) {
    if (!arePlayersEnemies(attackerOwnerId, target.ownerUserId) || target.hp <= 0) {
      return;
    }
    target.hp -= damage;
    target.lastDamagedAtMs = performance.now();
    if (target.hp > 0) {
      return;
    }
    const deadId = target.id;
    this.#removeUnit(deadId);
    for (const u of this.#units) {
      if (u.chopTargetKnightId === deadId) {
        this.#clearMeleeTarget(u);
        u.mode = 'idle';
        u.path = [];
        u.pixelGoal = null;
        u.walkAnimStartMs = null;
        u.idleNextAltAt = null;
        u.faceLeft = false;
      }
    }
  }

  /**
   * @param {number} id
   */
  #removeUnit(id) {
    const idx = this.#units.findIndex((u) => u.id === id);
    if (idx >= 0) {
      this.#units.splice(idx, 1);
    }
    this.#selectedIds.delete(id);
  }

  /**
   * Рыцарь вплотную к прямоугольнику цели (дерево или отпечаток здания).
   *
   * @param {KnightUnit} u
   * @param {number} originTx левый верх якоря
   * @param {number} originTy
   * @param {number} fpW
   * @param {number} fpH
   */
  #isKnightTouchingStructureAabb(u, originTx, originTy, fpW, fpH) {
    const d = aabbOuterDistance(u.x, u.y, KNIGHT_W, KNIGHT_H, originTx, originTy, fpW, fpH);
    return d <= CHOP_TOUCH_GAP_PX;
  }

  /**
   * @param {KnightUnit} u
   * @param {number} tx
   * @param {number} ty
   * @param {number} dtMs
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   */
  #moveToward(u, tx, ty, dtMs, state, worldWidthPx, worldHeightPx) {
    const cx = u.x + KNIGHT_HALF_W;
    const cy = u.y + KNIGHT_HALF_H;
    const tcx = tx + KNIGHT_HALF_W;
    const tcy = ty + KNIGHT_HALF_H;
    const dx = tcx - cx;
    const dy = tcy - cy;
    const len = Math.hypot(dx, dy) || 1;
    const step = MOVE_SPEED_PX_PER_MS * dtMs;
    const nx = u.x + (dx / len) * Math.min(step, len);
    const ny = u.y + (dy / len) * Math.min(step, len);

    if (this.#tryPlaceKnightAt(u, nx, ny, state, worldWidthPx, worldHeightPx)) {
      const c = this.#clampTopLeftToWorld(nx, ny, worldWidthPx, worldHeightPx);
      u.x = c.x;
      u.y = c.y;
    } else if (this.#tryPlaceKnightAt(u, nx, u.y, state, worldWidthPx, worldHeightPx)) {
      const c = this.#clampTopLeftToWorld(nx, u.y, worldWidthPx, worldHeightPx);
      u.x = c.x;
    } else if (this.#tryPlaceKnightAt(u, u.x, ny, state, worldWidthPx, worldHeightPx)) {
      const c = this.#clampTopLeftToWorld(u.x, ny, worldWidthPx, worldHeightPx);
      u.y = c.y;
    }

    if (Math.abs(dx) > 0.02) {
      u.faceLeft = dx < 0;
    }
  }

  /**
   * @param {KnightUnit} u
   * @param {number} x
   * @param {number} y
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   */
  #tryPlaceKnightAt(u, x, y, state, worldWidthPx, worldHeightPx) {
    const c = this.#clampTopLeftToWorld(x, y, worldWidthPx, worldHeightPx);
    return this.#isKnightWalkable(state, c.x, c.y, worldWidthPx, worldHeightPx);
  }

  /**
   * @param {KnightUnit} u
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   */
  #tryRepathStuckKnight(u, state, worldWidthPx, worldHeightPx) {
    if (u.pixelGoal) {
      const gcx = u.pixelGoal.x + KNIGHT_HALF_W;
      const gcy = u.pixelGoal.y + KNIGHT_HALF_H;
      const path = findPathTiles(state, u.center(), { x: gcx, y: gcy }, worldWidthPx, worldHeightPx);
      if (path !== null) {
        u.path = path;
        u.stalledMoveMs = 0;
      }
      return;
    }
    if (u.path.length === 0) {
      return;
    }
    const last = u.path[u.path.length - 1];
    const path = findPathTiles(
      state,
      u.center(),
      { x: last.x + TILE_SIZE / 2, y: last.y + TILE_SIZE / 2 },
      worldWidthPx,
      worldHeightPx
    );
    if (path !== null) {
      u.path = path;
      u.stalledMoveMs = 0;
    }
  }

  /**
   * Горизонтальный поворот к точке; при почти вертикальном смещении оставляет прошлый facing.
   *
   * @param {KnightUnit} u
   * @param {{ x: number; y: number }} targetWorld
   */
  #updateFaceTowardWorldPoint(u, targetWorld) {
    const kcx = u.x + KNIGHT_HALF_W;
    const kcy = u.y + KNIGHT_HALF_H;
    const dx = targetWorld.x - kcx;
    const dy = targetWorld.y - kcy;
    if (Math.abs(dx) >= Math.abs(dy)) {
      u.faceLeft = dx < 0;
    }
  }

  /**
   * Спрайты и рамка выделения. Треугольник владельца — см. `renderLocalPlayerTrianglesOnTop`.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ offsetX: number; offsetY: number }} scrollOffset
   * @param {CanvasImageSource} knightImage
   */
  render(ctx, scrollOffset, knightImage) {
    const { offsetX, offsetY } = scrollOffset;

    for (const u of this.#units) {
      const frame = this.#pickFrame(u);
      const screenX = u.x + offsetX;
      const screenY = u.y + offsetY;
      const drawX = Math.round(screenX);
      const drawY = Math.round(screenY);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (u.faceLeft) {
        ctx.translate(drawX + KNIGHT_W, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(
          knightImage,
          frame.sx,
          frame.sy,
          frame.sw,
          frame.sh,
          0,
          0,
          KNIGHT_W,
          KNIGHT_H
        );
      } else {
        ctx.drawImage(
          knightImage,
          frame.sx,
          frame.sy,
          frame.sw,
          frame.sh,
          drawX,
          drawY,
          KNIGHT_W,
          KNIGHT_H
        );
      }
      ctx.restore();

      drawStructureHpBar(ctx, {
        spriteLeft: drawX,
        spriteTop: drawY,
        spriteWidth: KNIGHT_W,
        hp: u.hp,
        maxHp: u.maxHp,
        lastDamagedAtMs: u.lastDamagedAtMs,
      });

      if (this.#selectedIds.has(u.id)) {
        ctx.save();
        ctx.fillStyle = 'rgb(120, 220, 255)';
        // Snap to pixels and build border from actual 9x8 sprite bounds.
        const sx = drawX;
        const sy = drawY;
        const L = sx - 1 + KNIGHT_SELECTION_LR_INSET_PX;
        const T = sy - 1;
        const R = sx + KNIGHT_W - KNIGHT_SELECTION_LR_INSET_PX;
        const B = sy + KNIGHT_H;
        const barW = R - L + 1;
        const barH = B - T + 1;
        ctx.fillRect(L, T, barW, 1);
        ctx.fillRect(L, B, barW, 1);
        ctx.fillRect(L, T, 1, barH);
        ctx.fillRect(R, T, 1, barH);
        ctx.restore();
      }
    }
  }

  /**
   * Красный треугольник владельца — отдельным проходом в конце кадра, чтобы был поверх спрайтов и эффектов.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ offsetX: number; offsetY: number }} scrollOffset
   * @param {boolean} showPlayerIndicators
   * @param {string} localPlayerUserId
   */
  renderLocalPlayerTrianglesOnTop(ctx, scrollOffset, showPlayerIndicators, localPlayerUserId) {
    if (!showPlayerIndicators || !localPlayerUserId) return;
    const { offsetX, offsetY } = scrollOffset;
    for (const u of this.#units) {
      if (u.ownerUserId !== localPlayerUserId) continue;
      const screenX = u.x + offsetX;
      const screenY = u.y + offsetY;
      const drawX = Math.round(screenX);
      const drawY = Math.round(screenY);
      this.#drawPlayerTriangle(ctx, drawX, drawY, PLAYER_INDICATOR_COLOR);
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} screenX
   * @param {number} screenY
   * @param {string} color
   */
  #drawPlayerTriangle(ctx, screenX, screenY, color) {
    // У спрайта нечётная ширина: центр по сетке — floor(+half), не round(+half), иначе смещение на 1px вправо.
    const cx = Math.floor(screenX + KNIGHT_HALF_W);
    const tipY = Math.round(screenY - PLAYER_BUILDING_TRIANGLE_GAP_PX);
    const topY = tipY - PLAYER_BUILDING_TRIANGLE_HEIGHT_PX;
    const hb = PLAYER_BUILDING_TRIANGLE_HALF_BASE_PX;

    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 1;

    for (let row = 0; row <= PLAYER_BUILDING_TRIANGLE_HEIGHT_PX; row += 1) {
      const rowY = topY + row;
      const halfWidth = Math.floor((hb * (PLAYER_BUILDING_TRIANGLE_HEIGHT_PX - row)) / PLAYER_BUILDING_TRIANGLE_HEIGHT_PX);
      const rowX = cx - halfWidth;
      const rowWidth = halfWidth * 2 + 1;
      ctx.fillRect(rowX, rowY, rowWidth, 1);
    }

    ctx.restore();
  }

  /**
   * @param {KnightUnit} u
   */
  #pickFrame(u) {
    if (u.mode === 'chop' && this.#hasMeleeTarget(u)) {
      const i = Math.floor(u.animMs / KNIGHT_CHOP_FRAME_MS) % KNIGHT_FRAMES_CHOP.length;
      return KNIGHT_FRAMES_CHOP[i];
    }
    if (u.walkAnimStartMs != null) {
      const i =
        Math.floor((performance.now() - u.walkAnimStartMs) / KNIGHT_RUN_FRAME_MS) % KNIGHT_FRAMES_RUN.length;
      return KNIGHT_FRAMES_RUN[i];
    }
    return this.#pickIdleFrame(u);
  }

  /**
   * Новое случайное число миллисекунд при каждом вызове (интервал для конкретного рыцаря).
   */
  #randomIdleGapMs() {
    return KNIGHT_IDLE_GAP_MIN_MS + Math.random() * (KNIGHT_IDLE_GAP_MAX_MS - KNIGHT_IDLE_GAP_MIN_MS);
  }

  /**
   * @param {KnightUnit} u
   */
  #pickIdleFrame(u) {
    const now = performance.now();
    if (u.idleNextAltAt == null) {
      u.idleNextAltAt = now + this.#randomIdleGapMs();
    }
    const altEnd = u.idleNextAltAt + KNIGHT_IDLE_ALT_DURATION_MS;
    if (now < u.idleNextAltAt) {
      return KNIGHT_FRAME_IDLE;
    }
    if (now < altEnd) {
      return KNIGHT_FRAME_IDLE_ALT;
    }
    u.idleNextAltAt = now + this.#randomIdleGapMs();
    return KNIGHT_FRAME_IDLE;
  }
}
