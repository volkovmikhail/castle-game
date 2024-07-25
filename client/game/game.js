import { Sprite } from '../engine/sprite.js';
import { tiles } from '../constants/tiles.js';

export class Game {
  /**
   * Creates an instance of Game.
   *
   * @typedef {import('../engine/canvas-renderer.js').CanvasRenderer} CanvasRenderer
   * @typedef {import('../engine/controls.js').Controls} Controls
   * @typedef {import('../engine/state/state-manager.js').StateManager} StateManager
   *
   * @constructor
   * @param {{ renderer: CanvasRenderer, controls: Controls, stateManager: StateManager }} options
   */
  constructor({ renderer, controls, stateManager }) {
    this.renderer = renderer;
    this.controls = controls;
    this.stateManager = stateManager;

    //TODO: remove TEST DATA
    this.sprites = [];
    let offset = 16;
    let iteration = 1;

    for (const key in tiles) {
      this.stateManager.setCell({
        x: offset,
        y: 32 * iteration,
        tileData: tiles[key],
      });

      offset += 32;

      if (offset >= 496) {
        offset = 16;
        iteration++;
      }
    }
    //END TEST DATA
  }

  render() {
    this.renderer.clear();

    this.renderer.drawSelector(this.controls.getSelectedCords());

    this.renderer.drawState({ state: this.stateManager.getState() });
  }

  update(timeStep) {
    const clickedCords = this.controls.getClickedCords();

    if (clickedCords !== null) {
      this.stateManager.setCell({ x: clickedCords.tx, y: clickedCords.ty, tileData: tiles.houseBlacksmith });
      console.log(this.stateManager.getState());
    }

    const rnd = (min, max) => {
      // min and max included
      return Math.floor(Math.random() * (max - min + 1) + min);
    };

    // const r = rnd(0, 8);

    // this.sprites[r].setPos({ x: this.sprites[r].getPos().x + 1 });
  }
}
