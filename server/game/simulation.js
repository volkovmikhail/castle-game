'use strict';

/**
 * Серверная авторитетная симуляция одной партии (headless — без рендера).
 *
 * PHASE 1 (сейчас): безопасный скелет. Держит мир/слоты/жизни, имеет точки входа
 * для тика, намерений, снапшота и выбывания — но ещё не гоняет полную логику.
 *
 * PHASE 2 (план): сюда переезжает существующая клиентская симуляция почти как
 * есть, т.к. она хорошо разделена (см. multiplayer.md):
 *   - StateManager (client/engine/state) — карта клеток;
 *   - KnightSystem (client/game/knights) — юниты, бой, приказы (методы update/
 *     spawn/issueOrder уже принимают простые аргументы; render() просто не зовём);
 *   - экономика/стройка/фермы из client/game/game.js — выносится в чистый модуль
 *     без обращений к UI/Controls/renderer.
 * `performance.now()` доступен как глобал в Node 16+, так что таймеры построек
 * переедут без правок. Источник входных данных — applyIntent() вместо Controls,
 * вывод — collectSnapshot()/события вместо UI-колбэков.
 */

const WORLD_TILES = 64;
const TILE_SIZE = 16;
const WORLD_WIDTH_PX = WORLD_TILES * TILE_SIZE;
const WORLD_HEIGHT_PX = WORLD_TILES * TILE_SIZE;

class Simulation {
  /**
   * @param {{ seed: number, slots: import('../constants/slots').PlayerSlot[] }} opts
   */
  constructor({ seed, slots }) {
    this.seed = seed >>> 0;
    this.slots = slots;
    this.tickCount = 0;
    this.elapsedMs = 0;

    /** Жив ли слот (по индексу слота). */
    this.alive = new Map(slots.map((s) => [s.slot, true]));

    /** Очередь выбывших, которую опустошает Room каждый тик. */
    this.pendingEliminations = [];

    // PHASE 2: this.state = new StateManager(); this.knights = new KnightSystem(...);
    //          this.#generateWorld(); this.#placeInitialCastles();
  }

  getWorldInfo() {
    return {
      tiles: WORLD_TILES,
      tileSize: TILE_SIZE,
      width: WORLD_WIDTH_PX,
      height: WORLD_HEIGHT_PX,
    };
  }

  /**
   * Применить намерение игрока (валидация + мутация — на сервере).
   * PHASE 2: переиспользует #validatePlacement/#tryAffordPlacement/issueOrder и т.д.
   *
   * @param {number} slot
   * @param {{ type: string, payload: any }} _intent
   * @returns {{ ok: boolean, error?: string }}
   */
  applyIntent(slot, _intent) {
    if (!this.alive.get(slot)) {
      return { ok: false, error: 'eliminated' };
    }
    // PHASE 2: switch (_intent.type) { case 'placeBuilding': ... }
    return { ok: true };
  }

  /**
   * Шаг симуляции на dtMs миллисекунд.
   * PHASE 2: this.knights.update(dt, this.state, W, H); this.#processProgressJobs(); ...
   *
   * @param {number} dtMs
   */
  tick(dtMs) {
    this.elapsedMs += dtMs;
    // PHASE 1: пусто (скелет). Цикл крутится, изоляция/победа уже работают.
  }

  /** @param {number} slot */
  markSlotDead(slot) {
    this.alive.set(slot, false);
  }

  /**
   * Выбывшие с прошлого тика (Phase 2: чьи замки/все здания разрушены).
   * @returns {number[]}
   */
  consumeEliminations() {
    if (this.pendingEliminations.length === 0) {
      return [];
    }
    const out = this.pendingEliminations;
    this.pendingEliminations = [];
    return out;
  }

  /**
   * Снимок мира для рассылки клиентам.
   * PHASE 2: сериализует клетки state + список рыцарей + ресурсы/апгрейды по слотам.
   * @returns {{ tick: number, t: number }}
   */
  collectSnapshot() {
    return { tick: this.tickCount, t: this.elapsedMs };
  }
}

module.exports = { Simulation };
