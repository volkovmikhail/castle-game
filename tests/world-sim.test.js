/**
 * Юнит-тесты серверной симуляции (Phase 2): генерация мира, замки, ресурсы,
 * намерения (постройка/найм/уникальность/дальность), дельта снапшота, жизни.
 *
 * Чистый модульный тест — сервер/сокеты не нужны. `node tests/world-sim.test.js`.
 */

import assert from 'assert';
import { WorldSim } from '../server/game/world-sim.js';
import { PLAYER_SLOTS } from '../server/constants/slots.js';
import { STARTING_PLAYER_RESOURCES } from '../client/constants/resources.js';
import { computeCastleNoTreeMarginsPx } from '../client/game/generators/castle-tree-margins.js';
import { isTreeSpriteType } from '../client/common/grid-path.js';

const TILE = 16;

/** Пустые тайлы рядом с домом игрока (для валидных построек). */
function emptyTilesNear(world, ownerId) {
  const state = world.stateManager.getState();
  let base = null;
  for (const [k, c] of state) {
    if (c.ownerUserId === ownerId) {
      const [x, y] = k.split(':').map(Number);
      base = { x, y };
      break;
    }
  }
  assert.ok(base, 'owner has a base cell');
  const out = [];
  for (let dx = -2; dx <= 3; dx++) {
    for (let dy = -2; dy <= 3; dy++) {
      const x = base.x + dx * TILE;
      const y = base.y + dy * TILE;
      if (x < 0 || y < 0) {
        continue;
      }
      if (!state.get(`${x}:${y}`)) {
        out.push({ x, y });
      }
    }
  }
  return out;
}

