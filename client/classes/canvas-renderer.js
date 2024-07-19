import { BACKGROUND_COLOR } from '../constants/colors.js';

export class CanvasRenderer {
  constructor({ canvas, tileMap }) {
    this.tileMap = tileMap;

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
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
  }
}
