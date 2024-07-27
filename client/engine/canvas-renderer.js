import { BACKGROUND_COLOR, SELECTOR_COLOR } from '../constants/colors.js';
import { SELECTOR_LINE_WIDTH, TILE_SIZE } from '../constants/sizes.js';
import { tiles } from '../constants/tiles.js';
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
  drawSelector({ tx, ty }) {
    this.ctx.lineWidth = SELECTOR_LINE_WIDTH;
    this.ctx.strokeStyle = SELECTOR_COLOR;

    this.ctx.strokeRect(tx, ty, TILE_SIZE, TILE_SIZE);
  }

  /**
   * @param {{state: Map<string, Cell>}}
   */
  drawState({ state }) {
    for (const [cords, cell] of state.entries()) {
      if (cell.isRenderable) {
        const [x, y] = cords.split(':');

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
  }
}
