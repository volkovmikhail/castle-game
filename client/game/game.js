import { tiles } from '../constants/tiles.js';
import { DEFAULT_BUILDING_KEY } from '../constants/buildings-toolbar.js';
import './atmosphere/castle-flags.js';
import { SnowOverlay } from './atmosphere/snow-overlay.js';
import { TreesGenerator } from './generators/trees-generator.js';

export class Game {
  /**
   * Creates an instance of Game.
   *
   * @typedef {import('../engine/canvas-renderer.js').CanvasRenderer} CanvasRenderer
   * @typedef {import('../engine/controls.js').Controls} Controls
   * @typedef {import('../engine/state/state-manager.js').StateManager} StateManager
   * @typedef {import('../ui/ui.js').UI} UI
   *
   * @constructor
   * @param {{ renderer: CanvasRenderer, controls: Controls, stateManager: StateManager, ui: UI }} options
   */
  constructor({ renderer, controls, stateManager, ui }) {
    this.renderer = renderer;
    this.controls = controls;
    this.stateManager = stateManager;
    this.ui = ui;

    /** @type {SnowOverlay | null} */
    this.snow = null;
  }

  init() {
    //TestTilesGenerator.generateAllTiles(this.stateManager);
    this.#setupWorld();
  }

  /** Пересобрать мир под текущий размер канваса (resize окна / панели). */
  resizeViewport() {
    this.#setupWorld();
  }

  #setupWorld() {
    this.stateManager.clear();

    const rendererSize = this.renderer.getRendererSize();

    TreesGenerator.generateTrees(this.stateManager, {
      from: { x: 0, y: 0 },
      to: { x: rendererSize.width, y: rendererSize.height },
    });

    this.snow = new SnowOverlay({
      width: rendererSize.width,
      height: rendererSize.height,
    });
  }

  render() {
    this.renderer.clear();

    const buildingKey = this.ui.getSelectedBuilding() ?? DEFAULT_BUILDING_KEY;
    const tileData = tiles[buildingKey];
    const { tx, ty } = this.controls.getSelectedCoords();

    this.renderer.drawSelector({
      tx,
      ty,
      width: tileData.width,
      height: tileData.height,
    });

    this.renderer.drawState({ state: this.stateManager.getState(), scrollOffset: this.controls.getScrollOffset() });

    this.snow?.render(this.renderer.ctx, this.controls.getScrollOffset());
  }

  update(timeStep) {
    this.snow?.update(timeStep, this.controls.getScrollOffset());

    const clickedCords = this.controls.getClickedCoords();

    if (clickedCords !== null) {
      this.stateManager.setCell({
        x: clickedCords.tx,
        y: clickedCords.ty,
        tileData: tiles[this.ui.getSelectedBuilding() ?? DEFAULT_BUILDING_KEY],
      });
      console.log(this.stateManager.getState());
    }
  }
}
