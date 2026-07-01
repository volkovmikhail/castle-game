/**
 * ЛКМ-перемещение «без удара» против ПКМ-приказа (контекст: рубка/атака).
 * move-only не должен рубить дерево, обычный приказ — должен. `node tests/move-only.test.js`.
 */

import assert from 'assert';
import { WorldSim } from '../server/game/world-sim.js';
import { PLAYER_SLOTS } from '../server/constants/slots.js';
import { isTreeSpriteType } from '../client/common/grid-path.js';
import { WORLD_WIDTH_PX, WORLD_HEIGHT_PX } from '../client/constants/world.js';
import { KnightSystem } from '../client/game/knights/knight-system.js';

/** Пустое поле: карта без клеток — всё проходимо, никаких замков/пушек не мешает изоляции. */
function makeOpenField() {
  const state = new Map();
  return { getState: () => state };
}

/** Автоатака срабатывает на 2 клетки (не только вплотную), а приказ «просто идти» её подавляет. */
function runAutoAttackRadius() {
  // Сценарий A: враги ровно в 2 клетки (32px). При старом радиусе 16px авто-атака бы
  // НЕ сработала; теперь (радиус 2 клетки) A вступает в бой и наносит урон B.
  {
    const ks = new KnightSystem({ applyChopHit: () => {} });
    const sm = makeOpenField();
    ks.spawn({ x: 500, y: 500, ownerUserId: 'A', healthLevel: 3, attackLevel: 3 });
    const b = ks.spawn({ x: 500, y: 532, ownerUserId: 'B', healthLevel: 3, attackLevel: 3 });
    const hp0 = b.hp;
    for (let i = 0; i < 200; i++) {
      ks.update(50, sm, WORLD_WIDTH_PX, WORLD_HEIGHT_PX);
    }
    assert.ok(b.hp < hp0, 'auto-attack engages an enemy 2 tiles away (2-tile radius)');
  }

  // Сценарий B: A под приказом «просто идти» (moveOnly) стартует в радиусе авто-атаки
  // от врага B, но пока выполняет приказ (plainMove) — не берёт цель и не бьёт B.
  {
    const ks = new KnightSystem({ applyChopHit: () => {} });
    const sm = makeOpenField();
    const a = ks.spawn({ x: 500, y: 500, ownerUserId: 'A', healthLevel: 3, attackLevel: 3 });
    const b = ks.spawn({ x: 500, y: 516, ownerUserId: 'B', healthLevel: 3, attackLevel: 3 });
    const hp0 = b.hp;
    ks.selectByIds([a.id], 'A');
    ks.issuePlainMove(700, 500, sm, WORLD_WIDTH_PX, WORLD_HEIGHT_PX, 'A');
    assert.strictEqual(a.plainMove, true, 'plain-move order sets the plainMove flag');

    let engagedWhileMoving = false;
    for (let i = 0; i < 120; i++) {
      ks.update(50, sm, WORLD_WIDTH_PX, WORLD_HEIGHT_PX);
      if (a.plainMove && (a.chopTargetKnightId != null || b.hp < hp0)) {
        engagedWhileMoving = true;
      }
      if (!a.plainMove) {
        break; // приказ выполнен — дальше авто-атака снова разрешена
      }
    }
    assert.ok(!engagedWhileMoving, 'plain-move (S) knight does NOT auto-attack while executing the move');
    assert.ok(Math.abs(a.x - 500) > 8, 'plain-move knight actually walked away from its start');
  }

  console.log('  ✓ auto-attack fires at 2 tiles; plain-move suppresses it');
}

function findTreeWithStand(world) {
  const state = world.stateManager.getState();
  for (const [k, c] of state) {
    if (c.isRenderable && isTreeSpriteType(c.spriteType)) {
      const [x, y] = k.split(':').map(Number);
      for (const [sx, sy] of [[x - 16, y], [x + 16, y], [x, y - 16], [x, y + 16]]) {
        if (sx >= 0 && sy >= 0 && !state.get(`${sx}:${sy}`)) {
          return { tree: { x, y }, stand: { x: sx, y: sy } };
        }
      }
    }
  }
  return null;
}

function run() {
  const world = new WorldSim({ seed: 7, slots: [PLAYER_SLOTS[0]] });
  const yellow = PLAYER_SLOTS[0].userId;
  const spot = findTreeWithStand(world);
  assert.ok(spot, 'found a tree with an empty neighbor');

  const k = world.knightSystem.spawn({
    x: spot.stand.x + 4,
    y: spot.stand.y + 4,
    ownerUserId: yellow,
    healthLevel: 3,
    attackLevel: 3,
  });
  const treeKey = `${spot.tree.x}:${spot.tree.y}`;
  const hp0 = world.stateManager.getState().get(treeKey).entity.hp;

  // 1. move-only к дереву — рыцарь не рубит, дерево цело (даже спустя время).
  world.applyIntent(0, {
    type: 'moveOrder',
    payload: { wx: spot.tree.x + 8, wy: spot.tree.y + 8, knightIds: [k.id], moveOnly: true },
  });
  for (let i = 0; i < 200; i++) {
    world.tick(50);
  }
  const treeCell = world.stateManager.getState().get(treeKey);
  assert.ok(treeCell, 'move-only did NOT destroy the tree');
  assert.strictEqual(treeCell.entity.hp, hp0, 'move-only did NOT damage the tree');

  // 2. move-only к свободной клетке (в кайме у замка) — рыцарь реально идёт туда.
  const mover = world.knightSystem.spawn({ x: 82, y: 82, ownerUserId: yellow });
  const x0 = mover.x;
  const y0 = mover.y;
  world.applyIntent(0, {
    type: 'moveOrder',
    payload: { wx: 88, wy: 104, knightIds: [mover.id], moveOnly: true }, // тайл (80,96) — свободен
  });
  for (let i = 0; i < 60; i++) {
    world.tick(50);
  }
  assert.ok(Math.hypot(mover.x - x0, mover.y - y0) > 4, 'move-only actually moves the knight');

  console.log('  ✓ LMB move-only walks without attacking, and does move to a clear point');

  runAutoAttackRadius();

  console.log('  ✓ all move-only assertions passed');
}

try {
  run();
  console.log('\nPASS\n');
  process.exit(0);
} catch (err) {
  console.error('\nFAIL:', err.stack || err.message);
  process.exit(1);
}
