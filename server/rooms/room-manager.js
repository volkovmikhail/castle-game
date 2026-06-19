'use strict';

const config = require('../config');
const { Room } = require('./room');

/** Без похожих символов (0/O, 1/I) — код легко продиктовать. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Реестр всех активных сессий в этом процессе. Один процесс Node держит много
 * комнат одновременно (event loop + socket.io rooms), без БД — всё в памяти.
 */
class RoomManager {
  /** @param {import('socket.io').Server} io */
  constructor(io) {
    this.io = io;
    /** @type {Map<string, Room>} roomId -> Room */
    this.rooms = new Map();
    /** @type {Map<string, string>} code -> roomId */
    this.codes = new Map();
    /** @type {Map<string, string>} socketId -> roomId */
    this.socketRoom = new Map();

    this.cleanupTimer = setInterval(() => this.#cleanupEmptyRooms(), config.EMPTY_ROOM_TTL_MS);
  }

  /** @returns {Room} */
  createRoom() {
    const id = this.#generateId();
    const code = this.#generateCode();
    const room = new Room({ id, code, io: this.io });
    this.rooms.set(id, room);
    this.codes.set(code, id);
    return room;
  }

  /** @param {string} code @returns {Room | null} */
  getByCode(code) {
    const id = this.codes.get(String(code ?? '').trim().toUpperCase());
    return id ? this.rooms.get(id) ?? null : null;
  }

  /** @param {string} roomId @returns {Room | null} */
  get(roomId) {
    return this.rooms.get(roomId) ?? null;
  }

  /** @param {string} socketId @returns {Room | null} */
  getBySocket(socketId) {
    const roomId = this.socketRoom.get(socketId);
    return roomId ? this.rooms.get(roomId) ?? null : null;
  }

  /** @param {string} socketId @param {string} roomId */
  bindSocket(socketId, roomId) {
    this.socketRoom.set(socketId, roomId);
  }

  /** @param {string} socketId */
  unbindSocket(socketId) {
    this.socketRoom.delete(socketId);
  }

  /** @param {Room} room */
  destroyRoom(room) {
    room.dispose();
    this.rooms.delete(room.id);
    this.codes.delete(room.code);
  }

  #cleanupEmptyRooms() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.isEmpty() && room.emptyAt && now - room.emptyAt >= config.EMPTY_ROOM_TTL_MS) {
        this.destroyRoom(room);
      }
    }
  }

  #generateId() {
    return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  #generateCode() {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let code = '';
      for (let i = 0; i < config.ROOM_CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.codes.has(code)) {
        return code;
      }
    }
    // Практически недостижимо при разумном числе комнат.
    throw new Error('Failed to allocate a unique room code.');
  }
}

module.exports = { RoomManager };
