import {
  findPathTiles,
  hasStraightWalk,
  isTreeSpriteType,
  isWalkableTile,
  neighborStandTilesForTree,
} from '../../common/grid-path.js';
import {
  KNIGHT_CHOP_FRAME_MS,
  KNIGHT_COLLISION_RADIUS,
  KNIGHT_FRAMES_CHOP,
  KNIGHT_FRAMES_RUN,
  KNIGHT_FRAME_IDLE,
  KNIGHT_RUN_FRAME_MS,
  KNIGHT_SPRITE_SIZE,
} from '../../constants/knight-atlas.js';
import { TILE_SIZE } from '../../constants/sizes.js';

const MOVE_SPEED_PX_PER_MS = 0.05;
const CHOP_HIT_INTERVAL_MS = 550;
const ARRIVE_EPS_PX = 2.5;

/** @typedef {'idle' | 'move' | 'chop'} KnightMode */

let nextKnightId = 1;

function resetKnightIds() {
  nextKnightId = 1;
}

class KnightUnit {
  /**
   * @param {{ id: number; ownerUserId: string; x: number; y: number }} p
   */
  constructor({ id, ownerUserId, x, y }) {
    this.id = id;
    this.ownerUserId = ownerUserId;
    this.x = x;
    this.y = y;

    /** @type {KnightMode} */
    this.mode = 'idle';

    /** @type {{ x: number; y: number }[]} */
    this.path = [];

    /** @type {{ x: number; y: number } | null} */
    this.chopTreeTile = null;

    /** Целевой левый верх спрайта после прохождения тайлового пути (пиксели мира). */
    /** @type {{ x: number; y: number } | null} */
    this.pixelGoal = null;

    this.chopCooldownMs = 0;
    this.animMs = 0;

    /** @type {number | null} момент старта цикла «бег»; null — стоим (кадр idle/chop по mode) */
    this.walkAnimStartMs = null;

    /** Зеркалирование спрайта: true — смотрит влево (идёт или рубит слева от цели). */
    this.faceLeft = false;
  }

