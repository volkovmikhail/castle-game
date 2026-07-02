/**
 * Имена событий socket.io — единый контракт между клиентом и сервером.
 * Клиентская копия: client/net/protocol.js (держать синхронно).
 */
export const C2S = {
  ROOM_CREATE: 'room:create', // { name }            -> ack({ ok, roomId, code, you, room })
  ROOM_JOIN: 'room:join', //     { code, name }      -> ack({ ok, roomId, you, room, error })
  ROOM_LEAVE: 'room:leave', //   {}                  -> ack({ ok })
  LOBBY_READY: 'lobby:ready', // { ready: boolean }
  LOBBY_START: 'lobby:start', // {}  (только хост)   -> ack({ ok, error })
  MATCH_FIND: 'match:find', //   { name }            -> ack({ ok, error }) быстрый матч
  MATCH_CANCEL: 'match:cancel', // {}                -> ack({ ok }) покинуть очередь
  INTENT: 'intent', //           { type, payload }   (игровые намерения, Phase 2)
};

export const S2C = {
  ROOM_STATE: 'room:state', //   полное состояние лобби/комнаты
  MATCH_STATE: 'match:state', // { count, min, max, counting, remainingMs, players }
  PRESENCE: 'presence', //       { online } — сколько сокетов сейчас подключено
  GAME_START: 'game:start', //   { you, players, seed, world }
  GAME_SNAPSHOT: 'game:snapshot', // снапшот мира (Phase 2)
  GAME_EVENT: 'game:event', //   адресные события игроку (тост, ресурсы, модалки — Phase 2)
  GAME_OVER: 'game:over', //     { winner }
  ERROR: 'net:error', //         { message }
};

/** Игровые намерения (Phase 2). Клиент шлёт INTENT с одним из type. */
export const INTENT = {
  PLACE_BUILDING: 'placeBuilding', // { toolKey, tx, ty, variant? — вариант сарая/дома из призрака }
  TRAIN_KNIGHT: 'trainKnight', //     { worldPx, worldPy }
  MOVE_ORDER: 'moveOrder', //         { wx, wy, knightIds }
  SHOP_EXCHANGE: 'shopExchange', //   { kind, qty }
  UPGRADE_ARMY: 'upgradeArmy', //     { kind }
  UPGRADE_CASTLE: 'upgradeCastle', // { kind: 'range' | 'damage' | 'speed' }
  HARVEST_FARM: 'harvestFarm', //     { tx, ty }
  DEMOLISH_BUILDING: 'demolishBuilding', // { tx, ty } снос своего здания (кроме замка), возврат половины
};
