import { Sprite } from '../engine/sprite.js';
import { tiles } from '../constants/tiles.js';

export class Game {
  /**
   * Creates an instance of Game.
   *
   * @typedef {import('../engine/canvas-renderer.js').CanvasRenderer} CanvasRenderer
   * @typedef {import('../engine/controls.js').Controls} Controls
   *
   * @constructor
   * @param {{ renderer: CanvasRenderer, controls: Controls }} options
   */
  constructor({ renderer, controls }) {
    this.renderer = renderer;

    //TODO: remove TEST DATA
    this.sprites = [];
    let offset = 16;
    let iteration = 1;

    for (const key in tiles) {
      const sprite = new Sprite(tiles[key]);

      sprite.setPos({
        x: offset,
        y: 32 * iteration,
      });

      offset += 32;

      if (offset >= 128) {
        offset = 16;
        iteration++;
      }

      this.sprites.push(sprite);
    }
    //END TEST DATA
  }

  render() {
    this.renderer.clear();

    this.renderer.drawSprites(this.sprites);
  }

  update(timeStep) {
    const rnd = (min, max) => {
      // min and max included
      return Math.floor(Math.random() * (max - min + 1) + min);
    };

    const r = rnd(0, 8);

    this.sprites[r].setPos({ x: this.sprites[r].getPos().x + 1 });
  }
}
