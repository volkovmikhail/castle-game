import { tiles } from '../constants/tiles.js';
import { DEFAULT_BUILDING_KEY } from '../constants/buildings-toolbar.js';
import { PLAYER_PROFILES } from '../constants/players.js';
import { TILE_SIZE } from '../constants/sizes.js';
import {
  WORLD_HEIGHT_PX,
  WORLD_MIN_VISIBLE_EDGE_PX,
  WORLD_WIDTH_PX,
} from '../constants/world.js';
import './atmosphere/castle-flags.js';
import { SnowOverlay } from './atmosphere/snow-overlay.js';
import { TreesGenerator } from './generators/trees-generator.js';

const MAX_BUILD_DISTANCE_CELLS = 2;
const HOUSE_NEIGHBOR_RADIUS_CELLS = 3;
const AXE_TOOL_KEY = 'axe';

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
    this.localPlayer = PLAYER_PROFILES[Math.floor(Math.random() * PLAYER_PROFILES.length)];
  }

  init() {
    //TestTilesGenerator.generateAllTiles(this.stateManager);
    this.ui.setPlayerBadge(this.localPlayer);
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
    this.#placeInitialCastles();

    this.snow = new SnowOverlay({
      width: rendererSize.width,
      height: rendererSize.height,
    });
  }

  render() {
    this.renderer.clear();
    this.renderer.drawWorldBorder({
      scrollOffset: this.controls.getScrollOffset(),
      x: 0,
      y: 0,
      width: WORLD_WIDTH_PX,
      height: WORLD_HEIGHT_PX,
    });

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
      const selectedBuilding = this.ui.getSelectedBuilding() ?? DEFAULT_BUILDING_KEY;

      if (selectedBuilding === AXE_TOOL_KEY) {
        this.#tryChopTree({ x: clickedCords.tx, y: clickedCords.ty });
        return;
      }

      const tileData = tiles[selectedBuilding];
      const validationError = this.#validatePlacement({
        x: clickedCords.tx,
        y: clickedCords.ty,
        tileData,
      });

      if (validationError) {
        this.ui.showToast(validationError);
        return;
      }

      this.stateManager.setCell({
        x: clickedCords.tx,
        y: clickedCords.ty,
        tileData,
        ownerUserId: this.localPlayer.userId,
      });
    }
  }

  /**
   * @param {{ x: number; y: number }} param0
   */
  #tryChopTree({ x, y }) {
    const state = this.stateManager.getState();
    const cell = state.get(`${x}:${y}`);

    if (!cell) {
      this.ui.showToast('Здесь нечего рубить.');
      return;
    }

    if (!this.#isTreeSpriteType(cell.spriteType)) {
      this.ui.showToast('Топором можно рубить только деревья.');
      return;
    }

    this.stateManager.deleteCell({ x, y });
  }

  /**
   * @param {{ x: number; y: number; tileData: { type: string; width: number; height: number } }} param0
   * @returns {string | null}
   */
  #validatePlacement({ x, y, tileData }) {
    if (!this.#isInsideWorld({ x, y, tileData })) {
      return 'Нельзя строить за пределами мира.';
    }

    const blockingCell = this.#getBlockingCellInArea({ x, y, tileData });
    if (blockingCell) {
      if (this.#isTreeSpriteType(blockingCell.spriteType)) {
        return 'Нельзя ставить здание поверх дерева. Сначала расчистите место.';
      }
      return 'Нельзя ставить здание на занятую клетку.';
    }

    if (!this.#hasOwnedCellInRadius({ x, y, tileData, radiusCells: MAX_BUILD_DISTANCE_CELLS })) {
      return 'Слишком далеко от вашего дома: максимум 2 клетки.';
    }

    if (
      this.#isHomeBuildingType(tileData.type)
      && !this.#hasOwnedHomeInRadius({ x, y, tileData, radiusCells: HOUSE_NEIGHBOR_RADIUS_CELLS })
    ) {
      return 'Для дома рядом (до 3 клеток) нужен ещё один ваш дом.';
    }

    return null;
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

  /**
   * @param {string} spriteType
   * @returns {boolean}
   */
  #isHomeBuildingType(spriteType) {
    return spriteType === 'castle' || spriteType.startsWith('house');
  }

  /**
   * @param {string} spriteType
   * @returns {boolean}
   */
  #isTreeSpriteType(spriteType) {
    const type = spriteType.toLowerCase();
    return type.includes('tree') || type.includes('spruce');
  }

  /**
   * @param {{ x: number; y: number; tileData: { width: number; height: number } }} param0
   * @returns {boolean}
   */
  #getBlockingCellInArea({ x, y, tileData }) {
    const state = this.stateManager.getState();
    const cellsWide = tileData.width / TILE_SIZE;
    const cellsHigh = tileData.height / TILE_SIZE;

    for (let ix = 0; ix < cellsWide; ix++) {
      for (let iy = 0; iy < cellsHigh; iy++) {
        const checkX = x + ix * TILE_SIZE;
        const checkY = y + iy * TILE_SIZE;

        const cell = state.get(`${checkX}:${checkY}`);
        if (cell) {
          return cell;
        }
      }
    }

    return null;
  }

  /**
   * @param {{ x: number; y: number; tileData: { width: number; height: number }; radiusCells: number }} param0
   * @returns {boolean}
   */
  #hasOwnedCellInRadius({ x, y, tileData, radiusCells }) {
    const target = this.#getTileRect({ x, y, tileData });

    for (const [coords, cell] of this.stateManager.getState().entries()) {
      if (cell.ownerUserId !== this.localPlayer.userId) {
        continue;
      }

      const [cellX, cellY] = coords.split(':').map(Number);
      const distance = this.#distanceFromRectToTile({
        rect: target,
        tileX: cellX / TILE_SIZE,
        tileY: cellY / TILE_SIZE,
      });

      if (distance <= radiusCells) {
        return true;
      }
    }

    return false;
  }

  /**
   * @param {{ x: number; y: number; tileData: { width: number; height: number }; radiusCells: number }} param0
   * @returns {boolean}
   */
  #hasOwnedHomeInRadius({ x, y, tileData, radiusCells }) {
    const target = this.#getTileRect({ x, y, tileData });

    for (const [coords, cell] of this.stateManager.getState().entries()) {
      if (cell.ownerUserId !== this.localPlayer.userId || !this.#isHomeBuildingType(cell.spriteType)) {
        continue;
      }

      const [cellX, cellY] = coords.split(':').map(Number);
      const distance = this.#distanceFromRectToTile({
        rect: target,
        tileX: cellX / TILE_SIZE,
        tileY: cellY / TILE_SIZE,
      });

      if (distance <= radiusCells) {
        return true;
      }
    }

    return false;
  }

  /**
   * @param {{ x: number; y: number; tileData: { width: number; height: number } }} param0
   * @returns {{ minTx: number; maxTx: number; minTy: number; maxTy: number }}
   */
  #getTileRect({ x, y, tileData }) {
    const minTx = x / TILE_SIZE;
    const minTy = y / TILE_SIZE;
    const maxTx = minTx + tileData.width / TILE_SIZE - 1;
    const maxTy = minTy + tileData.height / TILE_SIZE - 1;

    return { minTx, maxTx, minTy, maxTy };
  }

  /**
   * @param {{
   *   rect: { minTx: number; maxTx: number; minTy: number; maxTy: number };
   *   tileX: number;
   *   tileY: number;
   * }} param0
   * @returns {number}
   */
  #distanceFromRectToTile({ rect, tileX, tileY }) {
    const dx = tileX < rect.minTx ? rect.minTx - tileX : tileX > rect.maxTx ? tileX - rect.maxTx : 0;
    const dy = tileY < rect.minTy ? rect.minTy - tileY : tileY > rect.maxTy ? tileY - rect.maxTy : 0;

    return Math.max(dx, dy);
  }

  #placeInitialCastles() {
    for (const playerProfile of PLAYER_PROFILES) {
      this.stateManager.setCell({
        x: playerProfile.castleStart.x,
        y: playerProfile.castleStart.y,
        tileData: tiles.castle,
        ownerUserId: playerProfile.userId,
      });
    }
  }
}
