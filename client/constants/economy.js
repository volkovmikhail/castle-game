/**
 * @typedef {import('./resources.js').PlayerResources} PlayerResources
 */

/** Ключ рыцаря в панели (не из тайлмапа). */
export const KNIGHT_TOOL_KEY = 'knight';

/** Сарай в панели: при постройке случайно `houseBarn` или `houseBarnSide` (тот же геймплей). */
export const BARN_TOOL_KEY = 'barn';

/** Жилой дом в панели: случайно `house` / `houseSide` / `houseDouble` (тот же геймплей). */
export const HOUSE_TOOL_KEY = 'house';

/** Кузница в панели → `houseBlacksmith` (стадии стройки). */
export const BLACKSMITH_TOOL_KEY = 'blacksmith';

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
  houseFarm: {
    wood: 70,
    gold: 40,
    wheat: 20,
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
  [BARN_TOOL_KEY]: {
    wood: 80,
    gold: 45,
    wheat: 25,
  },
  [HOUSE_TOOL_KEY]: {
    wood: 60,
    gold: 35,
    wheat: 15,
  },
  [BLACKSMITH_TOOL_KEY]: {
    wood: 90,
    gold: 55,
    wheat: 30,
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

/** Человекочитаемые названия ресурсов для сообщений. */
const RESOURCE_LABELS = {
  wheat: 'wheat',
  wood: 'wood',
  gold: 'gold',
};

/**
 * Сколько каждого ресурса не хватает до стоимости (только положительная нехватка).
 *
 * @param {PlayerResources} resources
 * @param {Partial<PlayerResources>} cost
 * @returns {PlayerResources}
 */
export function getMissingResources(resources, cost) {
  const c = normalizeCost(cost);
  return {
    wheat: Math.max(0, c.wheat - resources.wheat),
    wood: Math.max(0, c.wood - resources.wood),
    gold: Math.max(0, c.gold - resources.gold),
  };
}

/**
 * Сообщение «не хватает …» с перечислением недостающих ресурсов.
 * Если хватает всего — возвращает общий текст без деталей.
 *
 * @param {PlayerResources} resources
 * @param {Partial<PlayerResources>} cost
 * @returns {string}
 */
export function formatMissingResources(resources, cost) {
  const missing = getMissingResources(resources, cost);
  const parts = [];
  for (const key of /** @type {(keyof PlayerResources)[]} */ (['wheat', 'wood', 'gold'])) {
    if (missing[key] > 0) {
      parts.push(`${missing[key]} ${RESOURCE_LABELS[key]}`);
    }
  }
  if (parts.length === 0) {
    return 'Not enough resources.';
  }
  return `Not enough resources: need ${parts.join(', ')} more.`;
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
