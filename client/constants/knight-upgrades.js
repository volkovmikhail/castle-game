/**
 * @typedef {import('./resources.js').PlayerResources} PlayerResources
 * @typedef {'health' | 'attack'} KnightUpgradeKind
 */

/** Макс. уровень одной характеристики на одну готовую кузницу. */
export const KNIGHT_UPGRADE_LEVELS_PER_BLACKSMITH = 5;

/** Готовая кузница на карте. */
export const BLACKSMITH_COMPLETED_SPRITE_TYPE = 'houseBlacksmith';

export const BLACKSMITH_CONSTRUCTION_SPRITE_TYPES = [
  'houseBlacksmithStage1',
  'houseBlacksmithStage2',
];

/** Базовые статы рыцаря без прокачки (уровень 0). */
export const KNIGHT_BASE_HP = 100;
export const KNIGHT_BASE_ATTACK = 15;

/** Прирост за каждый уровень прокачки (общий для всех рыцарей игрока). */
export const KNIGHT_HP_PER_UPGRADE_LEVEL = 30;
export const KNIGHT_ATTACK_PER_UPGRADE_LEVEL = 5;

/**
 * @param {number} blacksmithCount
 * @returns {number}
 */
export function maxKnightUpgradeLevelForBlacksmiths(blacksmithCount) {
  return Math.max(0, blacksmithCount) * KNIGHT_UPGRADE_LEVELS_PER_BLACKSMITH;
}

/**
 * @param {number} level
 * @returns {number}
 */
export function knightMaxHpFromUpgradeLevel(level) {
  return KNIGHT_BASE_HP + level * KNIGHT_HP_PER_UPGRADE_LEVEL;
}

/**
 * @param {number} level
 * @returns {number}
 */
export function knightAttackFromUpgradeLevel(level) {
  return KNIGHT_BASE_ATTACK + level * KNIGHT_ATTACK_PER_UPGRADE_LEVEL;
}

/**
 * Стоимость перехода на уровень `targetLevel` (1…N).
 *
 * @param {KnightUpgradeKind} kind
 * @param {number} targetLevel
 * @returns {PlayerResources}
 */
export function getKnightUpgradeCost(kind, targetLevel) {
  const lvl = Math.max(1, Math.floor(targetLevel));
  const attackMul = kind === 'attack' ? 1.15 : 1;
  return {
    wheat: lvl >= 3 ? Math.floor((8 + lvl * 6) * attackMul) : 0,
    wood: Math.floor((20 + lvl * 14) * attackMul),
    gold: Math.floor((30 + lvl * 22) * attackMul),
  };
}

/**
 * @param {KnightUpgradeKind} kind
 * @param {number} targetLevel
 * @returns {string}
 */
export function formatKnightUpgradeCostLine(kind, targetLevel) {
  const c = getKnightUpgradeCost(kind, targetLevel);
  const parts = [];
  if (c.wheat > 0) {
    parts.push(`${c.wheat} пшеницы`);
  }
  if (c.wood > 0) {
    parts.push(`${c.wood} дерева`);
  }
  if (c.gold > 0) {
    parts.push(`${c.gold} золота`);
  }
  return parts.join(' · ');
}

/**
 * @param {KnightUpgradeKind} kind
 * @param {number} level
 * @returns {string}
 */
export function describeKnightUpgradeStat(kind, level) {
  if (kind === 'health') {
    return `HP: ${knightMaxHpFromUpgradeLevel(level)}`;
  }
  return `Урон: ${knightAttackFromUpgradeLevel(level)}`;
}
