/**
 * Курсы обмена в магазине (настраиваются здесь).
 * Пшеница/дерево → золото: за каждые N единиц ресурса даётся 1 золото.
 * Золото → пшеница/дерево: за 1 золото даётся M единиц.
 */

/** Сколько пшеницы отдаётся за каждое 1 полученное золото. */
export const SHOP_WHEAT_PER_ONE_GOLD = 10;

/** Сколько дерева отдаётся за каждое 1 полученное золото. */
export const SHOP_WOOD_PER_ONE_GOLD = 10;

/** Сколько дерева даётся за 1 потраченное золото. */
export const SHOP_WOOD_PER_SPENT_GOLD = 8;

/** Сколько пшеницы даётся за 1 потраченное золото. */
export const SHOP_WHEAT_PER_SPENT_GOLD = 8;

/** Шаг изменения количества кнопками +/−. */
export const SHOP_QUANTITY_STEP = 10;

/**
 * @typedef {import('./resources.js').PlayerResources} PlayerResources
 * @typedef {'wheatToGold' | 'woodToGold' | 'goldToWood' | 'goldToWheat'} ShopExchangeKind
 */

/**
 * Текст предпросмотра для модалки магазина.
 *
 * @param {ShopExchangeKind} kind
 * @param {number} qty
 * @param {PlayerResources} resources
 * @returns {string}
 */
export function getShopExchangePreviewLine(kind, qty, resources) {
  const q = Math.floor(Number(qty));
  if (!Number.isFinite(q) || q <= 0) {
    return 'Enter an amount greater than zero.';
  }

  switch (kind) {
    case 'wheatToGold': {
      const batches = Math.floor(q / SHOP_WHEAT_PER_ONE_GOLD);
      if (batches < 1) {
        return `You need at least ${SHOP_WHEAT_PER_ONE_GOLD} wheat to get gold.`;
      }
      const cost = batches * SHOP_WHEAT_PER_ONE_GOLD;
      const gold = batches;
      return `For ${cost} wheat you will get ${gold} gold (you have ${resources.wheat}).`;
    }
    case 'woodToGold': {
      const batches = Math.floor(q / SHOP_WOOD_PER_ONE_GOLD);
      if (batches < 1) {
        return `You need at least ${SHOP_WOOD_PER_ONE_GOLD} wood to get gold.`;
      }
      const cost = batches * SHOP_WOOD_PER_ONE_GOLD;
      const gold = batches;
      return `For ${cost} wood you will get ${gold} gold (you have ${resources.wood}).`;
    }
    case 'goldToWood': {
      const wood = q * SHOP_WOOD_PER_SPENT_GOLD;
      return `For ${q} gold you will get ${wood} wood (you have ${resources.gold} gold).`;
    }
    case 'goldToWheat': {
      const wheat = q * SHOP_WHEAT_PER_SPENT_GOLD;
      return `For ${q} gold you will get ${wheat} wheat (you have ${resources.gold} gold).`;
    }
    default:
      return '';
  }
}
