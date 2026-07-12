import config from '../config.js';
import { PLAYER_SLOTS, SLOT_ASSIGN_ORDER } from '../constants/slots.js';
import { S2C } from '../net/protocol.js';
import { Simulation } from '../game/simulation.js';

/**
 * @typedef {{
 *   socketId: string,
 *   name: string,
 *   slot: number,
 *   ready: boolean,
 *   connected: boolean,
 *   alive: boolean,
 * }} Player
 */

/**
 * Одна игровая сессия: лобби -> игра -> финал. Всё состояние живёт в памяти
 * процесса. Тик симуляции изолирован try/catch — баг одной комнаты не роняет
 * остальные сессии и сам процесс Node.
 */
class Room {
  /**
   * @param {{ id: string, code: string, io: import('socket.io').Server }} opts
   */
  constructor({ id, code, io }) {
    this.id = id;
    this.code = code;
    this.io = io;

    /** 'lobby' | 'playing' | 'over' | 'broken' */
    this.status = 'lobby';

    /** @type {Map<string, Player>} ключ — socketId. */
    this.players = new Map();

    /** Занятые слоты: индекс слота -> socketId | null. */
    this.slotOwners = new Array(config.MAX_PLAYERS).fill(null);

    /** @type {string | null} */
    this.hostId = null;

    this.createdAt = Date.now();
    this.emptyAt = null;
    this.seed = (Math.random() * 0xffffffff) >>> 0;

    /** @type {Simulation | null} */
    this.simulation = null;
    /** @type {NodeJS.Timeout | null} */
    this.loopTimer = null;
    this.lastTickAt = 0;
    this.tickErrors = 0;

    /** @type {{ slot: number, name: string } | null} */
    this.winner = null;
  }

  get playerCount() {
    return this.players.size;
  }

  /** Подключённые сейчас игроки (в игре отключённые остаются для подсчёта победы). */
  connectedCount() {
    let n = 0;
    for (const p of this.players.values()) {
      if (p.connected) {
        n++;
      }
    }
    return n;
  }

  /** Комната «пуста» (готова к удалению), когда не осталось подключённых сокетов. */
  isEmpty() {
    return this.connectedCount() === 0;
  }

