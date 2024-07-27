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
};

export class Tree {
  constructor({ treeType }) {
    this.treeType = treeType;
  }
}
