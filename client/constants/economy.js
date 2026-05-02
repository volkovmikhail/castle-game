/**
 * @typedef {import('./resources.js').PlayerResources} PlayerResources
 */

/** Ключ рыцаря в панели (не из тайлмапа). */
export const KNIGHT_TOOL_KEY = 'knight';

/**
 * Стоимость постройки / найма по ключу инструмента в панели.
 * `uniquePerPlayer`: для этого типа допускается не более одного здания у игрока.
 *
 * @type {Record<string, Partial<PlayerResources> & { uniquePerPlayer?: boolean }>}
 */
export const PLACEMENT_COSTS = {
  farmStage1: {
    wood: 50,
    gold: 25,
  },
  market: {
    wheat: 50,
    wood: 50,
    gold: 50,
    uniquePerPlayer: true,
  },
  [KNIGHT_TOOL_KEY]: {
    wheat: 25,
    gold: 25,
  },
};

/**
 * @param {Partial<PlayerResources> | undefined} partial
 * @returns {PlayerResources}
 */
export function normalizeCost(partial) {
  return {
    wheat: partial?.wheat ?? 0,
    wood: partial?.wood ?? 0,
    gold: partial?.gold ?? 0,
  };
}

/**
 * @param {PlayerResources} resources
 * @param {Partial<PlayerResources>} cost
 */
export function canAfford(resources, cost) {
  const c = normalizeCost(cost);
  return resources.wheat >= c.wheat && resources.wood >= c.wood && resources.gold >= c.gold;
}

/**
 * Списывает стоимость (мутация `resources`).
 *
 * @param {PlayerResources} resources
 * @param {Partial<PlayerResources>} cost
 */
export function subtractResources(resources, cost) {
  const c = normalizeCost(cost);
  resources.wheat -= c.wheat;
  resources.wood -= c.wood;
  resources.gold -= c.gold;
}

/**
 * @param {string} toolKey
 * @returns {Partial<PlayerResources> & { uniquePerPlayer?: boolean }}
 */
export function getPlacementCostEntry(toolKey) {
  const entry = PLACEMENT_COSTS[toolKey];
  if (!entry) {
    return {};
  }
  return { ...entry };
}

/**
 * Только числовые поля стоимости (без флагов).
 *
 * @param {string} toolKey
 * @returns {PlayerResources}
 */
export function getNumericCost(toolKey) {
  const { uniquePerPlayer: _u, ...rest } = getPlacementCostEntry(toolKey);
  return normalizeCost(rest);
}

/**
 * Краткая строка для подписи в панели построек.
 *
 * @param {string} toolKey
 * @returns {string}
 */
export function formatCostLineForTool(toolKey) {
  const c = getNumericCost(toolKey);
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
