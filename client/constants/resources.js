/**
 * @typedef {{ wheat: number; wood: number; gold: number }} PlayerResources
 */

/** Базовый лимит хранения пшеницы и дерева (без сараев). Золото не ограничено. */
export const BASE_STORAGE_CAP_WHEAT_WOOD = 500;

/** За каждый построенный сарай (`houseBarn` / `houseBarnSide`) к лимиту пшеницы и дерева. */
export const STORAGE_BONUS_PER_BARN_WHEAT_WOOD = 250;

/** Слотов для рыцарей за каждый готовый жилой дом (`house` / `houseSide` / `houseDouble`). */
export const KNIGHT_SLOTS_PER_RESIDENTIAL_HOUSE = 5;

/** Готовые жилые дома (все варианты) — увеличивают лимит рыцарей. */
export const RESIDENTIAL_HOUSE_COMPLETED_TYPES = ['house', 'houseSide', 'houseDouble'];

/**
 * Стартовые ресурсы каждого игрока при загрузке / пересборке мира.
 * @type {PlayerResources}
 */
export const STARTING_PLAYER_RESOURCES = {
  wheat: 500,
  wood: 500,
  gold: 1000,
};

/**
 * @returns {PlayerResources}
 */
export function cloneStartingResources() {
  return { ...STARTING_PLAYER_RESOURCES };
}

/** Маленькие (куст, малый дуб/ёлка и т.п.) — за сруб. */
export const WOOD_PER_KNIGHT_SMALL_FOREST_CHOP = 5;

/** Средние (spruce, tree и пары) — за сруб. */
export const WOOD_PER_KNIGHT_MEDIUM_FOREST_CHOP = 10;

/** Большие (bigSpruce, bigTree и пары) — за сруб. */
export const WOOD_PER_KNIGHT_BIG_FOREST_CHOP = 15;

/** @deprecated алиас среднего размера; оставлен для совместимости. */
export const WOOD_PER_KNIGHT_TREE_CHOP = WOOD_PER_KNIGHT_MEDIUM_FOREST_CHOP;

/**
 * Дерево за сруб по типу спрайта (нижний регистр), без камней/поленьев/combine.
 *
 * @param {string} st
 * @returns {number}
 */
export function getKnightChopWoodForForestSprite(st) {
  if (
    st === 'bigspruce' ||
    st === 'twobigspruces' ||
    st === 'bigtree' ||
    st === 'twobigtrees'
  ) {
    return WOOD_PER_KNIGHT_BIG_FOREST_CHOP;
  }
  if (st === 'spruce' || st === 'twospruces' || st === 'tree' || st === 'twotrees') {
    return WOOD_PER_KNIGHT_MEDIUM_FOREST_CHOP;
  }
  if (st === 'bush' || st === 'twobushes' || st === 'littletree' || st === 'twolittletrees') {
    return WOOD_PER_KNIGHT_SMALL_FOREST_CHOP;
  }
  return WOOD_PER_KNIGHT_MEDIUM_FOREST_CHOP;
}

export const WOOD_PER_KNIGHT_LOGS_CHOP = 50;
export const WOOD_PER_KNIGHT_COMBINE_PLANTS_CHOP = 5;

export const GOLD_PER_KNIGHT_ROCK_CHOP = 1;
export const GOLD_PER_KNIGHT_TWO_ROCKS_CHOP = 2;
export const GOLD_PER_KNIGHT_COMBINE_PLANTS_CHOP = 1;
