/**
 * Проверка быстрого матча ("Find Game"):
 *   - presence: клиенты узнают число онлайн;
 *   - при MAX_PLAYERS игроках в очереди партия стартует немедленно;
 *   - при MIN_PLAYERS запускается обратный отсчёт и по нему партия стартует
 *     с текущим числом игроков;
 *   - match:state отражает счётчик и таймер, cancel убирает из очереди.
 *
 * Отсчёт добора укорочен через env MATCH_FILL_MS, чтобы тест был быстрым.
 * Тест сам поднимает сервер на отдельном порту и гасит его в конце.
 */

import assert from 'assert';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { io } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.TEST_PORT) || 4200;
const FILL_MS = 700;
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
      env: { ...process.env, PORT: String(PORT), MATCH_FILL_MS: String(FILL_MS) },
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
  const openSocket = () => {
    const s = connect();
    sockets.push(s);
    return s;
  };

  try {
    // ── 1. Мгновенный старт при MAX_PLAYERS (4) ──────────────────────────────
    // Слушатель presence вешаем на первый сокет ДО подключения остальных, иначе
    // их connect-бродкасты уйдут раньше подписки.
    const first = openSocket();
    const presence = track(first, 'presence');
    const clients = [first, openSocket(), openSocket(), openSocket()];
    await Promise.all(clients.map((s) => once(s, 'connect')));

    const starts = clients.map((s) => track(s, 'game:start'));

    await waitUntil(() => (presence.latest?.online >= 4 ? presence.latest : null), 'presence >= 4');
    assert.ok(presence.latest.online >= 4, 'presence reports online count');

    for (const s of clients) {
      await emitAck(s, 'match:find', { name: 'MM' });
    }

    await waitUntil(() => (starts.every((b) => b.latest) ? true : null), 'game:start for all 4');
    const slots = starts.map((b) => b.latest.you.slot).sort();
    assert.deepStrictEqual(slots, [0, 1, 2, 3], 'four queued players start immediately with slots 0..3');

    // ── 2. Отсчёт при MIN_PLAYERS (2) и авто-старт по таймеру ────────────────
    const e = openSocket();
    const f = openSocket();
    await Promise.all([once(e, 'connect'), once(f, 'connect')]);

    const eMatch = track(e, 'match:state');
    const eStart = track(e, 'game:start');
    const fStart = track(f, 'game:start');

    await emitAck(e, 'match:find', { name: 'Eve' });
    // Один игрок — отсчёт ещё не идёт.
    const solo = await waitUntil(() => eMatch.latest, 'match:state for solo');
    assert.strictEqual(solo.count, 1, 'one player queued');
    assert.strictEqual(solo.counting, false, 'no countdown with a single player');

    await emitAck(f, 'match:find', { name: 'Fin' });
    const paired = await waitUntil(
      () => (eMatch.latest?.count === 2 ? eMatch.latest : null),
      'match:state count 2',
    );
    assert.strictEqual(paired.counting, true, 'countdown starts at MIN_PLAYERS');
    assert.ok(paired.remainingMs > 0 && paired.remainingMs <= FILL_MS, 'remainingMs within window');

    // По истечении отсчёта партия стартует с двумя игроками.
    await waitUntil(() => (eStart.latest && fStart.latest ? true : null), 'auto-start after countdown', 3000);
    assert.ok(eStart.latest && fStart.latest, 'both players start after the fill countdown');

    // ── 3. Cancel убирает игрока из очереди ──────────────────────────────────
    const g = openSocket();
    const h = openSocket();
    await Promise.all([once(g, 'connect'), once(h, 'connect')]);
    const hMatch = track(h, 'match:state');

    await emitAck(g, 'match:find', { name: 'Gil' });
    await emitAck(h, 'match:find', { name: 'Hal' });
    await waitUntil(() => (hMatch.latest?.count === 2 ? hMatch.latest : null), 'count 2 before cancel');

    await emitAck(g, 'match:cancel', {});
    const afterCancel = await waitUntil(
      () => (hMatch.latest?.count === 1 ? hMatch.latest : null),
      'count 1 after cancel',
    );
    assert.strictEqual(afterCancel.counting, false, 'countdown cancelled when back below MIN');

    console.log('\n  ✓ matchmaking: presence / instant start at MAX / countdown at MIN / cancel');
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
