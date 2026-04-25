import { BACKGROUND_COLOR, SELECTOR_COLOR } from '../constants/colors.js';
import { SELECTOR_LINE_WIDTH, TILE_SIZE } from '../constants/sizes.js';
import { tiles } from '../constants/tiles.js';
import {
  WORLD_BORDER_COLOR,
  WORLD_BORDER_INNER_WIDTH,
  WORLD_BORDER_OUTER_WIDTH,
} from '../constants/world.js';
import { Sprite } from './sprite.js';
import { Cell } from './state/cell.js';

export class CanvasRenderer {
  constructor({ canvas, tileMap }) {
    this.tileMap = tileMap;

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /**
   * @returns {{ width: number; height: number; }}
   */
  getRendererSize() {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }

  clear() {
    this.ctx.fillStyle = BACKGROUND_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Description placeholder
   * @typedef {import('./sprite.js').Sprite} Sprite
   * @param {Sprite[]} sprites
   */
  drawSprites(sprites) {
    for (const sprite of sprites) {
      drawSprite(sprite);
    }
  }

  /**
   * Description placeholder
   * @param {Sprite} sprite
   */
  drawSprite(sprite) {
    const tileData = sprite.getTileData();
    const spritePosition = sprite.getPos();

    this.ctx.drawImage(
      this.tileMap,
      tileData.mapX,
      tileData.mapY,
      tileData.width,
      tileData.height,
      spritePosition.x, //pos x
      spritePosition.y, //pos y
      tileData.width, //width on canvas
      tileData.height //height on canvas
    );
  }

  /**
   * @param {{ tx: number; ty: number; width?: number; height?: number }} param
   */
  drawSelector({ tx, ty, width = TILE_SIZE, height = TILE_SIZE }) {
    this.ctx.lineWidth = SELECTOR_LINE_WIDTH;
    this.ctx.strokeStyle = SELECTOR_COLOR;

    this.ctx.strokeRect(tx, ty, width, height);
  }

  /**
   * @param {{state: Map<string, Cell>, scrollOffset: {offsetX: number, offsetY: number}}}
   */
  drawState({ state, scrollOffset: { offsetX, offsetY } }) {
    for (const [cords, cell] of state.entries()) {
      if (cell.isRenderable) {
        let [x, y] = cords.split(':');

        x = Number(x) + offsetX;
        y = Number(y) + offsetY;

        this.drawCell({ x, y, cell });
      }
    }
  }

  /**
   * @param {{ x: number; y: number; cell: Cell; }}
   */
  drawCell({ x, y, cell }) {
    const tileData = tiles[cell.spriteType];

    const sprite = new Sprite(tileData);

    sprite.setPos({ x, y });

    this.drawSprite(sprite);

    sprite.drawPostEffects(this.ctx, this.tileMap);
  }

  /**
   * @param {{
   *   scrollOffset: { offsetX: number; offsetY: number };
   *   x: number;
   *   y: number;
   *   width: number;
   *   height: number;
   * }} param0
   */
  drawWorldBorder({ scrollOffset: { offsetX, offsetY }, x, y, width, height }) {
    const worldX = x + offsetX;
    const worldY = y + offsetY;
    const fenceThickness = Math.max(WORLD_BORDER_INNER_WIDTH, WORLD_BORDER_OUTER_WIDTH);

    this.ctx.save();
    this.ctx.fillStyle = WORLD_BORDER_COLOR;

    // Рисуем забор в "внешней" клетке: он примыкает к границе мира,
    // но не перекрывает последнюю игровую клетку.
    this.ctx.fillRect(worldX, worldY - fenceThickness, width, fenceThickness);
    this.ctx.fillRect(worldX, worldY + height, width, fenceThickness);
    this.ctx.fillRect(worldX - fenceThickness, worldY - fenceThickness, fenceThickness, height + fenceThickness * 2);
    this.ctx.fillRect(worldX + width, worldY - fenceThickness, fenceThickness, height + fenceThickness * 2);
    this.ctx.restore();
  }
}
