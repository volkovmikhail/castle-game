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
    return 'Введите количество больше нуля.';
  }

  switch (kind) {
    case 'wheatToGold': {
      const batches = Math.floor(q / SHOP_WHEAT_PER_ONE_GOLD);
      if (batches < 1) {
        return `Нужно минимум ${SHOP_WHEAT_PER_ONE_GOLD} пшеницы, чтобы получить золото.`;
      }
      const cost = batches * SHOP_WHEAT_PER_ONE_GOLD;
      const gold = batches;
      return `За ${cost} пшеницы вы получите ${gold} золота (у вас ${resources.wheat}).`;
    }
    case 'woodToGold': {
      const batches = Math.floor(q / SHOP_WOOD_PER_ONE_GOLD);
      if (batches < 1) {
        return `Нужно минимум ${SHOP_WOOD_PER_ONE_GOLD} дерева, чтобы получить золото.`;
      }
      const cost = batches * SHOP_WOOD_PER_ONE_GOLD;
      const gold = batches;
      return `За ${cost} дерева вы получите ${gold} золота (у вас ${resources.wood}).`;
    }
    case 'goldToWood': {
      const wood = q * SHOP_WOOD_PER_SPENT_GOLD;
      return `За ${q} золота вы получите ${wood} дерева (у вас ${resources.gold} золота).`;
    }
    case 'goldToWheat': {
      const wheat = q * SHOP_WHEAT_PER_SPENT_GOLD;
      return `За ${q} золота вы получите ${wheat} пшеницы (у вас ${resources.gold} золота).`;
    }
    default:
      return '';
  }
}
