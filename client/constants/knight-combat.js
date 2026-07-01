import { TILE_SIZE } from './sizes.js';

/**
 * Авто-атака вражеских рыцарей: если центры ближе этого радиуса (px).
 * ~две клетки. `0` — отключить.
 */
export const KNIGHT_AUTO_ATTACK_ENEMY_RADIUS_PX = TILE_SIZE * 2;
