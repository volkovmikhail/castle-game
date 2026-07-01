/**
 * Клиентский рендер снарядов пушек замка. Снаряд — 1 пиксель цвета рыцаря.
 *
 * Сетевой режим: снапшоты приходят ~10 Гц, поэтому позицию плавно тянем к серверной
 * цели (`hydrateFromSnapshot` + `interpolate`). Локальный режим: позиции считаются
 * каждый кадр самой симуляцией, поэтому ставим их точно (`syncLocal`, без сглаживания).
 */
import { CASTLE_CANNON_PROJECTILE_SIZE_PX } from '../../constants/castle-cannon.js';
import { KNIGHT_BODY_COLOR } from '../../constants/knight-atlas.js';

export class ProjectileSystem {
  /** @type {Map<number, { x: number; y: number; tx: number; ty: number }>} */
  #projectiles = new Map();

  /**
   * Сетевой режим: обновить цели из снапшота (позиция сглаживается в interpolate()).
   *
   * @param {[number, number, number][]} snapshot [id, x, y]
   */
  hydrateFromSnapshot(snapshot) {
    const seen = new Set();
    for (const [id, x, y] of snapshot) {
      seen.add(id);
      const existing = this.#projectiles.get(id);
      if (existing) {
        existing.tx = x;
        existing.ty = y;
      } else {
        this.#projectiles.set(id, { x, y, tx: x, ty: y });
      }
    }
    this.#dropMissing(seen);
  }

  /**
   * Локальный режим: выставить позиции точно (симуляция уже посчитала их для этого кадра).
   *
   * @param {[number, number, number][]} list [id, x, y]
   */
  syncLocal(list) {
    const seen = new Set();
    for (const [id, x, y] of list) {
      seen.add(id);
      const existing = this.#projectiles.get(id);
      if (existing) {
        existing.x = x;
        existing.y = y;
        existing.tx = x;
        existing.ty = y;
      } else {
        this.#projectiles.set(id, { x, y, tx: x, ty: y });
      }
    }
    this.#dropMissing(seen);
  }

  /** @param {Set<number>} seen */
  #dropMissing(seen) {
    for (const id of this.#projectiles.keys()) {
      if (!seen.has(id)) {
        this.#projectiles.delete(id);
      }
    }
  }

  /** @param {number} dtMs */
  interpolate(dtMs) {
    const k = Math.min(1, dtMs / 70);
    for (const p of this.#projectiles.values()) {
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      if (Math.hypot(dx, dy) > 40) {
        p.x = p.tx;
        p.y = p.ty;
      } else {
        p.x += dx * k;
        p.y += dy * k;
      }
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ offsetX: number; offsetY: number }} scrollOffset
   */
  render(ctx, scrollOffset) {
    if (this.#projectiles.size === 0) {
      return;
    }
    const { offsetX, offsetY } = scrollOffset;
    const size = CASTLE_CANNON_PROJECTILE_SIZE_PX;
    ctx.save();
    ctx.fillStyle = KNIGHT_BODY_COLOR;
    for (const p of this.#projectiles.values()) {
      ctx.fillRect(Math.round(p.x + offsetX), Math.round(p.y + offsetY), size, size);
    }
    ctx.restore();
  }
}
