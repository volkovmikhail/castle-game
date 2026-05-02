/**
 * @typedef {{ wheat: number; wood: number; gold: number }} PlayerResources
 */

/**
 * Стартовые ресурсы каждого игрока при загрузке / пересборке мира.
 * @type {PlayerResources}
 */
export const STARTING_PLAYER_RESOURCES = {
  wheat: 100,
  wood: 100,
  gold: 100,
};

/**
 * @returns {PlayerResources}
 */
export function cloneStartingResources() {
  return { ...STARTING_PLAYER_RESOURCES };
}

/** Дерево, которое получает владелец рыцаря за одно срубленное дерево. */
export const WOOD_PER_KNIGHT_TREE_CHOP = 10;
