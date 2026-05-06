import { TILE_SIZE } from './sizes.js';

export const PLAYER_COLORS = {
  yellow: '#d8c840',
  blue: '#4f7de8',
  red: '#d84848',
};

export const PLAYER_PROFILES = [
  {
    userId: 'yellow-player',
    title: 'Жёлтый игрок',
    color: PLAYER_COLORS.yellow,
    castleStart: { x: 6 * TILE_SIZE, y: 6 * TILE_SIZE },
  },
  {
    userId: 'blue-player',
    title: 'Синий игрок',
    color: PLAYER_COLORS.blue,
    castleStart: { x: 56 * TILE_SIZE, y: 6 * TILE_SIZE },
  },
  {
    userId: 'red-player',
    title: 'Красный игрок',
    color: PLAYER_COLORS.red,
    castleStart: { x: 31 * TILE_SIZE, y: 56 * TILE_SIZE },
  },
];

/**
 * @param {string | null | undefined} userId
 * @returns {string | undefined} CSS-цвет или undefined, если игрок не найден
 */
export function getPlayerColor(userId) {
  if (!userId) {
    return undefined;
  }
  const profile = PLAYER_PROFILES.find((p) => p.userId === userId);
  return profile?.color;
}
