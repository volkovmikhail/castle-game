'use strict';

/**
 * End-to-end проверка серверной инфраструктуры мультиплеера (Phase 1):
 * создание комнаты, вход по коду, готовность, старт, назначение слотов,
 * намерение в бою и условие победы (последний выживший).
 *
 * Тест сам поднимает сервер на отдельном порту и гасит его в конце.
 * Запуск: `npm test` или `node tests/lobby-flow.test.js`.
 */

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = Number(process.env.TEST_PORT) || 4100;
const URL = `http://localhost:${PORT}`;

const connect = () => io(URL, { transports: ['websocket'], forceNew: true });
const emitAck = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const waitFor = (s, ev, timeout = 3000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting for "${ev}"`)), timeout);
    s.once(ev, (d) => {
      clearTimeout(t);
      res(d);
    });
  });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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
    await Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect'), waitFor(c, 'connect')]);

    // 1. Создание комнаты — создатель получает код и слот 0 (host).
    const created = await emitAck(a, 'room:create', { name: 'Alice' });
    assert.ok(created.ok, 'create ok');
    assert.ok(/^[A-Z0-9]{4}$/.test(created.code), 'code is 4 chars A-Z0-9');
    assert.strictEqual(created.you.slot, 0, 'creator gets slot 0');
    assert.strictEqual(created.you.isHost, true, 'creator is host');
    const code = created.code;

    // 2. Вход по коду — следующие свободные слоты, рассылка room:state.
    const stateB = waitFor(b, 'room:state');
    const joinedB = await emitAck(b, 'room:join', { code, name: 'Bob' });
    assert.ok(joinedB.ok && joinedB.you.slot === 1, 'B joins slot 1');
    await stateB;

    const joinedC = await emitAck(c, 'room:join', { code, name: 'Carol' });
    assert.ok(joinedC.ok && joinedC.you.slot === 2, 'C joins slot 2');
    assert.strictEqual(joinedC.room.players.length, 3, 'room has 3 players');

    // 3. Старт до готовности — отказ.
    const earlyStart = await emitAck(a, 'lobby:start', {});
    assert.strictEqual(earlyStart.ok, false, 'cannot start before ready');

    // 4. Все готовы — canStart становится true.
    a.emit('lobby:ready', { ready: true });
    b.emit('lobby:ready', { ready: true });
    const afterReady = waitFor(a, 'room:state');
    c.emit('lobby:ready', { ready: true });
    let st = await afterReady;
    // дождёмся состояния, где все трое ready
    while (!st.canStart) {
      st = await waitFor(a, 'room:state');
    }
    assert.strictEqual(st.canStart, true, 'canStart when all ready');

    // 5. Старт не-хостом — отказ.
    const nonHost = await emitAck(b, 'lobby:start', {});
    assert.strictEqual(nonHost.ok, false, 'only host can start');

    // 6. Хост стартует — все получают game:start со своим слотом и миром.
    const gsA = waitFor(a, 'game:start');
    const gsB = waitFor(b, 'game:start');
    const startRes = await emitAck(a, 'lobby:start', {});
    assert.ok(startRes.ok, 'host start ok');
    const [ga, gb] = await Promise.all([gsA, gsB]);
    assert.strictEqual(ga.you.slot, 0, 'A slot 0 in game');
    assert.strictEqual(gb.you.slot, 1, 'B slot 1 in game');
    assert.strictEqual(ga.world.width, 1024, 'world is 1024px wide');

    // 7. Намерение в бою принимается сервером.
    const intentRes = await emitAck(a, 'intent', {
      type: 'placeBuilding',
      payload: { toolKey: 'market', tx: 96, ty: 96 },
    });
    assert.ok(intentRes.ok, 'intent accepted');

    // 8. Победа: C и B выходят -> остаётся A -> game:over с победителем A.
    const overA = waitFor(a, 'game:over', 4000);
    c.close();
    await delay(150);
    b.close();
    const over = await overA;
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
