import { Random } from '../../common/random.js';
import { TILE_SIZE } from '../../constants/sizes.js';
import { tiles } from '../../constants/tiles.js';
import { Tree } from '../entities/tree.js';

export class TreesGenerator {
  static #generatedTreeTypes = {
    spruce: tiles.spruce.type,
    twoSpruces: tiles.twoSpruces.type,
    bigSpruce: tiles.bigSpruce.type,
    twoBigSpruces: tiles.twoBigSpruces.type,
    tree: tiles.tree.type,
    twoTrees: tiles.twoTrees.type,
    bigTree: tiles.bigTree.type,
    twoBigTrees: tiles.twoBigTrees.type,
  };

  /**
   * @typedef {import('../../engine/state/state-manager.js').StateManager} StateManager
   * @param {StateManager} stateManager
   * @param {{from: {x: number, y:number}, to: {x:number,y:number}}} param generate cube of trees with cords <from> <to>
   */
  static generateTrees(stateManager, { from, to }) {
    for (let x = from.x; x <= to.x; x += TILE_SIZE) {
      for (let y = from.y; y <= to.y; y += TILE_SIZE) {
        const randomTreeType = this.#getRandomTreeType();

        const treeEntity = new Tree({ treeType: randomTreeType });

        stateManager.setCell({ x, y, tileData: tiles[randomTreeType], entity: treeEntity });
      }
    }
  }

  static #getRandomTreeType() {
    const treeTypesArr = Object.keys(this.#generatedTreeTypes);

    const randomIndex = Random.getRandomFromRange(0, treeTypesArr.length - 1);

    return this.#generatedTreeTypes[treeTypesArr[randomIndex]];
  }
}
