import { Random } from '../../common/random.js';
import {
  FOREST_SPAWN_RARE_ROLL_MAX,
  FOREST_SPAWN_RARE_THRESHOLD,
  FOREST_SPAWN_RARE_TILE_KEYS,
} from '../../constants/forest-flora-spawn.js';
import { TILE_SIZE } from '../../constants/sizes.js';
import { tiles } from '../../constants/tiles.js';
import { Tree } from '../entities/tree.js';
import { isInsideCastleNoTreeMargin } from './castle-tree-margins.js';

export class TreesGenerator {
  /**
   * Первичная заливка мира: случайно средние и большие деревья (редкий пул — отдельно).
   */
  static #initialFillForestKeys = [
    'spruce',
    'twoSpruces',
    'tree',
    'twoTrees',
    'bigSpruce',
    'twoBigSpruces',
    'bigTree',
    'twoBigTrees',
  ];

  /**
   * Перерост: только саженцы → дальше дозревание в `forest-regrowth`.
   */
  static #regrowForestKeys = ['bush', 'twoBushes', 'littleTree', 'twoLittleTrees'];

  static #rareForestKeys = FOREST_SPAWN_RARE_TILE_KEYS;

  /**
   * @typedef {import('../../engine/state/state-manager.js').StateManager} StateManager
   * @param {StateManager} stateManager
   * @param {{
   *   from: { x: number; y: number };
   *   to: { x: number; y: number };
   *   knightOccupiedTileKeys?: Set<string>;
   *   castleNoTreeMargins?: import('./castle-tree-margins.js').CastleNoTreeMargin[];
   * }} param generate cube of trees with cords <from> <to>
   */
  static generateTrees(stateManager, { from, to, knightOccupiedTileKeys, castleNoTreeMargins }) {
    const blocked = knightOccupiedTileKeys ?? new Set();
    for (let x = from.x; x <= to.x; x += TILE_SIZE) {
      for (let y = from.y; y <= to.y; y += TILE_SIZE) {
        if (isInsideCastleNoTreeMargin(x, y, castleNoTreeMargins)) {
          continue;
        }

        const tileKey = this.pickRandomForestSpawnTileKey();
        const tileData = tiles[tileKey];
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

        const treeEntity = new Tree({ treeType: tileData.type });

        stateManager.setCell({ x, y, tileData, entity: treeEntity });
      }
    }
  }

  /**
   * Пул обычных (не редких) тайлов первичной заливки леса — для переиспользования
   * внешними модулями (например, декоративный лес за границей карты).
   *
   * @returns {string[]}
   */
  static getInitialFillTileKeys() {
    return [...this.#initialFillForestKeys];
  }

  /**
   * Случайный ключ тайла для первичной генерации леса (редкие типы — по порогу).
   *
   * @returns {string}
   */
  static pickRandomForestSpawnTileKey() {
    const rareRoll = Random.getRandomFromRange(0, FOREST_SPAWN_RARE_ROLL_MAX - 1);
    if (rareRoll < FOREST_SPAWN_RARE_THRESHOLD) {
      const i = Random.getRandomFromRange(0, this.#rareForestKeys.length - 1);
      return this.#rareForestKeys[i];
    }
    const j = Random.getRandomFromRange(0, this.#initialFillForestKeys.length - 1);
    return this.#initialFillForestKeys[j];
  }

  /**
   * Ключ тайла для переростка леса (без камней и поленьев).
   *
   * @returns {string}
   */
  static pickRandomTreeTileKey() {
    const keys = this.getTreeTileKeys();
    const randomIndex = Random.getRandomFromRange(0, keys.length - 1);
    return keys[randomIndex];
  }

  /**
   * Типы, которые могут появиться при переростке (саженцы).
   *
   * @returns {string[]}
   */
  static getTreeTileKeys() {
    return [...this.#regrowForestKeys];
  }
}
