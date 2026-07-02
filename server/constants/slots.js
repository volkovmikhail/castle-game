/**
 * Сервер — источник правды по идентичности игроков (слот = цвет + стартовый замок).
 * userId совпадает с client/constants/players.js, чтобы клиентский рендер/команды
 * (getPlayerColor, arePlayersAllies, размещение замков) работали без изменений на Phase 1.
 *
 * Координаты замков — в пикселях (TILE_SIZE = 16). Мир 64×64 тайла = 1024×1024 px.
 */
const TILE_SIZE = 16;

/**
 * @typedef {{
 *   slot: number,
 *   userId: string,
 *   teamId: string,
 *   title: string,
 *   color: string,
 *   castleStart: { x: number, y: number },
 * }} PlayerSlot
 */

/** @type {readonly PlayerSlot[]} */
const PLAYER_SLOTS = [
  {
    slot: 0,
    userId: 'yellow-player',
    teamId: 'yellow-player',
    title: 'Yellow player',
    color: '#d8c840',
    castleStart: { x: 6 * TILE_SIZE, y: 6 * TILE_SIZE },
  },
  {
    slot: 1,
    userId: 'blue-player',
    teamId: 'blue-player',
    title: 'Blue player',
    color: '#4f7de8',
    castleStart: { x: 56 * TILE_SIZE, y: 6 * TILE_SIZE },
  },
  {
    slot: 2,
    userId: 'red-player',
    teamId: 'red-player',
    title: 'Red player',
    color: '#d84848',
    castleStart: { x: 6 * TILE_SIZE, y: 56 * TILE_SIZE },
  },
  {
    slot: 3,
    userId: 'green-player',
    teamId: 'green-player',
    title: 'Green player',
    color: '#5fae5f',
    castleStart: { x: 56 * TILE_SIZE, y: 56 * TILE_SIZE },
  },
];

export { PLAYER_SLOTS, TILE_SIZE };
