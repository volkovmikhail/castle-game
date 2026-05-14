/**
 * Вероятность «редкой» флоры при генерации леса: `roll` в [0, ROLL_MAX),
 * если roll < THRESHOLD — один из {@link FOREST_SPAWN_RARE_TILE_KEYS}.
 */
export const FOREST_SPAWN_RARE_ROLL_MAX = 1000;

/** Доля редких тайлов (logs, rock, twoRocks, combinePlants). Например 200 ≈ 20%. */
export const FOREST_SPAWN_RARE_THRESHOLD = 50;

/** Равномерный выбор внутри редкой группы (ниже вероятность, чем у обычных деревьев). */
export const FOREST_SPAWN_RARE_TILE_KEYS = ['logs', 'twoRocks', 'rock', 'combinePlants'];
