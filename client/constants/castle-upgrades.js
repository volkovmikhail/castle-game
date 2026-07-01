/**
 * Прокачка пушки замка. Клик по своему замку открывает модалку с тремя ветками:
 *  - range  (радиус выстрела): +1 клетка за уровень, максимум 5 уровней;
 *  - damage (урон):            +фикс за уровень, БЕЗ верхнего лимита;
 *  - speed  (скорость выстрела): -0.1 c к интервалу за уровень, максимум 5 уровней.
 *
 * Значения выводятся от базовых констант пушки (castle-cannon.js), поэтому баланс
 * базы правится там, а шаг прокачки — здесь.
 *
 * @typedef {import('./resources.js').PlayerResources} PlayerResources
 * @typedef {'range' | 'damage' | 'speed'} CastleUpgradeKind
 * @typedef {{ rangeLevel: number; damageLevel: number; speedLevel: number }} CastleUpgrades
 */
import { TILE_SIZE } from './sizes.js';
import {
  CASTLE_CANNON_DAMAGE,
  CASTLE_CANNON_FIRE_INTERVAL_MS,
  CASTLE_CANNON_RANGE_TILES,
} from './castle-cannon.js';

/** Пределы уровней. Урон не ограничен. */
export const CASTLE_RANGE_MAX_LEVEL = 5;
export const CASTLE_SPEED_MAX_LEVEL = 5;
export const CASTLE_DAMAGE_MAX_LEVEL = Infinity;

/** Шаг прокачки. */
export const CASTLE_RANGE_TILES_PER_LEVEL = 1;
export const CASTLE_DAMAGE_PER_LEVEL = 15;
export const CASTLE_FIRE_INTERVAL_REDUCTION_MS_PER_LEVEL = 100;

/** Ниже этого интервал не опускается (страховка, даже если добавят уровней). */
export const CASTLE_FIRE_INTERVAL_MIN_MS = 200;

/** @returns {CastleUpgrades} */
export function createEmptyCastleUpgrades() {
  return { rangeLevel: 0, damageLevel: 0, speedLevel: 0 };
}

/**
 * @param {CastleUpgradeKind} kind
 * @returns {number}
 */
export function castleMaxLevelForKind(kind) {
  if (kind === 'range') {
    return CASTLE_RANGE_MAX_LEVEL;
  }
  if (kind === 'speed') {
    return CASTLE_SPEED_MAX_LEVEL;
  }
  return CASTLE_DAMAGE_MAX_LEVEL;
}

/**
 * @param {number} level
 * @returns {number} радиус в клетках
 */
export function castleRangeTilesFromLevel(level) {
  return CASTLE_CANNON_RANGE_TILES + Math.max(0, level) * CASTLE_RANGE_TILES_PER_LEVEL;
}

/**
 * @param {number} level
 * @returns {number} радиус в пикселях
 */
export function castleRangePxFromLevel(level) {
  return castleRangeTilesFromLevel(level) * TILE_SIZE;
}

/**
 * @param {number} level
 * @returns {number} урон одного выстрела
 */
export function castleDamageFromLevel(level) {
  return CASTLE_CANNON_DAMAGE + Math.max(0, level) * CASTLE_DAMAGE_PER_LEVEL;
}

/**
 * @param {number} level
 * @returns {number} интервал между выстрелами (мс)
 */
export function castleFireIntervalMsFromLevel(level) {
  const ms =
    CASTLE_CANNON_FIRE_INTERVAL_MS - Math.max(0, level) * CASTLE_FIRE_INTERVAL_REDUCTION_MS_PER_LEVEL;
  return Math.max(CASTLE_FIRE_INTERVAL_MIN_MS, ms);
}

/**
 * Стоимость перехода на уровень `targetLevel` (1…N).
 *
 * @param {CastleUpgradeKind} kind
 * @param {number} targetLevel
 * @returns {PlayerResources}
 */
export function getCastleUpgradeCost(kind, targetLevel) {
  const lvl = Math.max(1, Math.floor(targetLevel));
  const mult = kind === 'range' ? 1.3 : kind === 'speed' ? 1.15 : 1;
  return {
    wheat: 0,
    wood: Math.floor((30 + lvl * 20) * mult),
    gold: Math.floor((40 + lvl * 30) * mult),
  };
}

/**
 * @param {CastleUpgradeKind} kind
 * @param {number} targetLevel
 * @returns {string}
 */
export function formatCastleUpgradeCostLine(kind, targetLevel) {
  const c = getCastleUpgradeCost(kind, targetLevel);
  const parts = [];
  if (c.wheat > 0) {
    parts.push(`${c.wheat} wheat`);
  }
  if (c.wood > 0) {
    parts.push(`${c.wood} wood`);
  }
  if (c.gold > 0) {
    parts.push(`${c.gold} gold`);
  }
  return parts.join(' · ');
}

/**
 * @param {CastleUpgradeKind} kind
 * @param {number} level
 * @returns {string}
 */
export function describeCastleUpgradeStat(kind, level) {
  if (kind === 'range') {
    return `Range: ${castleRangeTilesFromLevel(level)} tiles`;
  }
  if (kind === 'speed') {
    return `Fire interval: ${castleFireIntervalMsFromLevel(level)} ms`;
  }
  return `Damage: ${castleDamageFromLevel(level)}`;
}

/**
 * Уровень для указанной ветки из объекта прокачки.
 *
 * @param {CastleUpgrades} up
 * @param {CastleUpgradeKind} kind
 * @returns {number}
 */
export function castleUpgradeLevel(up, kind) {
  if (kind === 'range') {
    return up.rangeLevel;
  }
  if (kind === 'speed') {
    return up.speedLevel;
  }
  return up.damageLevel;
}
