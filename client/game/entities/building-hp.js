import { BUILDING_MAX_HP } from '../../constants/structure-hp.js';

/**
 * Общее HP для всех клеток отпечатка здания (одна ссылка на объект).
 *
 * @returns {{ hp: number; maxHp: number; regenerates: true }}
 */
export function createBuildingHp() {
  return {
    hp: BUILDING_MAX_HP,
    maxHp: BUILDING_MAX_HP,
    regenerates: true,
    /** Время последнего урона (`performance.now()`); для полоски HP. */
    lastDamagedAtMs: 0,
  };
}
