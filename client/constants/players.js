import { TILE_SIZE } from './sizes.js';

export const PLAYER_COLORS = {
  yellow: '#d8c840',
  blue: '#4f7de8',
  red: '#d84848',
  green: '#5fae5f',
};

export const PLAYER_PROFILES = [
  {
    userId: 'yellow-player',
    teamId: 'yellow-player',
    title: 'Yellow player',
    color: PLAYER_COLORS.yellow,
    castleStart: { x: 6 * TILE_SIZE, y: 6 * TILE_SIZE },
  },
  {
    userId: 'blue-player',
    teamId: 'blue-player',
    title: 'Blue player',
    color: PLAYER_COLORS.blue,
    castleStart: { x: 56 * TILE_SIZE, y: 6 * TILE_SIZE },
  },
  {
    userId: 'red-player',
    teamId: 'red-player',
    title: 'Red player',
    color: PLAYER_COLORS.red,
    castleStart: { x: 6 * TILE_SIZE, y: 56 * TILE_SIZE },
  },
  {
    userId: 'green-player',
    teamId: 'green-player',
    title: 'Green player',
    color: PLAYER_COLORS.green,
    castleStart: { x: 56 * TILE_SIZE, y: 56 * TILE_SIZE },
  },
];

/**
 * @param {string | null | undefined} userId
 * @returns {string | undefined}
 */
export function getPlayerTeamId(userId) {
  if (!userId) {
    return undefined;
  }
  const profile = PLAYER_PROFILES.find((p) => p.userId === userId);
  return profile?.teamId ?? userId;
}

/**
 * @param {string | null | undefined} userIdA
 * @param {string | null | undefined} userIdB
 */
export function arePlayersAllies(userIdA, userIdB) {
  if (!userIdA || !userIdB) {
    return false;
  }
  if (userIdA === userIdB) {
    return true;
  }
  return getPlayerTeamId(userIdA) === getPlayerTeamId(userIdB);
}

/**
 * @param {string | null | undefined} userIdA
 * @param {string | null | undefined} userIdB
 */
export function arePlayersEnemies(userIdA, userIdB) {
  if (!userIdA || !userIdB) {
    return false;
  }
  return !arePlayersAllies(userIdA, userIdB);
}

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