  /** @returns {{ x: number; y: number }} */
  center() {
    return { x: this.x + KNIGHT_SPRITE_SIZE / 2, y: this.y + KNIGHT_SPRITE_SIZE / 2 };
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

  /** @type {(x: number, y: number) => void} */
  #deleteTreeAt;

  /**
   * @param {{ deleteTreeAt: (x: number, y: number) => void }} param0
   */
  constructor({ deleteTreeAt }) {
    this.#deleteTreeAt = deleteTreeAt;
  }

  clear() {
    this.#units.length = 0;
    this.#selectedIds.clear();
    resetKnightIds();
  }

  /**
   * @param {{ x: number; y: number; ownerUserId: string }} p
   * @returns {KnightUnit}
   */
  spawn({ x, y, ownerUserId }) {
    const unit = new KnightUnit({ id: nextKnightId++, ownerUserId, x, y });
    this.#units.push(unit);
    return unit;
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
        worldPx < u.x + KNIGHT_SPRITE_SIZE &&
        worldPy < u.y + KNIGHT_SPRITE_SIZE
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

    const goal = { x: worldPx, y: worldPy };
    let anyPath = false;
    for (const u of selected) {
      const path = findPathTiles(state, u.center(), goal, worldWidthPx, worldHeightPx);
      if (path !== null) {
        u.path = path;
        u.mode = 'move';
        u.chopTreeTile = null;
        u.chopCooldownMs = 0;
        u.walkAnimStartMs = performance.now();
        u.pixelGoal = this.#clampTopLeftToWorld(
          worldPx - KNIGHT_SPRITE_SIZE / 2,
          worldPy - KNIGHT_SPRITE_SIZE / 2,
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
   * @param {{ x: number; y: number }} treeTile
   * @param {Map<string, import('../../engine/state/cell.js').Cell>} state
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   * @param {(msg: string) => void} showToast
   */
  #orderChopGroup(units, treeTile, state, worldWidthPx, worldHeightPx, showToast) {
    const neighbors = neighborStandTilesForTree(treeTile.x, treeTile.y).filter((t) =>
      isWalkableTile(state, t.x, t.y, worldWidthPx, worldHeightPx)
    );

    if (neighbors.length === 0) {
      showToast('К дереву не подойти.');
      return;
    }

    /** @type {Set<string>} */
    const reserved = new Set();

    let anyOk = false;
    for (const u of units) {
      const sorted = [...neighbors].sort((a, b) => {
        const da = (a.x + TILE_SIZE / 2 - u.center().x) ** 2 + (a.y + TILE_SIZE / 2 - u.center().y) ** 2;
        const db = (b.x + TILE_SIZE / 2 - u.center().x) ** 2 + (b.y + TILE_SIZE / 2 - u.center().y) ** 2;
        return da - db;
      });

      let picked = null;
      for (const n of sorted) {
        const rk = `${n.x}:${n.y}`;
        if (reserved.has(rk)) {
          continue;
        }
        const path = findPathTiles(state, u.center(), { x: n.x, y: n.y }, worldWidthPx, worldHeightPx);
        if (path !== null) {
          picked = { n, path };
          reserved.add(rk);
          break;
        }
      }

      if (picked) {
        u.path = picked.path;
        u.mode = 'move';
        u.chopTreeTile = { x: treeTile.x, y: treeTile.y };
        u.chopCooldownMs = 0;
        u.walkAnimStartMs = performance.now();
        u.pixelGoal = this.#clampTopLeftToWorld(
          picked.n.x + TILE_SIZE / 2 - KNIGHT_SPRITE_SIZE / 2,
          picked.n.y + TILE_SIZE / 2 - KNIGHT_SPRITE_SIZE / 2,
          worldWidthPx,
          worldHeightPx
        );
        anyOk = true;
      }
    }

    if (!anyOk) {
      showToast('Нельзя дойти до дерева.');
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

      if (u.mode === 'chop' && u.chopTreeTile) {
        const key = `${u.chopTreeTile.x}:${u.chopTreeTile.y}`;
        const cell = state.get(key);
        if (!cell || !cell.isRenderable || !isTreeSpriteType(cell.spriteType)) {
          u.mode = 'idle';
          u.chopTreeTile = null;
          u.path = [];
          u.pixelGoal = null;
          u.walkAnimStartMs = null;
          u.faceLeft = false;
          continue;
        }

        if (!this.#isFourNeighborTile(u, u.chopTreeTile.x, u.chopTreeTile.y)) {
          u.mode = 'idle';
          u.chopTreeTile = null;
          u.path = [];
          u.pixelGoal = null;
          u.walkAnimStartMs = null;
          u.faceLeft = false;
          continue;
        }

        u.chopCooldownMs += dtMs;
        if (u.chopCooldownMs >= CHOP_HIT_INTERVAL_MS) {
          u.chopCooldownMs = 0;
          this.#deleteTreeAt(u.chopTreeTile.x, u.chopTreeTile.y);
        }

        this.#updateFaceTowardWorldPoint(u, {
          x: u.chopTreeTile.x + TILE_SIZE / 2,
          y: u.chopTreeTile.y + TILE_SIZE / 2,
        });
        continue;
      }

      if (u.mode === 'move' && u.pixelGoal != null) {
        this.#shortcutPathTowardPixelGoal(u, state, worldWidthPx, worldHeightPx);
      }

      if (u.path.length > 0) {
        const next = u.path[0];
        const targetX = next.x + TILE_SIZE / 2 - KNIGHT_SPRITE_SIZE / 2;
        const targetY = next.y + TILE_SIZE / 2 - KNIGHT_SPRITE_SIZE / 2;
        this.#moveToward(u, targetX, targetY, dtMs);

        const dist = Math.hypot(
          u.x + KNIGHT_SPRITE_SIZE / 2 - (next.x + TILE_SIZE / 2),
          u.y + KNIGHT_SPRITE_SIZE / 2 - (next.y + TILE_SIZE / 2)
        );
        if (dist < ARRIVE_EPS_PX) {
          u.x = targetX;
          u.y = targetY;
          u.path.shift();
        }
      } else if (u.pixelGoal != null && u.mode === 'move') {
        const g = u.pixelGoal;
        this.#moveToward(u, g.x, g.y, dtMs);
        const dist = Math.hypot(u.x - g.x, u.y - g.y);
        if (dist < ARRIVE_EPS_PX) {
          u.x = g.x;
          u.y = g.y;
          u.pixelGoal = null;
        }
      }

      if (u.path.length === 0 && u.mode === 'move' && u.chopTreeTile && !u.pixelGoal) {
        const t = u.chopTreeTile;
        const cell = state.get(`${t.x}:${t.y}`);
        if (cell && cell.isRenderable && isTreeSpriteType(cell.spriteType) && this.#isFourNeighborTile(u, t.x, t.y)) {
          u.mode = 'chop';
          u.chopCooldownMs = 0;
          u.walkAnimStartMs = null;
        } else if (!cell || !isTreeSpriteType(cell.spriteType)) {
          u.chopTreeTile = null;
          u.mode = 'idle';
          u.walkAnimStartMs = null;
          u.faceLeft = false;
        } else {
          u.chopTreeTile = null;
          u.mode = 'idle';
          u.walkAnimStartMs = null;
          u.faceLeft = false;
        }
        continue;
      }

      if (u.mode === 'move' && u.path.length === 0 && !u.chopTreeTile && !u.pixelGoal) {
        u.mode = 'idle';
        u.walkAnimStartMs = null;
        u.faceLeft = false;
      }
    }

    this.#resolveKnightOverlaps(state, worldWidthPx, worldHeightPx);
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
    const ccx = u.x + KNIGHT_SPRITE_SIZE / 2;
    const ccy = u.y + KNIGHT_SPRITE_SIZE / 2;
    const gcx = g.x + KNIGHT_SPRITE_SIZE / 2;
    const gcy = g.y + KNIGHT_SPRITE_SIZE / 2;

    while (u.path.length >= 2) {
      const p1 = u.path[1];
      const mx = p1.x + TILE_SIZE / 2;
      const my = p1.y + TILE_SIZE / 2;
      if (!hasStraightWalk(state, ccx, ccy, mx, my, worldWidthPx, worldHeightPx)) {
        break;
      }
      u.path.shift();
    }

    if (u.path.length > 0 && hasStraightWalk(state, ccx, ccy, gcx, gcy, worldWidthPx, worldHeightPx)) {
      u.path.length = 0;
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} worldWidthPx
   * @param {number} worldHeightPx
   */
  #clampTopLeftToWorld(x, y, worldWidthPx, worldHeightPx) {
    const maxX = worldWidthPx - KNIGHT_SPRITE_SIZE;
    const maxY = worldHeightPx - KNIGHT_SPRITE_SIZE;
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
    const w = KNIGHT_SPRITE_SIZE;
    const xMax = x + w - 1e-6;
    const yMax = y + w - 1e-6;
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
    const w = KNIGHT_SPRITE_SIZE;
    if (x < 0 || y < 0 || x + w > worldWidthPx || y + w > worldHeightPx) {
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
    const w = KNIGHT_SPRITE_SIZE;
    const maxX = worldWidthPx - w;
    const maxY = worldHeightPx - w;

    for (let iter = 0; iter < 16; iter++) {
      if (this.#isKnightWalkable(state, u.x, u.y, worldWidthPx, worldHeightPx)) {
        return;
      }

      let blocked = null;
      for (const { tx, ty } of this.#tileOriginsUnderKnight(u.x, u.y)) {
        if (!isWalkableTile(state, tx, ty, worldWidthPx, worldHeightPx)) {
          blocked = { tx, ty };
          break;
        }
      }
      if (!blocked) {
        break;
      }

      const { tx, ty } = blocked;
      let x = u.x;
      let y = u.y;
      const overlapX = Math.min(x + w, tx + TILE_SIZE) - Math.max(x, tx);
      const overlapY = Math.min(y + w, ty + TILE_SIZE) - Math.max(y, ty);
      if (overlapX <= 0 || overlapY <= 0) {
        break;
      }

      const kcx = x + w / 2;
      const kcy = y + w / 2;
      const tcx = tx + TILE_SIZE / 2;
      const tcy = ty + TILE_SIZE / 2;

      if (overlapX < overlapY) {
        x += kcx < tcx ? -overlapX : overlapX;
      } else {
        y += kcy < tcy ? -overlapY : overlapY;
      }

      u.x = Math.max(0, Math.min(maxX, x));
      u.y = Math.max(0, Math.min(maxY, y));
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
    const hs = KNIGHT_SPRITE_SIZE / 2;
    const maxX = worldWidthPx - KNIGHT_SPRITE_SIZE;
    const maxY = worldHeightPx - KNIGHT_SPRITE_SIZE;

    for (let round = 0; round < 2; round++) {
      for (let iter = 0; iter < 6; iter++) {
        for (let i = 0; i < units.length; i++) {
          for (let j = i + 1; j < units.length; j++) {
            const a = units[i];
            const b = units[j];
            const acx = a.x + hs;
            const acy = a.y + hs;
            const bcx = b.x + hs;
            const bcy = b.y + hs;
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
   * @param {KnightUnit} u
   * @param {number} tx
   * @param {number} ty
   */
  #isFourNeighborTile(u, tx, ty) {
    const { tx: ktx, ty: kty } = u.anchorTileOrigin();
    const dx = Math.abs(ktx - tx);
    const dy = Math.abs(kty - ty);
    return (dx === TILE_SIZE && dy === 0) || (dx === 0 && dy === TILE_SIZE);
  }

  /**
   * @param {KnightUnit} u
   * @param {number} tx
   * @param {number} ty
   * @param {number} dtMs
   */
  #moveToward(u, tx, ty, dtMs) {
    const cx = u.x + KNIGHT_SPRITE_SIZE / 2;
    const cy = u.y + KNIGHT_SPRITE_SIZE / 2;
    const tcx = tx + KNIGHT_SPRITE_SIZE / 2;
    const tcy = ty + KNIGHT_SPRITE_SIZE / 2;
    const dx = tcx - cx;
    const dy = tcy - cy;
    const len = Math.hypot(dx, dy) || 1;
    const step = MOVE_SPEED_PX_PER_MS * dtMs;
    const nx = u.x + (dx / len) * Math.min(step, len);
    const ny = u.y + (dy / len) * Math.min(step, len);
    u.x = nx;
    u.y = ny;

    if (Math.abs(dx) > 0.02) {
      u.faceLeft = dx < 0;
    }
  }

  /**
   * Горизонтальный поворот к точке; при почти вертикальном смещении оставляет прошлый facing.
   *
   * @param {KnightUnit} u
   * @param {{ x: number; y: number }} targetWorld
   */
  #updateFaceTowardWorldPoint(u, targetWorld) {
    const kcx = u.x + KNIGHT_SPRITE_SIZE / 2;
    const kcy = u.y + KNIGHT_SPRITE_SIZE / 2;
    const dx = targetWorld.x - kcx;
    const dy = targetWorld.y - kcy;
    if (Math.abs(dx) >= Math.abs(dy)) {
      u.faceLeft = dx < 0;
    }
  }

  /**
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
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (u.faceLeft) {
        ctx.translate(screenX + KNIGHT_SPRITE_SIZE, screenY);
        ctx.scale(-1, 1);
        ctx.drawImage(
          knightImage,
          frame.sx,
          frame.sy,
          frame.sw,
          frame.sh,
          0,
          0,
          KNIGHT_SPRITE_SIZE,
          KNIGHT_SPRITE_SIZE
        );
      } else {
        ctx.drawImage(
          knightImage,
          frame.sx,
          frame.sy,
          frame.sw,
          frame.sh,
          screenX,
          screenY,
          KNIGHT_SPRITE_SIZE,
          KNIGHT_SPRITE_SIZE
        );
      }
      ctx.restore();

      if (this.#selectedIds.has(u.id)) {
        ctx.save();
        ctx.fillStyle = 'rgb(120, 220, 255)';
        // Snap to device pixels to avoid anti-aliased blur on moving units.
        const facingOffsetX = u.faceLeft ? 1 : 0;
        const sx = Math.round(u.x + offsetX) + facingOffsetX;
        const sy = Math.round(u.y + offsetY);
        const w = KNIGHT_SPRITE_SIZE;
        const L = sx;
        const T = sy - 1;
        const R = sx + w - 2;
        const B = sy + w;
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
   * @param {KnightUnit} u
   */
  #pickFrame(u) {
    if (u.mode === 'chop' && u.chopTreeTile) {
      const i = Math.floor(u.animMs / KNIGHT_CHOP_FRAME_MS) % KNIGHT_FRAMES_CHOP.length;
      return KNIGHT_FRAMES_CHOP[i];
    }
    if (u.walkAnimStartMs != null) {
      const i =
        Math.floor((performance.now() - u.walkAnimStartMs) / KNIGHT_RUN_FRAME_MS) % KNIGHT_FRAMES_RUN.length;
      return KNIGHT_FRAMES_RUN[i];
    }
    return KNIGHT_FRAME_IDLE;
  }
}
