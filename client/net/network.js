import { C2S, S2C, INTENT } from './protocol.js';

/**
 * Тонкая обёртка над socket.io-клиентом. Глобальный `io` приходит из
 * <script src="/socket.io/socket.io.js"> (подключён в index.html).
 *
 * Клиент шлёт серверу намерения (intent) и подписывается на состояние комнаты /
 * старт / снапшоты / финал. Источник правды — сервер.
 */
export class Network {
  constructor() {
    /** @type {import('socket.io-client').Socket | null} */
    this.socket = null;
  }

  /** @returns {Promise<void>} резолвится после установления соединения. */
  connect() {
    return new Promise((resolve, reject) => {
      const ioFactory = /** @type {any} */ (window).io;
      if (typeof ioFactory !== 'function') {
        reject(new Error('socket.io client not loaded (check the <script> tag).'));
        return;
      }
      this.socket = ioFactory({ transports: ['websocket', 'polling'] });
      this.socket.on('connect', () => resolve());
      this.socket.on('connect_error', (err) => reject(err));
    });
  }

  get id() {
    return this.socket?.id ?? null;
  }

  /**
   * Emit с ожиданием ack от сервера.
   * @param {string} event
   * @param {any} [data]
   * @returns {Promise<any>}
   */
  request(event, data) {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ ok: false, error: 'Not connected.' });
        return;
      }
      this.socket.emit(event, data, resolve);
    });
  }

  // ── Лобби ────────────────────────────────────────────────────────────────

  /** @param {string} name */
  createRoom(name) {
    return this.request(C2S.ROOM_CREATE, { name });
  }

  /** @param {string} code @param {string} name */
  joinRoom(code, name) {
    return this.request(C2S.ROOM_JOIN, { code, name });
  }

  leaveRoom() {
    return this.request(C2S.ROOM_LEAVE, {});
  }

  /** @param {boolean} ready */
  setReady(ready) {
    this.socket?.emit(C2S.LOBBY_READY, { ready });
  }

  startGame() {
    return this.request(C2S.LOBBY_START, {});
  }

  // ── Быстрый матч ─────────────────────────────────────────────────────────

  /** Встать в очередь быстрого матча. @param {string} name */
  findMatch(name) {
    return this.request(C2S.MATCH_FIND, { name });
  }

  /** Покинуть очередь быстрого матча. */
  cancelMatch() {
    return this.request(C2S.MATCH_CANCEL, {});
  }

  /**
   * Отправить игровое намерение (Phase 2).
   * @param {string} type @param {any} payload
   */
  sendIntent(type, payload) {
    return this.request(C2S.INTENT, { type, payload });
  }

  // ── Подписки ───────────────────────────────────────────────────────────────

  /** @param {(state: any) => void} cb */
  onRoomState(cb) {
    this.socket?.on(S2C.ROOM_STATE, cb);
  }

  /** @param {(state: any) => void} cb состояние очереди быстрого матча. */
  onMatchState(cb) {
    this.socket?.on(S2C.MATCH_STATE, cb);
  }

  /** @param {(data: { online: number }) => void} cb число игроков онлайн. */
  onPresence(cb) {
    this.socket?.on(S2C.PRESENCE, cb);
  }

  /** @param {(data: any) => void} cb */
  onGameStart(cb) {
    this.socket?.on(S2C.GAME_START, cb);
  }

  /** @param {(snap: any) => void} cb */
  onSnapshot(cb) {
    this.socket?.on(S2C.GAME_SNAPSHOT, cb);
  }

  /** @param {(data: any) => void} cb */
  onGameEvent(cb) {
    this.socket?.on(S2C.GAME_EVENT, cb);
  }

  /** @param {(data: any) => void} cb */
  onGameOver(cb) {
    this.socket?.on(S2C.GAME_OVER, cb);
  }

  /** @param {(err: any) => void} cb */
  onError(cb) {
    this.socket?.on(S2C.ERROR, cb);
  }

  /** @param {() => void} cb */
  onDisconnect(cb) {
    this.socket?.on('disconnect', cb);
  }
}

export { INTENT };
