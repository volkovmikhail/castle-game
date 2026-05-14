import { TREE_MAX_HP } from '../../constants/structure-hp.js';
import { tiles } from '../../constants/tiles.js';

export const treeTypes = {
  spruce: tiles.spruce.type,
  twoSpruces: tiles.twoSpruces.type,
  bigSpruce: tiles.bigSpruce.type,
  twoBigSpruces: tiles.twoBigSpruces.type,
  tree: tiles.tree.type,
  twoTrees: tiles.twoTrees.type,
  bigTree: tiles.bigTree.type,
  twoBigTrees: tiles.twoBigTrees.type,
  littleTree: tiles.littleTree.type,
  twoLittleTrees: tiles.twoLittleTrees.type,
  bush: tiles.bush.type,
  twoBushes: tiles.twoBushes.type,
  combinePlants: tiles.combinePlants.type,
  rock: tiles.rock.type,
  twoRocks: tiles.twoRocks.type,
  logs: tiles.logs.type,
};

export class Tree {
  constructor({ treeType }) {
    this.treeType = treeType;
    this.hp = TREE_MAX_HP;
    this.maxHp = TREE_MAX_HP;
    /** Деревья не участвуют в регенерации HP. */
    this.regenerates = false;
    /** Время последнего урона (`performance.now()`); для полоски HP. */
    this.lastDamagedAtMs = 0;
  }
}
