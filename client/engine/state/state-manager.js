import { TILE_SIZE } from '../../constants/sizes.js';
import { Cell } from './cell.js';

export class StateManager {
  /**
   * @typedef {import('./cell.js').Cell} Cell
   * @type {Map<string, Cell>}
   * key - <X:Y> format
   */
  #state = new Map();

  getState() {
    return this.#state;
  }

  /**
   * @param {{
   *   x: number;
   *   y: number;
   *   tileData: {
   *     type: string,
   *     width: number,
   *     height: number
   *   },
   *   ownerUserId: string,
   *   entity: any
   * }}} param
   */
  setCell({ x, y, tileData, entity, ownerUserId = null }) {
    const cellWidth = tileData.width / TILE_SIZE;
    const cellHeight = tileData.height / TILE_SIZE;

    // Calculate it is renderable cell, depends on what size is it,
    // need render only top left corner tile for big tiles.

    for (let i = 0; i < cellWidth; i++) {
      for (let j = 0; j < cellHeight; j++) {
        const isRenderable = i === 0 && j === 0;

        const cellX = x + i * TILE_SIZE;
        const cellY = y + j * TILE_SIZE;

        this.#state.set(
          `${cellX}:${cellY}`,
          new Cell({
            spriteType: tileData.type,
            isRenderable,
            ownerUserId,
            entity: isRenderable ? entity : null, // set entity only for renderable cells, to avoid entity duplication
          })
        );
      }
    }
  }
}
