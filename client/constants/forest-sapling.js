/**
 * Саженцы / молодая флора → взрослый вид при дозревании (см. `tryMatureOneSapling`).
 * @type {Record<string, string>}
 */
export const SAPLING_TILE_KEY_TO_MATURE = {
  bush: 'spruce',
  twoBushes: 'twoSpruces',
  littleTree: 'tree',
  twoLittleTrees: 'twoTrees',
};

/**
 * Средний размер → «большой» (после spruce / twoSpruces / tree / twoTrees).
 * @type {Record<string, string>}
 */
export const MID_TREE_TILE_KEY_TO_BIG = {
  spruce: 'bigSpruce',
  twoSpruces: 'twoBigSpruces',
  tree: 'bigTree',
  twoTrees: 'twoBigTrees',
};
