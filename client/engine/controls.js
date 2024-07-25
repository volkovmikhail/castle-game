import { TILE_SIZE } from '../constants/sizes.js';

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
   * @typedef {{ x: number, y: number, tx: number, ty:number }} Coords
   *
   * @type {Coords}
   */
  #selectedCords;

  /**
   * @type {Coords}
   */
  #clickedCords;

  init() {
    this.canvas.addEventListener('mousemove', (event) => {
      const cords = this.calculateCords(event);

      this.#setSelectedCords(cords);
    });

    this.canvas.addEventListener('mouseup', (event) => {
      const cords = this.calculateCords(event);

      this.#setClickedCords(cords);
    });
  }

  calculateCords(event) {
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

  #setSelectedCords(cords) {
    this.#selectedCords = cords;
  }

  #setClickedCords(cords) {
    this.#clickedCords = cords;
  }

  getSelectedCords() {
    return this.#selectedCords ?? { tx: -TILE_SIZE, ty: -TILE_SIZE, x: -1, y: -1 };
  }

  getClickedCords() {
    if (this.#clickedCords === null) {
      return null;
    }

    const cords = { ...this.#clickedCords };

    this.#clickedCords = null;

    return cords;
  }
}
