'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');

const config = require('./config');
const { RoomManager } = require('./rooms/room-manager');
const { registerHandlers } = require('./net/handlers');

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
registerHandlers(io, roomManager);

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
