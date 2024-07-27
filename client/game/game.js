import { Sprite } from '../engine/sprite.js';
import { tiles } from '../constants/tiles.js';
import { TestTilesGenerator } from '../engine/test-tiles-generator.js';
import { TreesGenerator } from './generators/trees-generator.js';

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
  }

  init() {
    //TestTilesGenerator.generateAllTiles(this.stateManager);

    const rendererSize = this.renderer.getRendererSize();

    TreesGenerator.generateTrees(this.stateManager, {
      from: { x: 0, y: 0 },
      to: { x: rendererSize.width, y: rendererSize.height },
    });
  }

  render() {
    this.renderer.clear();

    this.renderer.drawSelector(this.controls.getSelectedCoords());

    this.renderer.drawState({ state: this.stateManager.getState() });
  }

  update(timeStep) {
    const clickedCords = this.controls.getClickedCoords();

    if (clickedCords !== null) {
      this.stateManager.setCell({ x: clickedCords.tx, y: clickedCords.ty, tileData: tiles.houseBlacksmith });
      console.log(this.stateManager.getState());
    }
  }
}
