/**
 * Настройки пушки замка: замок сам стреляет по вражеским рыцарям, подошедшим
 * близко. Все параметры собраны здесь — меняйте баланс/вид снаряда в одном месте.
 */
import { TILE_SIZE } from './sizes.js';

/** Радиус (в клетках) вокруг замка, при входе в который враг попадает под обстрел. */
export const CASTLE_CANNON_RANGE_TILES = 3;

/** Тот же радиус в пикселях (от центра замка до центра рыцаря). */
export const CASTLE_CANNON_RANGE_PX = CASTLE_CANNON_RANGE_TILES * TILE_SIZE;

/** Интервал между выстрелами одного замка (мс). 1000 = один выстрел в секунду. */
export const CASTLE_CANNON_FIRE_INTERVAL_MS = 1000;

/**
 * Точка вылета снаряда (дуло пушки) в пикселях относительно левого верхнего угла
 * замка. (0, 0) — стреляет прямо из верхнего левого угла. Замок 32×32 px, так что
 * центр — это (16, 16).
 */
export const CASTLE_CANNON_MUZZLE_OFFSET_X = 11;
export const CASTLE_CANNON_MUZZLE_OFFSET_Y = 7;

/**
 * Урон одного попадания. Должен убивать рыцаря 2-го уровня прокачки HP с одного
 * выстрела: у него knightMaxHpFromUpgradeLevel(2) = 60 HP. Берём с большим запасом.
 */
export const CASTLE_CANNON_DAMAGE = 50;

/**
 * Скорость снаряда (px/мс). Заметно медленная, чтобы полёт было видно, но выше
 * скорости рыцаря (0.05 px/мс) — иначе снаряд не догнал бы убегающую цель.
 */
export const CASTLE_CANNON_PROJECTILE_SPEED_PX_PER_MS = 0.06;

/** Дистанция до центра цели (px), с которой снаряд считается попавшим. */
export const CASTLE_CANNON_HIT_RADIUS_PX = 3;

/** Размер снаряда на экране (px). По ТЗ — 1 пиксель. */
export const CASTLE_CANNON_PROJECTILE_SIZE_PX = 2;
