import { C2S, S2C } from './protocol.js';

/**
 * Регистрирует обработчики socket.io. Вся логика комнат — в RoomManager/Room;
 * здесь только маршрутизация событий и аккуратные ack-ответы.
 *
 * @param {import('socket.io').Server} io
 * @param {import('../rooms/room-manager').RoomManager} roomManager
 * @param {import('../rooms/matchmaker.js').Matchmaker} matchmaker
 */
export function registerHandlers(io, roomManager, matchmaker) {
  /** Разослать всем актуальное число подключённых сокетов. */
  const broadcastPresence = () => io.emit(S2C.PRESENCE, { online: io.engine.clientsCount });

  io.on('connection', (socket) => {
    // eslint-disable-next-line no-console
    console.log(`[socket] connected ${socket.id}`);
    // Откладываем на тик: клиент навешивает слушатель presence уже после события
    // connect, а синхронный emit ушёл бы раньше подписки (и он бы не увидел себя).
    setImmediate(broadcastPresence);

    /** Безопасный вызов ack-колбэка (последний аргумент события). */
    const reply = (cb, payload) => {
      if (typeof cb === 'function') {
        cb(payload);
      }
    };

    /** Текущая комната сокета (если есть). */
    const currentRoom = () => roomManager.getBySocket(socket.id);

    /** Выйти из текущей комнаты (общий путь для leave/disconnect/reconnect). */
    const leaveCurrent = () => {
      const room = currentRoom();
      if (!room) {
        return;
      }
      room.removePlayer(socket.id);
      socket.leave(room.id);
      roomManager.unbindSocket(socket.id);
      if (!room.isEmpty()) {
        room.broadcastState();
      }
    };

    /** Полностью вывести сокет из лобби: и из комнаты, и из очереди матча. */
    const leaveAll = () => {
      matchmaker.leave(socket.id);
      leaveCurrent();
    };

    socket.on(C2S.ROOM_CREATE, (data, cb) => {
      try {
        leaveAll();
        const room = roomManager.createRoom();
        const player = room.addPlayer(socket.id, data?.name);
        if (!player) {
          roomManager.destroyRoom(room);
          return reply(cb, { ok: false, error: 'Could not create room.' });
        }
        socket.join(room.id);
        roomManager.bindSocket(socket.id, room.id);
        reply(cb, {
          ok: true,
          roomId: room.id,
          code: room.code,
          you: room.publicPlayers().find((p) => p.id === socket.id),
          room: room.publicState(),
        });
        room.broadcastState();
        // eslint-disable-next-line no-console
        console.log(`[room ${room.code}] created by ${socket.id}`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ROOM_CREATE]', err);
        reply(cb, { ok: false, error: 'Server error.' });
      }
    });

    socket.on(C2S.ROOM_JOIN, (data, cb) => {
      try {
        const room = roomManager.getByCode(data?.code);
        if (!room) {
          return reply(cb, { ok: false, error: 'Room not found.' });
        }
        if (room.status !== 'lobby') {
          return reply(cb, { ok: false, error: 'Game already started.' });
        }
        leaveAll();
        const player = room.addPlayer(socket.id, data?.name);
        if (!player) {
          return reply(cb, { ok: false, error: 'Room is full.' });
        }
        socket.join(room.id);
        roomManager.bindSocket(socket.id, room.id);
        reply(cb, {
          ok: true,
          roomId: room.id,
          code: room.code,
          you: room.publicPlayers().find((p) => p.id === socket.id),
          room: room.publicState(),
        });
        room.broadcastState();
        // eslint-disable-next-line no-console
        console.log(`[room ${room.code}] ${socket.id} joined (slot ${player.slot})`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ROOM_JOIN]', err);
        reply(cb, { ok: false, error: 'Server error.' });
      }
    });

    socket.on(C2S.ROOM_LEAVE, (_data, cb) => {
      leaveAll();
      reply(cb, { ok: true });
    });

    // Быстрый матч: нажатие Find Game = игрок готов, лобби не показываем.
    socket.on(C2S.MATCH_FIND, (data, cb) => {
      try {
        leaveCurrent(); // покидаем комнату по коду, если были в ней
        matchmaker.join(socket.id, data?.name);
        reply(cb, { ok: true });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[MATCH_FIND]', err);
        reply(cb, { ok: false, error: 'Server error.' });
      }
    });

    socket.on(C2S.MATCH_CANCEL, (_data, cb) => {
      matchmaker.leave(socket.id);
      reply(cb, { ok: true });
    });

    socket.on(C2S.LOBBY_READY, (data) => {
      const room = currentRoom();
      if (!room) {
        return;
      }
      room.setReady(socket.id, data?.ready);
      room.broadcastState();
    });

    socket.on(C2S.LOBBY_START, (_data, cb) => {
      const room = currentRoom();
      if (!room) {
        return reply(cb, { ok: false, error: 'You are not in a room.' });
      }
      if (room.hostId !== socket.id) {
        return reply(cb, { ok: false, error: 'Only the host can start the game.' });
      }
      const result = room.start();
      reply(cb, result);
    });

    socket.on(C2S.INTENT, (data, cb) => {
      const room = currentRoom();
      if (!room || room.status !== 'playing' || !room.simulation) {
        return reply(cb, { ok: false, error: 'No active game.' });
      }
      const player = room.players.get(socket.id);
      if (!player) {
        return reply(cb, { ok: false, error: 'Not a participant.' });
      }
      const result = room.simulation.applyIntent(player.slot, data);
      reply(cb, result);
      // PHASE 2: адресные последствия (тост/ресурсы) -> socket.emit(S2C.GAME_EVENT, ...)
    });

    socket.on('disconnect', (reason) => {
      // eslint-disable-next-line no-console
      console.log(`[socket] disconnected ${socket.id} (${reason})`);
      leaveAll();
      // clientsCount оседает после этого события — считаем на следующем тике.
      setImmediate(broadcastPresence);
    });
  });
}
