/**
 * Имена событий socket.io — зеркало server/net/protocol.js. Держать синхронно.
 */
export const C2S = {
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  LOBBY_READY: 'lobby:ready',
  LOBBY_START: 'lobby:start',
  INTENT: 'intent',
};

export const S2C = {
  ROOM_STATE: 'room:state',
  GAME_START: 'game:start',
  GAME_SNAPSHOT: 'game:snapshot',
  GAME_EVENT: 'game:event',
  GAME_OVER: 'game:over',
  ERROR: 'net:error',
};

/** Типы игровых намерений (Phase 2). */
export const INTENT = {
  PLACE_BUILDING: 'placeBuilding',
  TRAIN_KNIGHT: 'trainKnight',
  MOVE_ORDER: 'moveOrder',
  SHOP_EXCHANGE: 'shopExchange',
  UPGRADE_ARMY: 'upgradeArmy',
  HARVEST_FARM: 'harvestFarm',
};
