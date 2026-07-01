/**
 * Прокачка пушки замка через intent `upgradeCastle`:
 *  - range/speed капятся на 5 уровнях, damage не ограничен;
 *  - уровни попадают в снапшот игрока;
 *  - прокачанный радиус реально достаёт врага, недостижимого на базовом радиусе.
 * `node tests/castle-upgrades.test.js`.
 */

import assert from 'assert';
import { WorldSim } from '../server/game/world-sim.js';
import { PLAYER_SLOTS } from '../server/constants/slots.js';
import { CASTLE_CANNON_RANGE_PX } from '../client/constants/castle-cannon.js';
import {
  CASTLE_RANGE_MAX_LEVEL,
  CASTLE_SPEED_MAX_LEVEL,
  castleRangePxFromLevel,
} from '../client/constants/castle-upgrades.js';
import { TILE_SIZE } from '../client/constants/sizes.js';

const slots = [PLAYER_SLOTS[0], PLAYER_SLOTS[1]];
const yellow = PLAYER_SLOTS[0];
const blue = PLAYER_SLOTS[1].userId;

/** Заваливаем игрока ресурсами, чтобы прокачка не упёрлась в стоимость. */
function fund(world, userId) {
  world.playerResources.set(userId, { wheat: 1e9, wood: 1e9, gold: 1e9 });
}

function upgrade(world, kind) {
  return world.applyIntent(yellow.slot, { type: 'upgradeCastle', payload: { kind } });
}

function run() {
  // ── 1. Лимиты уровней: range/speed = 5, damage без предела. ─────────────────
  {
    const world = new WorldSim({ seed: 7, slots });
    fund(world, yellow.userId);

    for (let i = 0; i < CASTLE_RANGE_MAX_LEVEL; i++) {
      assert.ok(upgrade(world, 'range').ok, `range upgrade ${i + 1} accepted`);
    }
    assert.ok(!upgrade(world, 'range').ok, 'range is capped at max level');
    assert.strictEqual(
      world.playerCastleUpgrades.get(yellow.userId).rangeLevel,
      CASTLE_RANGE_MAX_LEVEL,
      'range level stops at the cap'
    );

    for (let i = 0; i < CASTLE_SPEED_MAX_LEVEL; i++) {
      assert.ok(upgrade(world, 'speed').ok, `speed upgrade ${i + 1} accepted`);
    }
    assert.ok(!upgrade(world, 'speed').ok, 'speed is capped at max level');

    // Урон не ограничен — уходим сильно за 5 уровней.
    for (let i = 0; i < 12; i++) {
      assert.ok(upgrade(world, 'damage').ok, `damage upgrade ${i + 1} accepted`);
    }
    assert.strictEqual(
      world.playerCastleUpgrades.get(yellow.userId).damageLevel,
      12,
      'damage keeps leveling past 5'
    );

    // Снапшот отдаёт уровни игроку.
    const players = world.collectSnapshot(world.stateVersion).players;
    const me = players[yellow.userId];
    assert.strictEqual(me.castleRangeLevel, CASTLE_RANGE_MAX_LEVEL, 'snapshot has range level');
    assert.strictEqual(me.castleSpeedLevel, CASTLE_SPEED_MAX_LEVEL, 'snapshot has speed level');
    assert.strictEqual(me.castleDamageLevel, 12, 'snapshot has damage level');
  }

  // ── 2. Прокачанный радиус достаёт врага вне базового радиуса. ────────────────
  {
    const world = new WorldSim({ seed: 7, slots });
    fund(world, yellow.userId);

    const centerX = yellow.castleStart.x + 16;
    const centerY = yellow.castleStart.y + 16;
    // Ставим врага между базовым и максимальным радиусом (базовый + 1.5 клетки).
    const enemyX = centerX + CASTLE_CANNON_RANGE_PX + Math.round(1.5 * TILE_SIZE);
    assert.ok(
      enemyX - centerX <= castleRangePxFromLevel(CASTLE_RANGE_MAX_LEVEL),
      'enemy is inside the maxed range'
    );

    const enemy = world.knightSystem.spawn({
      x: enemyX,
      y: centerY,
      ownerUserId: blue,
      healthLevel: 2,
      attackLevel: 0,
    });

    // Без прокачки — цель вне радиуса, не стреляем.
    let sawEarly = false;
    for (let i = 0; i < 20; i++) {
      world.tick(50);
      if (world.collectSnapshot(world.stateVersion).projectiles.length > 0) {
        sawEarly = true;
      }
    }
    assert.ok(!sawEarly, 'enemy is out of base range: no shots yet');

    // Качаем радиус до максимума — теперь враг в зоне поражения.
    for (let i = 0; i < CASTLE_RANGE_MAX_LEVEL; i++) {
      upgrade(world, 'range');
    }

    let hit = false;
    for (let i = 0; i < 200 && !hit; i++) {
      world.tick(50);
      const snap = world.collectSnapshot(world.stateVersion);
      const alive = snap.knights.find((k) => k.id === enemy.id);
      if (!alive) {
        hit = true;
      }
    }
    assert.ok(hit, 'after maxing range the far enemy is shot down');
  }

  // ── 3. Замок обязателен для прокачки. ───────────────────────────────────────
  {
    const world = new WorldSim({ seed: 7, slots });
    fund(world, yellow.userId);
    // Сносим замок игрока.
    for (const [key, cell] of world.stateManager.getState()) {
      if (cell.ownerUserId === yellow.userId && cell.spriteType === 'castle') {
        world.stateManager.getState().delete(key);
      }
    }
    assert.ok(!upgrade(world, 'range').ok, 'no castle → no cannon upgrade');
  }

  console.log('  ✓ range/speed cap at 5, damage is unlimited, levels reach the snapshot');
  console.log('  ✓ upgraded range shoots a formerly out-of-range enemy');
  console.log('  ✓ upgrading requires owning a castle');
  console.log('  ✓ all castle-upgrades assertions passed');
}

try {
  run();
  console.log('\nPASS\n');
  process.exit(0);
} catch (err) {
  console.error('\nFAIL:', err.stack || err.message);
  process.exit(1);
}
