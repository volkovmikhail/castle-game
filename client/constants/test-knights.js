import { TILE_SIZE } from './sizes.js';

/**
 * Тестовые вражеские рыцари у жёлтого замка (локальный игрок).
 * Выключите перед релизом или когда PvP не нужен.
 */
export const TEST_KNIGHTS_ENABLED = false;

/**
 * Смещения левого верха спрайта от `castleStart` жёлтого игрока.
 *
 * @type {{ ownerUserId: string; offsetX: number; offsetY: number; healthLevel?: number; attackLevel?: number }[]}
 */
export const TEST_KNIGHT_SPAWNS_NEAR_YELLOW_CASTLE = [
  { ownerUserId: 'blue-player', offsetX: TILE_SIZE * 2, offsetY: 0 },
  { ownerUserId: 'blue-player', offsetX: TILE_SIZE * 3, offsetY: 0 },
  { ownerUserId: 'blue-player', offsetX: TILE_SIZE * 4, offsetY: 0 },
  { ownerUserId: 'blue-player', offsetX: TILE_SIZE * 5, offsetY: 0 },
  { ownerUserId: 'blue-player', offsetX: TILE_SIZE * 7, offsetY: 0 },
  { ownerUserId: 'blue-player', offsetX: TILE_SIZE * 8, offsetY: 0 },
  { ownerUserId: 'blue-player', offsetX: TILE_SIZE * 9, offsetY: 0 },
  { ownerUserId: 'blue-player', offsetX: TILE_SIZE * 10, offsetY: 0 },
  { ownerUserId: 'blue-player', offsetX: TILE_SIZE * 2, offsetY: TILE_SIZE },
  { ownerUserId: 'red-player', offsetX: TILE_SIZE, offsetY: TILE_SIZE * 2 },
  { ownerUserId: 'red-player', offsetX: TILE_SIZE * 2, offsetY: TILE_SIZE * 2 },
];
