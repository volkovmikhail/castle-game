import { runSpritePostDraw } from './sprite-post-draw-registry.js';

/**
 * @typedef {{
 *     mapX: number,
 *     mapY: number,
 *     width: number,
 *     height: number,
 *     type?: string
 *   }
 * } TileData
 */

export class Sprite {
  /**
   *
   * @param {TileData} tileData
   */
  constructor(tileData) {
    this.tileData = tileData;

    this.posX = 0;
    this.posY = 0;
  }

  /**
   *
   * @param {{ x: number, y: number }} options
   */
  setPos({ x, y }) {
    this.posX = x ?? this.posX;
    this.posY = y ?? this.posY;
  }

  /**
   *
   * @returns {{ x: number; y: number; }}
   */
  getPos() {
    return {
      x: this.posX,
      y: this.posY,
    };
  }

  /**
   *
   * @returns {TileData}
   */
  getTileData() {
    return this.tileData;
  }

  /**
   * Доп. отрисовка поверх кадра (регистрируется по `tileData.type` в sprite-post-draw-registry).
   * @param {CanvasRenderingContext2D} ctx
   * @param {CanvasImageSource} tileMap
   * @param {number} [timeMs]
   * @param {import('./state/cell.js').Cell} [cell]
   */
  drawPostEffects(ctx, tileMap, timeMs = performance.now(), cell) {
    runSpritePostDraw(this, ctx, tileMap, timeMs, cell);
  }
}
