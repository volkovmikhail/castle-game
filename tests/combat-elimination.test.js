/**
 * Проверка боя и победы (Phase 2): рыцари одного игрока разрушают замок другого,
 * сервер фиксирует выбывание слота. `node tests/combat-elimination.test.js`.
 */

import assert from 'assert';
import { WorldSim } from '../server/game/world-sim.js';
import { PLAYER_SLOTS } from '../server/constants/slots.js';

function run() {
  const slots = [PLAYER_SLOTS[0], PLAYER_SLOTS[1]];
  const world = new WorldSim({ seed: 7, slots });
  const yellow = PLAYER_SLOTS[0].userId;
  const blueCastle = PLAYER_SLOTS[1].castleStart; // { x: 896, y: 96 }

  assert.deepStrictEqual(world.drainEliminations(), [], 'no eliminations at start');

  // Спавним атакующих рыцарей жёлтого вокруг замка синего (рядом со stand-тайлами).
  const around = [
    { x: blueCastle.x - 28, y: blueCastle.y + 4 },
    { x: blueCastle.x - 28, y: blueCastle.y + 20 },
    { x: blueCastle.x + 40, y: blueCastle.y + 4 },
    { x: blueCastle.x + 40, y: blueCastle.y + 20 },
    { x: blueCastle.x + 4, y: blueCastle.y + 44 },
    { x: blueCastle.x + 20, y: blueCastle.y + 44 },
  ];
  const ids = around.map(
    (p) => world.knightSystem.spawn({ x: p.x, y: p.y, ownerUserId: yellow, healthLevel: 3, attackLevel: 3 }).id
  );
  assert.strictEqual(world.knightSystem.countKnightsForOwner(yellow), ids.length, 'attackers spawned');

  // Приказ рубить замок синего (клик по тайлу замка).
  world.knightSystem.selectByIds(ids, yellow);
  world.knightSystem.issueOrder(
    blueCastle.x + 8,
    blueCastle.y + 8,
    world.stateManager,
    1024,
    1024,
    yellow,
    () => {}
  );

  // Тикаем до выбывания синего (бой идёт по dtMs — реальное время не нужно).
  let eliminated = null;
  let sawCastleHpDelta = false;
  for (let i = 0; i < 4000 && eliminated === null; i++) {
    world.tick(50);
    // HP-дельта повреждённого замка должна попадать в снапшот (живые полоски HP).
    if (!sawCastleHpDelta) {
      const s = world.collectSnapshot(world.stateVersion);
      if (s.hp.some((h) => h[0] === blueCastle.x && h[1] === blueCastle.y && h[2] < 200)) {
        sawCastleHpDelta = true;
      }
    }
    const drained = world.drainEliminations();
    if (drained.length > 0) {
      eliminated = drained;
    }
  }

  assert.ok(sawCastleHpDelta, 'castle HP delta broadcast during the siege');
  assert.ok(eliminated, 'someone was eliminated before timeout');
  assert.deepStrictEqual(eliminated, [1], 'blue (slot 1) eliminated');
  assert.strictEqual(world.collectSnapshot(0).players[PLAYER_SLOTS[1].userId].alive, false, 'blue alive=false');

  // Замок синего исчез с карты (заменён обломками).
  const cells = world.collectSnapshot(0).cells;
  const blueCastleCell = cells.find((c) => c[0] === blueCastle.x && c[1] === blueCastle.y && c[2] === 'castle');
  assert.ok(!blueCastleCell, 'blue castle removed from map');

  console.log('  ✓ knights destroy enemy castle -> slot eliminated');
  console.log('  ✓ all combat/elimination assertions passed');
}

try {
  run();
  console.log('\nPASS\n');
  process.exit(0);
} catch (err) {
  console.error('\nFAIL:', err.stack || err.message);
  process.exit(1);
}
