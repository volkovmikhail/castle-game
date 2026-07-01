/**
 * Пушки замков — общая (headless) симуляция для сервера (WorldSim) и локального
 * режима клиента (game.js). Замок раз в секунду стреляет по ближайшему вражескому
 * рыцарю в радиусе; снаряд самонаводится на цель и наносит урон при попадании.
 *
 * Не зависит от рендера/DOM — только от stateManager и knightSystem.
 */
import { tiles } from '../constants/tiles.js';
import {
  CASTLE_CANNON_DAMAGE,
  CASTLE_CANNON_FIRE_INTERVAL_MS,
  CASTLE_CANNON_HIT_RADIUS_PX,
  CASTLE_CANNON_MUZZLE_OFFSET_X,
  CASTLE_CANNON_MUZZLE_OFFSET_Y,
  CASTLE_CANNON_PROJECTILE_SPEED_PX_PER_MS,
  CASTLE_CANNON_RANGE_PX,
} from '../constants/castle-cannon.js';

export class CastleCannonSystem {
  /** @type {{ id: number; x: number; y: number; targetKnightId: number; lastTx: number; lastTy: number }[]} */
  #projectiles = [];
  #nextId = 1;
  /** Кулдаун пушки каждого замка: ключ клетки `${x}:${y}` → мс до выстрела. */
  #cooldowns = new Map();

  /** @returns {{ id: number; x: number; y: number }[]} */
  getProjectiles() {
    return this.#projectiles;
  }

  /**
   * @param {number} dtMs
   * @param {import('../engine/state/state-manager.js').StateManager} stateManager
   * @param {import('./knights/knight-system.js').KnightSystem} knightSystem
   */
  update(dtMs, stateManager, knightSystem) {
    const state = stateManager.getState();
    const liveCastleKeys = new Set();

    for (const [key, cell] of state.entries()) {
      if (!cell.isRenderable || cell.spriteType !== 'castle' || !cell.ownerUserId) {
        continue;
      }
      liveCastleKeys.add(key);
      const [ax, ay] = key.split(':').map(Number);
      // Обнаружение врага — от центра замка; вылет снаряда — из настраиваемого дула.
      const centerX = ax + tiles.castle.width / 2;
      const centerY = ay + tiles.castle.height / 2;
      const muzzleX = ax + CASTLE_CANNON_MUZZLE_OFFSET_X;
      const muzzleY = ay + CASTLE_CANNON_MUZZLE_OFFSET_Y;

      let cooldown = (this.#cooldowns.get(key) ?? 0) - dtMs;
      if (cooldown <= 0) {
        const target = knightSystem.findNearestEnemyKnightNearPoint(
          centerX,
          centerY,
          CASTLE_CANNON_RANGE_PX,
          cell.ownerUserId
        );
        if (target) {
          this.#projectiles.push({
            id: this.#nextId++,
            x: muzzleX,
            y: muzzleY,
            targetKnightId: target.id,
            lastTx: target.cx,
            lastTy: target.cy,
          });
          cooldown = CASTLE_CANNON_FIRE_INTERVAL_MS;
        } else {
          // Цели нет — держим пушку заряженной, чтобы выстрелить сразу, как враг войдёт.
          cooldown = 0;
        }
      }
      this.#cooldowns.set(key, cooldown);
    }

    // Забываем кулдауны разрушенных замков.
    for (const key of this.#cooldowns.keys()) {
      if (!liveCastleKeys.has(key)) {
        this.#cooldowns.delete(key);
      }
    }

    this.#advanceProjectiles(dtMs, knightSystem);
  }

  /**
   * @param {number} dtMs
   * @param {import('./knights/knight-system.js').KnightSystem} knightSystem
   */
  #advanceProjectiles(dtMs, knightSystem) {
    if (this.#projectiles.length === 0) {
      return;
    }
    const step = CASTLE_CANNON_PROJECTILE_SPEED_PX_PER_MS * dtMs;
    const survivors = [];
    for (const p of this.#projectiles) {
      const c = knightSystem.getKnightCenterById(p.targetKnightId);
      if (c) {
        p.lastTx = c.x;
        p.lastTy = c.y;
      }
      const dx = p.lastTx - p.x;
      const dy = p.lastTy - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= step || dist <= CASTLE_CANNON_HIT_RADIUS_PX) {
        // Долетел: наносим урон, если цель ещё жива (иначе снаряд просто гаснет).
        if (c) {
          knightSystem.applyExternalDamageToKnight(p.targetKnightId, CASTLE_CANNON_DAMAGE);
        }
        continue;
      }
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      survivors.push(p);
    }
    this.#projectiles = survivors;
  }

  /** Снаряды для снапшота: [id, x, y] (цвет фиксирован — цвет рыцаря). */
  serialize() {
    return this.#projectiles.map((p) => [p.id, Math.round(p.x), Math.round(p.y)]);
  }
}
