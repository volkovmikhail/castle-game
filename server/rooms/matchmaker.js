import config from '../config.js';
import { S2C } from '../net/protocol.js';

/**
 * Очередь быстрого матча ("Find Game"). Игрок, нажавший Find Game, тем самым уже
 * подтвердил готовность играть — окно лобби ему не показывается. Держим одну
 * формирующуюся очередь; когда пора стартовать, из неё создаётся настоящая Room
 * (все игроки помечаются ready) и запускается партия.
 *
 * Правила авто-старта:
 *  - набралось MAX_PLAYERS  → старт немедленно;
 *  - набралось MIN_PLAYERS  → запускается обратный отсчёт MATCH_FILL_MS, по его
 *    истечении партия стартует с текущим числом игроков (2–3);
 *  - число упало ниже MIN_PLAYERS → отсчёт отменяется, ждём снова.
 *
 * Всё состояние — в памяти процесса, как и у остального мультиплеера.
 */
export class Matchmaker {
  /**
   * @param {{ io: import('socket.io').Server, roomManager: import('./room-manager.js').RoomManager }} opts
   */
  constructor({ io, roomManager }) {
    this.io = io;
    this.roomManager = roomManager;

    /** @type {{ socketId: string, name: string }[]} игроки в очереди (по порядку входа). */
    this.queue = [];
    /** @type {NodeJS.Timeout | null} таймер авто-старта по добору. */
    this.countdownTimer = null;
    /** ts (ms) момента авто-старта; null — отсчёт не идёт. */
    this.startsAt = null;
  }

  #inQueue(socketId) {
    return this.queue.some((e) => e.socketId === socketId);
  }

  /**
   * Поставить игрока в очередь быстрого матча (идемпотентно).
   *
   * @param {string} socketId
   * @param {string} name
   */
  join(socketId, name) {
    if (this.#inQueue(socketId)) {
      return;
    }
    this.queue.push({ socketId, name: String(name ?? '').trim().slice(0, 20) });
    this.#evaluate();
  }

  /**
   * Убрать игрока из очереди (Cancel, выход, дисконнект). Безопасно вызывать,
   * даже если игрока в очереди нет.
   *
   * @param {string} socketId
   */
  leave(socketId) {
    const before = this.queue.length;
    this.queue = this.queue.filter((e) => e.socketId !== socketId);
    if (this.queue.length !== before) {
      this.#evaluate();
    }
  }

  /** Пересчёт таймеров после любого изменения очереди + рассылка состояния. */
  #evaluate() {
    const n = this.queue.length;

    if (n >= config.MAX_PLAYERS) {
      this.#launch();
      return;
    }

    if (n >= config.MIN_PLAYERS) {
      if (this.startsAt === null) {
        this.startsAt = Date.now() + config.MATCH_FILL_MS;
        this.countdownTimer = setTimeout(() => this.#launch(), config.MATCH_FILL_MS);
      }
    } else {
      this.#clearCountdown();
    }

    this.#broadcast();
  }

  #clearCountdown() {
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.startsAt = null;
  }

  /**
   * Создаёт комнату из текущей очереди и запускает партию. Отфильтровывает
   * отвалившиеся сокеты; если после фильтрации осталось меньше MIN_PLAYERS —
   * старт откладывается (ждём новых игроков).
   */
  #launch() {
    this.#clearCountdown();

    const alive = this.queue.filter((e) => this.io.sockets.sockets.has(e.socketId));
    if (alive.length < config.MIN_PLAYERS) {
      // Кто-то отвалился прямо перед стартом — возвращаемся в режим ожидания.
      this.queue = alive;
      this.#evaluate();
      return;
    }

    const entries = alive.slice(0, config.MAX_PLAYERS);
    this.queue = [];

    const room = this.roomManager.createRoom();
    for (const entry of entries) {
      const socket = this.io.sockets.sockets.get(entry.socketId);
      if (!socket) {
        continue;
      }
      const player = room.addPlayer(entry.socketId, entry.name);
      if (!player) {
        continue;
      }
      socket.join(room.id);
      this.roomManager.bindSocket(entry.socketId, room.id);
      room.setReady(entry.socketId, true);
    }

    if (room.playerCount < config.MIN_PLAYERS) {
      this.roomManager.destroyRoom(room);
      this.#evaluate();
      return;
    }

    room.start();
    // eslint-disable-next-line no-console
    console.log(`[matchmaker] launched room ${room.code} with ${room.playerCount} players`);
  }

  /** Текущее публичное состояние очереди (для match:state). */
  state() {
    return {
      count: this.queue.length,
      min: config.MIN_PLAYERS,
      max: config.MAX_PLAYERS,
      counting: this.startsAt !== null,
      remainingMs: this.startsAt !== null ? Math.max(0, this.startsAt - Date.now()) : null,
      players: this.queue.map((e) => e.name),
    };
  }

  #broadcast() {
    const payload = this.state();
    for (const entry of this.queue) {
      this.io.to(entry.socketId).emit(S2C.MATCH_STATE, payload);
    }
  }
}
