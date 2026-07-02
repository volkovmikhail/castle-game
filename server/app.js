import http from 'http';
import path from 'path';
import express from 'express';
import { Server } from 'socket.io';

import config from './config.js';
import { RoomManager } from './rooms/room-manager.js';
import { Matchmaker } from './rooms/matchmaker.js';
import { registerHandlers } from './net/handlers.js';

// ── Глобальные предохранители ───────────────────────────────────────────────
// In-memory сессии: процесс ронять нельзя. Логируем и продолжаем — отдельная
// комната может сломаться (там свой try/catch в тике), но процесс выживает.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const app = express();
app.use(express.static(path.resolve('client')));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  // Один процесс, много комнат. Для нескольких процессов позже понадобится
  // sticky sessions + @socket.io/redis-adapter (см. multiplayer.md).
  cors: { origin: true },
});

const roomManager = new RoomManager(io);
const matchmaker = new Matchmaker({ io, roomManager });
registerHandlers(io, roomManager, matchmaker);

// Лёгкий health-эндпоинт: число живых сессий и подключений.
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    rooms: roomManager.rooms.size,
    sockets: io.engine.clientsCount,
    uptimeSec: Math.round(process.uptime()),
  });
});

httpServer.listen(config.HTTP_PORT, () => {
  console.log(`Server running... http://localhost:${config.HTTP_PORT}`);
});