function run() {
  const slots = [PLAYER_SLOTS[0], PLAYER_SLOTS[1]];
  const world = new WorldSim({ seed: 123, slots });
  const yellow = PLAYER_SLOTS[0].userId;
  const blue = PLAYER_SLOTS[1].userId;

  // 1. Мир сгенерирован и есть замки обоих игроков.
  const snap0 = world.collectSnapshot(0);
  assert.ok(snap0.cells.length > 100, 'world has many cells (trees)');
  const castles = snap0.cells.filter((c) => c[2] === 'castle');
  assert.strictEqual(castles.length, 2, 'two castles (renderable anchors)');
  const castleOwners = new Set(castles.map((c) => c[3]));
  assert.ok(castleOwners.has(yellow) && castleOwners.has(blue), 'castle owners are the two slots');

  // 1b. Кайма «без деревьев» есть только у активных замков; углы пустых слотов заросли.
  const inRect = (c, r) => c[0] >= r.minX && c[0] <= r.maxX && c[1] >= r.minY && c[1] <= r.maxY;
  const activeMargins = computeCastleNoTreeMarginsPx(slots.map((s) => s.castleStart));
  for (const r of activeMargins) {
    assert.ok(
      !snap0.cells.some((c) => isTreeSpriteType(c[2]) && inRect(c, r)),
      'no trees around active castles'
    );
  }
  const unusedMargins = computeCastleNoTreeMarginsPx(
    [PLAYER_SLOTS[2].castleStart, PLAYER_SLOTS[3].castleStart]
  );
  for (const r of unusedMargins) {
    assert.ok(
      snap0.cells.some((c) => isTreeSpriteType(c[2]) && inRect(c, r)),
      'empty slot corners stay overgrown with trees'
    );
  }

  // 2. Стартовые ресурсы и жизни в снапшоте.
  assert.strictEqual(snap0.players[yellow].wheat, STARTING_PLAYER_RESOURCES.wheat, 'start wheat');
  assert.strictEqual(snap0.players[yellow].gold, STARTING_PLAYER_RESOURCES.gold, 'start gold');
  assert.strictEqual(snap0.players[yellow].knights, 0, 'no knights yet');
  assert.strictEqual(snap0.players[yellow].alive, true, 'alive at start');

  // 3. Найм рыцаря рядом с замком: списываются ресурсы, +1 рыцарь.
  const spots = emptyTilesNear(world, yellow);
  assert.ok(spots.length >= 4, 'found buildable spots near castle');
  const kSpot = spots[0];
  const trainRes = world.applyIntent(0, {
    type: 'trainKnight',
    payload: { worldPx: kSpot.x + 8, worldPy: kSpot.y + 8 },
  });
  assert.ok(trainRes.ok, 'train knight ok');
  let ps = world.collectSnapshot(0).players[yellow];
  assert.strictEqual(ps.knights, 1, 'one knight');
  assert.strictEqual(ps.wheat, STARTING_PLAYER_RESOURCES.wheat - 25, 'knight costs 25 wheat');
  assert.strictEqual(ps.gold, STARTING_PLAYER_RESOURCES.gold - 25, 'knight costs 25 gold');

  // 4. Постройка фермы рядом с замком: списывается wood/gold.
  const farmRes = world.applyIntent(0, {
    type: 'placeBuilding',
    payload: { toolKey: 'farmStage1', tx: spots[1].x, ty: spots[1].y },
  });
  assert.ok(farmRes.ok, 'place farm ok');
  ps = world.collectSnapshot(0).players[yellow];
  assert.strictEqual(ps.wood, STARTING_PLAYER_RESOURCES.wood - 50, 'farm costs 50 wood');
  assert.strictEqual(ps.gold, STARTING_PLAYER_RESOURCES.gold - 25 - 25, 'farm costs 25 gold');

  // 5. Слишком далеко от дома — отказ (чистим тайл в центре, чтобы исключить дерево).
  world.stateManager.deleteCell({ x: 512, y: 512 });
  const farRes = world.applyIntent(0, {
    type: 'placeBuilding',
    payload: { toolKey: 'farmStage1', tx: 512, ty: 512 },
  });
  assert.strictEqual(farRes.ok, false, 'too far rejected');
  assert.match(farRes.error, /Too far/, 'too-far message');

  // 6. Рынок уникален: второй — отказ.
  const m1 = world.applyIntent(0, { type: 'placeBuilding', payload: { toolKey: 'market', tx: spots[2].x, ty: spots[2].y } });
  assert.ok(m1.ok, 'first market ok');
  const m2 = world.applyIntent(0, { type: 'placeBuilding', payload: { toolKey: 'market', tx: spots[3].x, ty: spots[3].y } });
  assert.strictEqual(m2.ok, false, 'second market rejected');
  assert.match(m2.error, /once/, 'market unique message');

  // 7. Дельта карты: cells только при изменении.
  const a = world.collectSnapshot(0);
  assert.ok(a.cells !== null, 'fresh request includes cells');
  const b = world.collectSnapshot(a.v);
  assert.strictEqual(b.cells, null, 'no map change => no cells');
  world.applyIntent(0, { type: 'placeBuilding', payload: { toolKey: 'farmStage1', tx: spots[4].x, ty: spots[4].y } });
  const c = world.collectSnapshot(b.v);
  assert.ok(c.cells !== null, 'after build => cells included');

  // 7.5. Вариант дома из призрака (клиент прислал variant) ставится как есть.
  // Часть свободных тайлов занята рыцарем из шага 3 — пробуем, пока не встанет.
  let hSpot = null;
  for (const spot of emptyTilesNear(world, yellow)) {
    const houseRes = world.applyIntent(0, {
      type: 'placeBuilding',
      payload: { toolKey: 'house', tx: spot.x, ty: spot.y, variant: 'houseDouble' },
    });
    if (houseRes.ok) {
      hSpot = spot;
      break;
    }
  }
  assert.ok(hSpot, 'house with explicit variant placed on some free spot');
  const houseCell = world.stateManager.getState().get(`${hSpot.x}:${hSpot.y}`);
  assert.strictEqual(houseCell?.spriteType, 'houseDoubleStage1', 'requested house variant is placed');

  // 8. Чужой слот не может слать намерения как ты — а выбывший вообще ничего.
  world.markSlotDead(1);
  const deadRes = world.applyIntent(1, { type: 'trainKnight', payload: { worldPx: 900, worldPy: 100 } });
  assert.strictEqual(deadRes.ok, false, 'eliminated slot cannot act');
  assert.strictEqual(world.collectSnapshot(0).players[blue].alive, false, 'blue marked dead');

  // 9. Тик симуляции не падает.
  for (let i = 0; i < 30; i++) {
    world.tick(16);
  }

  console.log('  ✓ world gen / castles / resources / intents / delta / lives');
  console.log('  ✓ all WorldSim assertions passed');
}

try {
  run();
  console.log('\nPASS\n');
  process.exit(0);
} catch (err) {
  console.error('\nFAIL:', err.stack || err.message);
  process.exit(1);
}
