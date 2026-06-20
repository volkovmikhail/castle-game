import { BUILDING_MAX_HP } from '../../constants/structure-hp.js';

/**
 * Общее HP для всех клеток отпечатка здания (одна ссылка на объект).
 *
 * @param {number} [maxHp] переопределение максимума (например, для замка)
 * @returns {{ hp: number; maxHp: number; regenerates: true }}
 */
export function createBuildingHp(maxHp = BUILDING_MAX_HP) {
  return {
    hp: maxHp,
    maxHp,
    regenerates: true,
    /** Время последнего урона (`performance.now()`); для полоски HP. */
    lastDamagedAtMs: 0,
  };
}
