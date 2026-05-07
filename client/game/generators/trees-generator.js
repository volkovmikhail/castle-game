import { Random } from '../../common/random.js';
import { TILE_SIZE } from '../../constants/sizes.js';
import { tiles } from '../../constants/tiles.js';
import { Tree } from '../entities/tree.js';
import { isInsideCastleNoTreeMargin } from './castle-tree-margins.js';

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
   * @param {{
   *   from: { x: number; y: number };
   *   to: { x: number; y: number };
   *   knightOccupiedTileKeys?: Set<string>;
   * }} param generate cube of trees with cords <from> <to>
   */
  static generateTrees(stateManager, { from, to, knightOccupiedTileKeys }) {
    const blocked = knightOccupiedTileKeys ?? new Set();
    for (let x = from.x; x <= to.x; x += TILE_SIZE) {
      for (let y = from.y; y <= to.y; y += TILE_SIZE) {
        if (isInsideCastleNoTreeMargin(x, y)) {
          continue;
        }

        const randomTreeType = this.#getRandomTreeType();
        const tileData = tiles[randomTreeType];
        const cellsWide = tileData.width / TILE_SIZE;
        const cellsHigh = tileData.height / TILE_SIZE;
        let underKnight = false;
        for (let ix = 0; ix < cellsWide && !underKnight; ix++) {
          for (let iy = 0; iy < cellsHigh && !underKnight; iy++) {
            const cx = x + ix * TILE_SIZE;
            const cy = y + iy * TILE_SIZE;
            if (blocked.has(`${cx}:${cy}`)) {
              underKnight = true;
            }
          }
        }
        if (underKnight) {
          continue;
        }

        const treeEntity = new Tree({ treeType: randomTreeType });

        stateManager.setCell({ x, y, tileData, entity: treeEntity });
      }
    }
  }

  static #getRandomTreeType() {
    const treeTypesArr = Object.keys(this.#generatedTreeTypes);

    const randomIndex = Random.getRandomFromRange(0, treeTypesArr.length - 1);

    return this.#generatedTreeTypes[treeTypesArr[randomIndex]];
  }

  /**
   * Ключ тайла в `tiles` для случайного типа дерева (для переростка леса).
   *
   * @returns {string}
   */
  static pickRandomTreeTileKey() {
    const treeTypesArr = Object.keys(this.#generatedTreeTypes);
    const randomIndex = Random.getRandomFromRange(0, treeTypesArr.length - 1);
    return treeTypesArr[randomIndex];
  }

  /**
   * @returns {string[]}
   */
  static getTreeTileKeys() {
    return Object.keys(this.#generatedTreeTypes);
  }
}