  /** Следующий свободный слот (в порядке SLOT_ASSIGN_ORDER) или -1, если комната заполнена. */
  #firstFreeSlot() {
    return SLOT_ASSIGN_ORDER.find((slot) => this.slotOwners[slot] === null) ?? -1;
  }

  /**
   * Добавляет игрока в лобби. Возвращает его Player или null, если нет места /
   * игра уже идёт.
   *
   * @param {string} socketId
   * @param {string} name
   * @returns {Player | null}
   */
  addPlayer(socketId, name) {
    if (this.status !== 'lobby') {
      return null;
    }
    if (this.players.has(socketId)) {
      return this.players.get(socketId);
    }
    const slot = this.#firstFreeSlot();
    if (slot === -1) {
      return null;
    }

    /** @type {Player} */
    const player = {
      socketId,
      name: this.#sanitizeName(name, slot),
      slot,
      ready: false,
      connected: true,
      alive: true,
    };
    this.players.set(socketId, player);
    this.slotOwners[slot] = socketId;
    if (this.hostId === null) {
      this.hostId = socketId;
    }
    this.emptyAt = null;
    return player;
  }

  /**
   * @param {string} socketId
   * @returns {boolean} был ли игрок в комнате
   */
  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) {
      return false;
    }

    if (this.status === 'lobby') {
      this.players.delete(socketId);
      this.slotOwners[player.slot] = null;
    } else {
      // В игре/финале слот сохраняем (нужен для подсчёта победы), помечаем
      // отключённым; в бою выход = выбывание (потеря).
      player.connected = false;
      if (this.status === 'playing') {
        this.#eliminate(player.slot);
      }
    }

    if (this.hostId === socketId) {
      const nextConnected = [...this.players.values()].find((p) => p.connected);
      this.hostId = nextConnected ? nextConnected.socketId : null;
    }
    if (this.isEmpty()) {
      this.emptyAt = Date.now();
      this.#stopLoop(); // не крутим тик у брошенной партии до её удаления по TTL
    }
    return true;
  }

  /**
   * @param {string} socketId
   * @param {boolean} ready
   */
  setReady(socketId, ready) {
    const player = this.players.get(socketId);
    if (player && this.status === 'lobby') {
      player.ready = Boolean(ready);
    }
  }

  /** Условие старта: лобби, достаточно игроков, все готовы. */
  canStart() {
    if (this.status !== 'lobby') {
      return false;
    }
    if (this.players.size < config.MIN_PLAYERS) {
      return false;
    }
    for (const p of this.players.values()) {
      if (!p.ready) {
        return false;
      }
    }
    return true;
  }

  /**
   * Запуск партии: создаёт симуляцию и серверный игровой цикл.
   *
   * @returns {{ ok: boolean, error?: string }}
   */
  start() {
    if (!this.canStart()) {
      return { ok: false, error: 'Not all players are ready or too few players.' };
    }
    this.status = 'playing';

    const activeSlots = this.#activeSlotDefs();
    this.simulation = new Simulation({ seed: this.seed, slots: activeSlots });

    // Каждому клиенту — его слот и полный список участников.
    for (const player of this.players.values()) {
      this.io.to(player.socketId).emit(S2C.GAME_START, {
        you: this.#slotDef(player.slot),
        players: this.publicPlayers(),
        world: this.simulation.getWorldInfo(),
        seed: this.seed,
      });
    }

    this.#startLoop();
    this.broadcastState();
    return { ok: true };
  }

  #startLoop() {
    this.lastTickAt = Date.now();
    this.tickErrors = 0;
    this.loopTimer = setInterval(() => this.#tick(), config.TICK_MS);
  }

  /** Один серверный тик. Полностью изолирован — исключение не выходит наружу. */
  #tick() {
    if (this.status !== 'playing' || !this.simulation) {
      return;
    }
    const now = Date.now();
    const dtMs = Math.min(250, now - this.lastTickAt); // клампим скачки (GC/пауза)
    this.lastTickAt = now;

    try {
      this.simulation.tick(dtMs);

      // Симуляция сообщает о выбывших (например, разрушен замок).
      for (const slot of this.simulation.consumeEliminations()) {
        this.#eliminate(slot);
      }

      this.simulation.tickCount++;
      if (this.simulation.tickCount % config.SNAPSHOT_EVERY_TICKS === 0) {
        this.io.to(this.id).emit(S2C.GAME_SNAPSHOT, this.simulation.collectSnapshot());
      }
    } catch (err) {
      this.tickErrors++;
      // eslint-disable-next-line no-console
      console.error(`[room ${this.code}] tick error (${this.tickErrors}):`, err);
      if (this.tickErrors >= config.MAX_TICK_ERRORS) {
        // eslint-disable-next-line no-console
        console.error(`[room ${this.code}] too many tick errors — halting this room only.`);
        this.status = 'broken';
        this.#stopLoop();
        this.io.to(this.id).emit(S2C.ERROR, { message: 'Game crashed on the server.' });
      }
    }
  }

  #stopLoop() {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
  }

  /**
   * Выбывание игрока по слоту + проверка победы (остался один — конец).
   *
   * @param {number} slot
   */
  #eliminate(slot) {
    const socketId = this.slotOwners[slot];
    const player = socketId ? this.players.get(socketId) : null;
    if (player) {
      if (!player.alive) {
        return;
      }
      player.alive = false;
    }
    this.simulation?.markSlotDead(slot);

    const alive = [...this.players.values()].filter((p) => p.alive);
    if (this.status === 'playing' && alive.length <= 1) {
      this.#finish(alive[0] ?? null);
    } else {
      this.broadcastState();
    }
  }

  /** @param {Player | null} winner */
  #finish(winner) {
    this.status = 'over';
    this.#stopLoop();
    this.winner = winner ? { slot: winner.slot, name: winner.name } : null;
    this.io.to(this.id).emit(S2C.GAME_OVER, { winner: this.winner });
    this.broadcastState();
  }

  /** Освобождение ресурсов комнаты перед удалением из памяти. */
  dispose() {
    this.#stopLoop();
    this.simulation = null;
    this.players.clear();
  }

  // ── Сериализация для клиента ────────────────────────────────────────────

  /** @param {number} slot */
  #slotDef(slot) {
    return PLAYER_SLOTS[slot];
  }

  #activeSlotDefs() {
    return [...this.players.values()]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => PLAYER_SLOTS[p.slot]);
  }

  publicPlayers() {
    return [...this.players.values()]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => {
        const def = PLAYER_SLOTS[p.slot];
        return {
          id: p.socketId,
          name: p.name,
          slot: p.slot,
          userId: def.userId,
          color: def.color,
          title: def.title,
          ready: p.ready,
          connected: p.connected,
          alive: p.alive,
          isHost: p.socketId === this.hostId,
        };
      });
  }

  /** Полное публичное состояние комнаты (рассылается при любом изменении лобби). */
  publicState() {
    return {
      roomId: this.id,
      code: this.code,
      status: this.status,
      hostId: this.hostId,
      minPlayers: config.MIN_PLAYERS,
      maxPlayers: config.MAX_PLAYERS,
      players: this.publicPlayers(),
      canStart: this.canStart(),
      winner: this.winner,
    };
  }

  broadcastState() {
    this.io.to(this.id).emit(S2C.ROOM_STATE, this.publicState());
  }

  /**
   * @param {string} name
   * @param {number} slot
   */
  #sanitizeName(name, slot) {
    const trimmed = String(name ?? '').trim().slice(0, 20);
    return trimmed || PLAYER_SLOTS[slot].title;
  }
}

export { Room };
