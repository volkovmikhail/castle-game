import { tiles } from '../constants/tiles.js';
import { DEFAULT_BUILDING_KEY } from '../constants/buildings-toolbar.js';
import { TILE_SIZE } from '../constants/sizes.js';
import {
  WORLD_HEIGHT_PX,
  WORLD_MIN_VISIBLE_EDGE_PX,
  WORLD_WIDTH_PX,
} from '../constants/world.js';
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
    this.controls.setViewportSize({ width: rendererSize.width, height: rendererSize.height });

    const visibleOuterMarginX = Math.max(0, rendererSize.width - WORLD_MIN_VISIBLE_EDGE_PX);
    const visibleOuterMarginY = Math.max(0, rendererSize.height - WORLD_MIN_VISIBLE_EDGE_PX);

    const fromX = Math.floor(-visibleOuterMarginX / TILE_SIZE) * TILE_SIZE;
    const fromY = Math.floor(-visibleOuterMarginY / TILE_SIZE) * TILE_SIZE;
    const toX = Math.ceil((WORLD_WIDTH_PX + visibleOuterMarginX - TILE_SIZE) / TILE_SIZE) * TILE_SIZE;
    const toY = Math.ceil((WORLD_HEIGHT_PX + visibleOuterMarginY - TILE_SIZE) / TILE_SIZE) * TILE_SIZE;

    TreesGenerator.generateTrees(this.stateManager, {
      from: { x: fromX, y: fromY },
      to: { x: toX, y: toY },
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
    this.renderer.drawWorldBorder({
      scrollOffset: this.controls.getScrollOffset(),
      x: 0,
      y: 0,
      width: WORLD_WIDTH_PX,
      height: WORLD_HEIGHT_PX,
    });

    this.snow?.render(this.renderer.ctx, this.controls.getScrollOffset());
  }

  update(timeStep) {
    this.snow?.update(timeStep, this.controls.getScrollOffset());

    const clickedCords = this.controls.getClickedCoords();

    if (clickedCords !== null) {
      const tileData = tiles[this.ui.getSelectedBuilding() ?? DEFAULT_BUILDING_KEY];
      if (this.#isInsideWorld({ x: clickedCords.tx, y: clickedCords.ty, tileData })) {
        this.stateManager.setCell({
          x: clickedCords.tx,
          y: clickedCords.ty,
          tileData,
        });
      }
    }
  }

  /**
   * @param {{ x: number; y: number; tileData: { width: number; height: number } }} param0
   * @returns {boolean}
   */
  #isInsideWorld({ x, y, tileData }) {
    const maxX = WORLD_WIDTH_PX - tileData.width;
    const maxY = WORLD_HEIGHT_PX - tileData.height;

    return x >= 0 && y >= 0 && x <= maxX && y <= maxY;
  }
}
