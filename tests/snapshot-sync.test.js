/**
 * Проверка сетевого контракта Phase 2, на который опирается клиент-зеркало:
 * после старта приходит game:snapshot с картой/рыцарями/игроками, а намерения
 * (постройка, найм) отражаются в следующих снапшотах.
 *
 * Сам поднимает сервер. `node tests/snapshot-sync.test.js`.
 */

import assert from 'assert';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { io } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TEST_PORT) || 4111;
const URL = `http://localhost:${PORT}`;

const connect = () => io(URL, { transports: ['websocket'], forceNew: true });
const emitAck = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const once = (s, ev, t = 3000) =>
  new Promise((res, rej) => {
    const id = setTimeout(() => rej(new Error(`timeout "${ev}"`)), t);
    s.once(ev, (d) => {
      clearTimeout(id);
      res(d);
    });
  });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function track(socket, event) {
  const box = { latest: null, count: 0 };
  socket.on(event, (d) => {
    box.latest = d;
    box.count++;
  });
  return box;
}
async function waitUntil(pred, label, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = pred();
    if (v) {
      return v;
    }
    await delay(20);
  }
  throw new Error(`timeout waiting for ${label}`);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['server/app.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const t = setTimeout(() => reject(new Error('server did not start')), 5000);
    child.stdout.on('data', (b) => b.toString().includes('Server running') && (clearTimeout(t), resolve(child)));
    child.stderr.on('data', (b) => process.stderr.write(`[server] ${b}`));
  });
}

/** Найти renderable-клетку в снапшоте по координатам. */
const cellAt = (snap, x, y) => snap.cells?.find((c) => c[0] === x && c[1] === y);

async function run() {
  const server = await startServer();
  const sockets = [];
  try {
    const a = connect();
    const b = connect();
    sockets.push(a, b);
    await Promise.all([once(a, 'connect'), once(b, 'connect')]);

    const aSnap = track(a, 'game:snapshot');
    const aState = track(a, 'room:state');

    const created = await emitAck(a, 'room:create', { name: 'A' });
    await emitAck(b, 'room:join', { code: created.code, name: 'B' });
    a.emit('lobby:ready', { ready: true });
    b.emit('lobby:ready', { ready: true });
    await waitUntil(() => (aState.latest?.canStart ? true : null), 'canStart');

    const startP = once(a, 'game:start');
    const sr = await emitAck(a, 'lobby:start', {});
    assert.ok(sr.ok, 'host start ok');
    const start = await startP;
    const me = start.you.userId;
    assert.strictEqual(me, 'yellow-player', 'A is yellow (slot 0)');

    // 1. Первый снапшот с картой: cells + knights + players.
    const first = await waitUntil(() => (aSnap.latest?.cells ? aSnap.latest : null), 'snapshot with cells');
    assert.ok(Array.isArray(first.cells) && first.cells.length > 100, 'snapshot has map cells');
    assert.ok(Array.isArray(first.knights), 'snapshot has knights array');
    assert.ok(first.players[me], 'snapshot has my player data');
    assert.strictEqual(first.players[me].gold, 1000, 'start gold 1000');
    const myCastle = first.cells.find((c) => c[2] === 'castle' && c[3] === me);
    assert.ok(myCastle, 'my castle is in the map');

    // 2. Постройка рынка (в tree-free кайме у замка) отражается в снапшоте.
    const buildRes = await emitAck(a, 'intent', {
      type: 'placeBuilding',
      payload: { toolKey: 'market', tx: 96, ty: 80 },
    });
    assert.ok(buildRes.ok, `build market ok (${buildRes.error ?? ''})`);
    await waitUntil(() => (aSnap.latest.players[me].gold === 950 ? true : null), 'gold spent on market');
    await waitUntil(() => (cellAt(aSnap.latest, 96, 80)?.[2]?.startsWith('market') ? true : null), 'market on map');

    // 3. Найм рыцаря отражается: +1 в players и в массиве knights.
    const trainRes = await emitAck(a, 'intent', {
      type: 'trainKnight',
      payload: { worldPx: 88, worldPy: 104 }, // тайл (80,96) в кайме
    });
    assert.ok(trainRes.ok, `train ok (${trainRes.error ?? ''})`);
    await waitUntil(() => (aSnap.latest.players[me].knights === 1 ? true : null), 'knight counted');
    await waitUntil(() => (aSnap.latest.knights.some((k) => k.o === me) ? true : null), 'knight in snapshot');

    console.log('  ✓ snapshot delivers map/knights/players; intents reflected over the wire');
    console.log('  ✓ all snapshot-sync assertions passed');
  } finally {
    for (const s of sockets) s.close();
    server.kill('SIGKILL');
  }
}

run()
  .then(() => {
    console.log('\nPASS\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nFAIL:', err.message);
    process.exit(1);
  });
