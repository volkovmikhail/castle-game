import { TILE_SIZE } from '../constants/sizes.js';

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
  #clickedStateCoords;

  #isMouseDown = false;
  #startX;
  #startY;

  #canvasStartX;
  #canvasStartY;

  #scrollOffsetX = 0;
  #scrollOffsetY = 0;

  init() {
    this.canvas.addEventListener('mousemove', (event) => {
      const cords = this.#calculateSelectorCoords(event);
      if (this.#isMouseDown) {
        const offset = this.#calculateOffset(event);

        this.#setScrollOffset(offset);
      }

      this.#setSelectedCoords(cords);
    });

    this.canvas.addEventListener('mousedown', (event) => {
      const { x, y } = this.#calculateCanvasRelativeCoords(event);

      this.#canvasStartX = x - this.#scrollOffsetX;
      this.#canvasStartY = y - this.#scrollOffsetY;

      this.#startX = event.clientX;
      this.#startY = event.clientY;
      this.#isMouseDown = true;
    });

    this.canvas.addEventListener('mouseup', (event) => {
      this.#isMouseDown = false;
    });

    this.canvas.addEventListener('click', (event) => {
      const cords = this.#calculateClickedStateCoords(event);

      if (this.#isClick(event)) {
        this.#setClickedCoords(cords);
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
      } else {
        event.stopImmediatePropagation();

        return false;
      }
    }
  }

  #setScrollOffset({ offsetX, offsetY }) {
    this.#scrollOffsetX = offsetX;
    this.#scrollOffsetY = offsetY;
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
   * @returns {{ tx: number; ty: number; }}
   */
  getClickedCoords() {
    if (this.#clickedStateCoords === null) {
      return null;
    }

    const cords = { ...this.#clickedStateCoords };

    this.#clickedStateCoords = null;

    return cords;
  }
}
