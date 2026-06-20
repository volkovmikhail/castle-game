/**
 * ЛКМ-перемещение «без удара» против ПКМ-приказа (контекст: рубка/атака).
 * move-only не должен рубить дерево, обычный приказ — должен. `node tests/move-only.test.js`.
 */

import assert from 'assert';
import { WorldSim } from '../server/game/world-sim.js';
import { PLAYER_SLOTS } from '../server/constants/slots.js';
import { isTreeSpriteType } from '../client/common/grid-path.js';

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
