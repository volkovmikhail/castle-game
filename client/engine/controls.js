import { TILE_SIZE } from '../constants/sizes.js';
import {
  WORLD_HEIGHT_PX,
  WORLD_MIN_VISIBLE_EDGE_PX,
  WORLD_WIDTH_PX,
} from '../constants/world.js';

/**
 * @typedef {{ x: number, y: number, tx: number, ty:number }} Coords
 */
export class Controls {
  /**
   * Creates an instance of Controls.
   *
   * @constructor
   * @param {{ canvas: HTMLElement; }} params
   */
  constructor({ canvas }) {
    this.canvas = canvas;
  }

  /**
   * @type {Coords}
   */
  #selectedCoords;

  /**
   * @type {Coords}
   */
  #clickedStateCoords = null;

  #isMouseDown = false;
  /** @type {boolean} */
  #isPanning = false;
  #startX;
  #startY;

  #canvasStartX;
  #canvasStartY;

  #scrollOffsetX = 0;
  #scrollOffsetY = 0;
  #viewportWidth = 0;
  #viewportHeight = 0;

  /**
   * @type {{ wx: number; wy: number } | null}
   */
  #pendingRightWorld = null;

  /**
   * @type {boolean}
   */
  #lastLeftClickShift = false;

  init() {
    this.setViewportSize({ width: this.canvas.width, height: this.canvas.height });

    this.canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    this.canvas.addEventListener('mousemove', (event) => {
      const cords = this.#calculateSelectorCoords(event);
      if (this.#isPanning) {
        const offset = this.#calculateOffset(event);

        this.#setScrollOffset(offset);
      }

      this.#setSelectedCoords(cords);
    });

    this.canvas.addEventListener('mousedown', (event) => {
      if (event.button !== 0) {
        return;
      }

      const { x, y } = this.#calculateCanvasRelativeCoords(event);

      this.#canvasStartX = x - this.#scrollOffsetX;
      this.#canvasStartY = y - this.#scrollOffsetY;

      this.#startX = event.clientX;
      this.#startY = event.clientY;
      this.#isMouseDown = true;
      this.#isPanning = true;
    });

    this.canvas.addEventListener('mouseup', (event) => {
      if (event.button === 2) {
        const { x, y } = this.#calculateCanvasRelativeCoords(event);
        this.#pendingRightWorld = {
          wx: x - this.#scrollOffsetX,
          wy: y - this.#scrollOffsetY,
        };
      }
      if (event.button === 0) {
        this.#isMouseDown = false;
        this.#isPanning = false;
      }
    });

