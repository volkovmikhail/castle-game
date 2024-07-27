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
  #clickedCoords;

  #isMouseDown = false;
  #startX;
  #startY;

  init() {
    this.canvas.addEventListener('mousemove', (event) => {
      const cords = this.calculateCoords(event);

      this.#setSelectedCoords(cords);
    });

    this.canvas.addEventListener('mousedown', (event) => {
      this.#startX = event.clientX;
      this.#startY = event.clientY;
      this.#isMouseDown = true;
    });

    this.canvas.addEventListener('mouseup', (event) => {
      this.#isMouseDown = false;
    });

    this.canvas.addEventListener('click', (event) => {
      const cords = this.calculateCoords(event);

      if (this.#isClick(event)) {
        this.#setClickedCoords(cords);
      }
    });
  }

  calculateCoords(event) {
    const rect = this.canvas.getBoundingClientRect();

    //calculate canvas relative cords
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    //calculate mouse tile
    const tx = Math.floor(x / TILE_SIZE) * TILE_SIZE;
    const ty = Math.floor(y / TILE_SIZE) * TILE_SIZE;

    return { x, y, tx, ty };
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

  #setSelectedCoords(cords) {
    this.#selectedCoords = cords;
  }

  #setClickedCoords(cords) {
    this.#clickedCoords = cords;
  }

  getSelectedCoords() {
    return this.#selectedCoords ?? { tx: -TILE_SIZE, ty: -TILE_SIZE, x: -1, y: -1 };
  }

  getClickedCoords() {
    if (this.#clickedCoords === null) {
      return null;
    }

    const cords = { ...this.#clickedCoords };

    this.#clickedCoords = null;

    return cords;
  }
}
