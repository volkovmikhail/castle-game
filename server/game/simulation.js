/**
 * Тонкая обёртка над WorldSim для Room: фиксированный API тика/намерений/снапшота
 * и отслеживание версии карты, уже доставленной клиентам (чтобы слать `cells`
 * только при изменении).
 */

import { WorldSim } from './world-sim.js';

export class Simulation {
  /**
   * @param {{ seed: number, slots: import('../constants/slots.js').PlayerSlot[] }} opts
   */
  constructor({ seed, slots }) {
    this.world = new WorldSim({ seed, slots });
    this.tickCount = 0;
    /** Версия карты, уже разосланная клиентам (0 => первый снапшот включит cells). */
    this.lastSentVersion = 0;
  }

  getWorldInfo() {
    return this.world.getWorldInfo();
  }

  /** @param {number} dtMs */
  tick(dtMs) {
    this.world.tick(dtMs);
  }

  /**
   * @param {number} slot
   * @param {{ type: string, payload: any }} intent
   */
  applyIntent(slot, intent) {
    return this.world.applyIntent(slot, intent);
  }

  /** @param {number} slot */
  markSlotDead(slot) {
    this.world.markSlotDead(slot);
  }

  /** @returns {number[]} */
  consumeEliminations() {
    return this.world.drainEliminations();
  }

  collectSnapshot() {
    // Кейфрейм ~раз в 2с: шлём полную карту даже без изменений — страховка от
    // пропущенного снапшота с cells (и задел под reconnect).
    const keyframe = this.tickCount % 40 === 0;
    const snap = this.world.collectSnapshot(keyframe ? -1 : this.lastSentVersion);
    if (snap.cells !== null) {
      this.lastSentVersion = snap.v;
    }
    return { tick: this.tickCount, ...snap };
  }
}