    this.canvas.addEventListener('click', (event) => {
      if (event.button !== 0) {
        return;
      }

      const cords = this.#calculateClickedStateCoords(event);
      const { x, y } = this.#calculateCanvasRelativeCoords(event);
      const worldPx = x - this.#scrollOffsetX;
      const worldPy = y - this.#scrollOffsetY;

      if (this.#isClick(event)) {
        this.#lastLeftClickShift = event.shiftKey;
        this.#setClickedCoords({ ...cords, worldPx, worldPy });
      }
    });
  }

  /**
   * Returns coords related to State Map
   *
   * @param {*} event
   * @returns {{tx: number, ty: number}}
   */
  #calculateClickedStateCoords(event) {
    const { x, y } = this.#calculateCanvasRelativeCoords(event);

    const { tx, ty } = this.#calculateTileSizedCoords({ canvasX: x, canvasY: y });

    return { tx: tx - this.#scrollOffsetX, ty: ty - this.#scrollOffsetY };
  }

  /**
   * Returns tile coords related to current player view (just applies offset and adjusts)
   *
   * @param {*} event
   * @returns {Coords}
   */
  #calculateSelectorCoords(event) {
    const { x, y } = this.#calculateCanvasRelativeCoords(event);

    const { tx, ty } = this.#calculateTileSizedCoords({ canvasX: x, canvasY: y });

    return { tx, ty, x, y };
  }

  /**
   * @param {{ canvasX: number; canvasY: number; }}
   * @returns {{ tx: number; ty: number; }}
   */
  #calculateTileSizedCoords({ canvasX, canvasY }) {
    const tileSizeOffsetX = this.#scrollOffsetX % TILE_SIZE;
    const tileSizeOffsetY = this.#scrollOffsetY % TILE_SIZE;

    const tx = Math.floor((canvasX - tileSizeOffsetX) / TILE_SIZE) * TILE_SIZE;
    const ty = Math.floor((canvasY - tileSizeOffsetY) / TILE_SIZE) * TILE_SIZE;

    return { tx: tx + tileSizeOffsetX, ty: ty + tileSizeOffsetY };
  }

  #calculateCanvasRelativeCoords(event) {
    const rect = this.canvas.getBoundingClientRect();

    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = Math.round((event.clientX - rect.left) * scaleX);
    const y = Math.round((event.clientY - rect.top) * scaleY);

    return { x, y };
  }

  #calculateOffset(event) {
    const { x, y } = this.#calculateCanvasRelativeCoords(event);

    return { offsetX: x - this.#canvasStartX, offsetY: y - this.#canvasStartY };
  }

  #isClick(event) {
    if (!this.#isMouseDown) {
      const deltaX = event.clientX - this.#startX;
      const deltaY = event.clientY - this.#startY;

      if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) {
        return true;
      }
      event.stopImmediatePropagation();

      return false;
    }

    return false;
  }

  #setScrollOffset({ offsetX, offsetY }) {
    const minOffsetX = -WORLD_WIDTH_PX + WORLD_MIN_VISIBLE_EDGE_PX;
    const maxOffsetX = this.#viewportWidth - WORLD_MIN_VISIBLE_EDGE_PX;
    const minOffsetY = -WORLD_HEIGHT_PX + WORLD_MIN_VISIBLE_EDGE_PX;
    const maxOffsetY = this.#viewportHeight - WORLD_MIN_VISIBLE_EDGE_PX;

    this.#scrollOffsetX = Math.min(Math.max(offsetX, minOffsetX), maxOffsetX);
    this.#scrollOffsetY = Math.min(Math.max(offsetY, minOffsetY), maxOffsetY);
  }

  getScrollOffset() {
    return {
      offsetX: this.#scrollOffsetX,
      offsetY: this.#scrollOffsetY,
    };
  }

  #setSelectedCoords(cords) {
    this.#selectedCoords = cords;
  }

  #setClickedCoords(cords) {
    this.#clickedStateCoords = cords;
  }

  getSelectedCoords() {
    return this.#selectedCoords ?? { tx: -TILE_SIZE, ty: -TILE_SIZE, x: -1, y: -1 };
  }

  /**
   * returns game (state) related coords
   *
   * @returns {{ tx: number; ty: number; shiftKey: boolean; worldPx: number; worldPy: number } | null}
   */
  getClickedCoords() {
    if (this.#clickedStateCoords === null) {
      return null;
    }

    const cords = {
      ...this.#clickedStateCoords,
      shiftKey: this.#lastLeftClickShift,
    };

    this.#clickedStateCoords = null;

    return cords;
  }

  /**
   * ПКМ в координатах мира (центр клика), для приказов юнитам.
   *
   * @returns {{ wx: number; wy: number } | null}
   */
  consumeRightClickWorld() {
    const p = this.#pendingRightWorld;
    this.#pendingRightWorld = null;
    return p;
  }

  /**
   * @param {{ width: number; height: number; }} param0
   */
  setViewportSize({ width, height }) {
    this.#viewportWidth = width;
    this.#viewportHeight = height;
    this.#setScrollOffset({
      offsetX: this.#scrollOffsetX,
      offsetY: this.#scrollOffsetY,
    });
  }
}
