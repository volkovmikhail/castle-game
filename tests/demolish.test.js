/**
 * Проверка сноса зданий (intent `demolishBuilding`):
 *   - своё здание сносится: клетка освобождается (декаль земли), возвращается
 *     половина стоимости (округление вниз);
 *   - на освобождённой клетке снова можно строить;
 *   - замок снести нельзя;
 *   - чужое здание снести нельзя.
 *
 * `node tests/demolish.test.js`.
 */

import assert from 'assert';
import { WorldSim } from '../server/game/world-sim.js';
import { PLAYER_SLOTS } from '../server/constants/slots.js';
import { getNumericCost } from '../client/constants/economy.js';
import { isForestFloorDecalSpriteType } from '../client/common/grid-path.js';

/** Тайл в tree-free кайме над замком слота 0 (как в lobby-flow тесте). */
const SPOT = { tx: 96, ty: 80 };
const FARM = 'farmStage1';

function place(world, slot, toolKey, tx, ty) {
  return world.applyIntent(slot, { type: 'placeBuilding', payload: { toolKey, tx, ty } });
}
function demolish(world, slot, tx, ty) {
  return world.applyIntent(slot, { type: 'demolishBuilding', payload: { tx, ty } });
}

function run() {
  const slots = [PLAYER_SLOTS[0], PLAYER_SLOTS[1]];
  const world = new WorldSim({ seed: 7, slots });
  const yellow = PLAYER_SLOTS[0].userId;
  const state = world.stateManager.getState();

  // 1. Ставим ферму и проверяем списание стоимости.
  const before = { ...world.playerResources.get(yellow) };
  assert.ok(place(world, 0, FARM, SPOT.tx, SPOT.ty).ok, 'farm placed');
  assert.strictEqual(state.get(`${SPOT.tx}:${SPOT.ty}`)?.spriteType, FARM, 'farm cell present');

  const cost = getNumericCost(FARM);
  const afterPlace = { ...world.playerResources.get(yellow) };
  assert.strictEqual(afterPlace.wood, before.wood - cost.wood, 'wood spent on placement');
  assert.strictEqual(afterPlace.gold, before.gold - cost.gold, 'gold spent on placement');

  // 2. Сносим: половина стоимости назад, клетка свободна.
  const dem = demolish(world, 0, SPOT.tx, SPOT.ty);
  assert.ok(dem.ok, `demolish ok (${dem.error ?? ''})`);

  const freed = state.get(`${SPOT.tx}:${SPOT.ty}`);
  assert.ok(!freed || isForestFloorDecalSpriteType(freed.spriteType), 'tile freed (empty or floor decal)');

  const afterDem = world.playerResources.get(yellow);
  assert.strictEqual(afterDem.wood, afterPlace.wood + Math.floor(cost.wood / 2), 'half wood refunded');
  assert.strictEqual(afterDem.gold, afterPlace.gold + Math.floor(cost.gold / 2), 'half gold refunded');

  // 3. На освобождённой клетке снова строится здание.
  assert.ok(place(world, 0, FARM, SPOT.tx, SPOT.ty).ok, 'can rebuild on freed tile');

  // 4. Замок снести нельзя.
  const castle = PLAYER_SLOTS[0].castleStart;
  const demCastle = demolish(world, 0, castle.x, castle.y);
  assert.strictEqual(demCastle.ok, false, 'castle cannot be demolished');
  assert.strictEqual(state.get(`${castle.x}:${castle.y}`)?.spriteType, 'castle', 'castle still standing');

  // 5. Чужое здание снести нельзя (слот 1 пытается снести ферму слота 0).
  const foreign = demolish(world, 1, SPOT.tx, SPOT.ty);
  assert.strictEqual(foreign.ok, false, 'cannot demolish another player building');
  assert.strictEqual(state.get(`${SPOT.tx}:${SPOT.ty}`)?.spriteType, FARM, 'foreign farm untouched');

  console.log('  ✓ demolish: refund half / free tile / rebuild / castle & foreign protected');
  console.log('  ✓ all demolish assertions passed');
}

try {
  run();
  console.log('\nPASS\n');
  process.exit(0);
} catch (err) {
  console.error('\nFAIL:', err.stack || err.message);
  process.exit(1);
}
