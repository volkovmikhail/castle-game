/**
 * End-to-end проверка серверной инфраструктуры мультиплеера:
 * создание комнаты, вход по коду, готовность, старт, назначение слотов,
 * намерение в бою и условие победы (последний выживший).
 *
 * Тест сам поднимает сервер на отдельном порту и гасит его в конце.
 * Запуск: `npm test` или `node tests/lobby-flow.test.js`.
 *
 * События ждём через постоянные слушатели + опрос (waitUntil), а не цепочку
 * `.once` — иначе быстрые подряд идущие broadcast'ы теряются между подписками.
 */

import assert from 'assert';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { io } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.TEST_PORT) || 4100;
const URL = `http://localhost:${PORT}`;

const connect = () => io(URL, { transports: ['websocket'], forceNew: true });
const emitAck = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const once = (s, ev, timeout = 3000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting for "${ev}"`)), timeout);
    s.once(ev, (d) => {
      clearTimeout(t);
      res(d);
    });
  });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Постоянный слушатель: всегда держит последнее событие. */
function track(socket, event) {
  const box = { latest: null, count: 0 };
  socket.on(event, (d) => {
    box.latest = d;
    box.count++;
  });
  return box;
}

async function waitUntil(pred, label, timeout = 3000) {
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

/** Поднимает сервер как дочерний процесс и ждёт строку готовности. */
function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['server/app.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const t = setTimeout(() => reject(new Error('server did not start in time')), 5000);
    child.stdout.on('data', (buf) => {
      if (buf.toString().includes('Server running')) {
        clearTimeout(t);
        resolve(child);
      }
    });
    child.stderr.on('data', (buf) => process.stderr.write(`[server] ${buf}`));
    child.on('exit', (code) => clearTimeout(t) || reject(new Error(`server exited early (${code})`)));
  });
}

async function run() {
  const server = await startServer();
  const sockets = [];
  try {
    const a = connect();
    const b = connect();
    const c = connect();
    sockets.push(a, b, c);
    await Promise.all([once(a, 'connect'), once(b, 'connect'), once(c, 'connect')]);

    const aState = track(a, 'room:state');
    const aStart = track(a, 'game:start');
    const bStart = track(b, 'game:start');
    const aOver = track(a, 'game:over');

    // 1. Создание комнаты — создатель получает код и слот 0 (host).
    const created = await emitAck(a, 'room:create', { name: 'Alice' });
    assert.ok(created.ok, 'create ok');
    assert.ok(/^[A-Z0-9]{4}$/.test(created.code), 'code is 4 chars A-Z0-9');
    assert.strictEqual(created.you.slot, 0, 'creator gets slot 0');
    assert.strictEqual(created.you.isHost, true, 'creator is host');
    const code = created.code;

    // 2. Вход по коду — слоты в порядке SLOT_ASSIGN_ORDER: второй игрок получает
    // диагональный угол (слот 3), третий — слот 1.
    const joinedB = await emitAck(b, 'room:join', { code, name: 'Bob' });
    assert.ok(joinedB.ok && joinedB.you.slot === 3, 'B joins slot 3 (diagonal from A)');
    const joinedC = await emitAck(c, 'room:join', { code, name: 'Carol' });
    assert.ok(joinedC.ok && joinedC.you.slot === 1, 'C joins slot 1');
    assert.strictEqual(joinedC.room.players.length, 3, 'room has 3 players');

    // 3. Старт до готовности — отказ.
    const earlyStart = await emitAck(a, 'lobby:start', {});
    assert.strictEqual(earlyStart.ok, false, 'cannot start before ready');

    // 4. Все готовы — canStart становится true.
    a.emit('lobby:ready', { ready: true });
    b.emit('lobby:ready', { ready: true });
    c.emit('lobby:ready', { ready: true });
    const st = await waitUntil(() => (aState.latest?.canStart ? aState.latest : null), 'canStart');
    assert.strictEqual(st.canStart, true, 'canStart when all ready');

    // 5. Старт не-хостом — отказ.
    const nonHost = await emitAck(b, 'lobby:start', {});
    assert.strictEqual(nonHost.ok, false, 'only host can start');

    // 6. Хост стартует — все получают game:start со своим слотом и миром.
    const startRes = await emitAck(a, 'lobby:start', {});
    assert.ok(startRes.ok, 'host start ok');
    await waitUntil(() => (aStart.latest && bStart.latest ? true : null), 'game:start for A and B');
    assert.strictEqual(aStart.latest.you.slot, 0, 'A slot 0 in game');
    assert.strictEqual(bStart.latest.you.slot, 3, 'B slot 3 in game');
    assert.strictEqual(aStart.latest.world.width, 1024, 'world is 1024px wide');

    // 7. Намерение в бою принимается сервером (рынок в tree-free кайме у замка слота 0).
    const intentRes = await emitAck(a, 'intent', {
      type: 'placeBuilding',
      payload: { toolKey: 'market', tx: 96, ty: 80 },
    });
    assert.ok(intentRes.ok, `intent accepted (${intentRes.error ?? ''})`);

    // 8. Победа: C и B выходят -> остаётся A -> game:over с победителем A.
    c.close();
    await delay(150);
    b.close();
    const over = await waitUntil(() => aOver.latest, 'game:over', 4000);
    assert.strictEqual(over.winner.slot, 0, 'winner is slot 0 (Alice)');
    assert.strictEqual(over.winner.name, 'Alice', 'winner name');

    // 9. Health-эндпоинт отвечает.
    const health = await fetch(`${URL}/health`).then((r) => r.json());
    assert.ok(health.ok, 'health ok');

    console.log('\n  ✓ lobby flow: create / join / ready / start / slots / intent / win');
    console.log('  ✓ all assertions passed');
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
