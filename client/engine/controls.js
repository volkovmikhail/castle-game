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

  init() {
    this.canvas.addEventListener('mousemove', (event) => {
      const cords = this.calculateCoords(event);

      this.#setSelectedCoords(cords);
    });

    this.canvas.addEventListener('mouseup', (event) => {
      const cords = this.calculateCoords(event);

      this.#setClickedCoords(cords);
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
