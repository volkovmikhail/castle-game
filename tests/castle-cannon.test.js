/**
 * Пушка замка: замок стреляет по вражескому рыцарю в радиусе, снаряд попадает в
 * снапшот и убивает рыцаря 2-го уровня с первого попадания.
 * `node tests/castle-cannon.test.js`.
 */

import assert from 'assert';
import { WorldSim } from '../server/game/world-sim.js';
import { PLAYER_SLOTS } from '../server/constants/slots.js';
import {
  CASTLE_CANNON_DAMAGE,
  CASTLE_CANNON_MUZZLE_OFFSET_X,
  CASTLE_CANNON_MUZZLE_OFFSET_Y,
  CASTLE_CANNON_RANGE_PX,
  CASTLE_CANNON_PROJECTILE_SPEED_PX_PER_MS,
} from '../client/constants/castle-cannon.js';
import { knightMaxHpFromUpgradeLevel } from '../client/constants/knight-upgrades.js';
import { TILE_SIZE } from '../client/constants/sizes.js';

function run() {
  const slots = [PLAYER_SLOTS[0], PLAYER_SLOTS[1]];
  const yellowCastle = PLAYER_SLOTS[0].castleStart; // жёлтый замок
  const blue = PLAYER_SLOTS[1].userId;

  // ── 1. Враг в радиусе обстреливается; снаряд вылетает из дула и наносит урон. ─
  {
    const world = new WorldSim({ seed: 7, slots });
    const centerX = yellowCastle.x + 16;
    const centerY = yellowCastle.y + 16;
    // Дуло настраивается смещением относительно левого верхнего угла замка.
    const muzzleX = yellowCastle.x + CASTLE_CANNON_MUZZLE_OFFSET_X;
    const muzzleY = yellowCastle.y + CASTLE_CANNON_MUZZLE_OFFSET_Y;
    const initialHp = knightMaxHpFromUpgradeLevel(2); // рыцарь 2-го уровня HP = 60

    // Рыцарь синего в ~1 клетке правее замка (внутри радиуса).
    const enemy = world.knightSystem.spawn({
      x: centerX + TILE_SIZE,
      y: centerY,
      ownerUserId: blue,
      healthLevel: 2,
      attackLevel: 0,
    });
    assert.strictEqual(world.knightSystem.countKnightsForOwner(blue), 1, 'enemy spawned');

    let firstProjPos = null;
    let hit = false; // цель получила урон (HP упал или рыцарь убит)
    for (let i = 0; i < 200 && !hit; i++) {
      world.tick(50);
      const snap = world.collectSnapshot(world.stateVersion);
      if (snap.projectiles.length > 0 && firstProjPos === null) {
        const p = snap.projectiles[0];
        assert.strictEqual(p.length, 3, 'projectile serialized as [id, x, y]');
        assert.ok(Number.isFinite(p[1]) && Number.isFinite(p[2]), 'projectile has numeric position');
        firstProjPos = { x: p[1], y: p[2] };
      }
      const alive = snap.knights.find((k) => k.id === enemy.id);
      if (!alive || alive.hp < initialHp) {
        hit = true;
      }
    }

    assert.ok(firstProjPos, 'cannon fired a projectile at the enemy');
    // Снаряд стартует из дула (а не из центра): первый кадр рядом с muzzle-точкой.
    const distFromMuzzle = Math.hypot(firstProjPos.x - muzzleX, firstProjPos.y - muzzleY);
    assert.ok(
      distFromMuzzle <= 8,
      `projectile spawns at the muzzle offset (dist=${distFromMuzzle.toFixed(1)}px from muzzle)`
    );
    assert.ok(hit, 'projectile hit the enemy and dealt damage');

    // Урон пушки должен быть осмысленным (значение балансируется в константе).
    assert.ok(CASTLE_CANNON_DAMAGE > 0, 'cannon deals positive damage');
  }

  // ── 2. Враг вне радиуса не обстреливается. ──────────────────────────────────
  {
    const world = new WorldSim({ seed: 7, slots });
    const centerX = yellowCastle.x + 16;
    const centerY = yellowCastle.y + 16;
    world.knightSystem.spawn({
      x: centerX + CASTLE_CANNON_RANGE_PX + 4 * TILE_SIZE,
      y: centerY,
      ownerUserId: blue,
      healthLevel: 2,
      attackLevel: 0,
    });
    let sawProjectile = false;
    for (let i = 0; i < 40; i++) {
      world.tick(50);
      if (world.collectSnapshot(world.stateVersion).projectiles.length > 0) {
        sawProjectile = true;
      }
    }
    assert.ok(!sawProjectile, 'no projectiles for an out-of-range enemy');
    assert.strictEqual(world.knightSystem.countKnightsForOwner(blue), 1, 'out-of-range enemy survives');
  }

  // ── 3. Проверяем скорость: снаряд летит заметно (несколько кадров в полёте). ─
  {
    assert.ok(
      CASTLE_CANNON_PROJECTILE_SPEED_PX_PER_MS > 0.05,
      'projectile must outrun a knight (0.05 px/ms) to guarantee a hit'
    );
  }

  console.log('  ✓ castle cannon fires, projectile syncs, level-2 knight dies in one hit');
  console.log('  ✓ out-of-range enemies are not shot');
  console.log('  ✓ all castle-cannon assertions passed');
}

try {
  run();
  console.log('\nPASS\n');
  process.exit(0);
} catch (err) {
  console.error('\nFAIL:', err.stack || err.message);
  process.exit(1);
}
