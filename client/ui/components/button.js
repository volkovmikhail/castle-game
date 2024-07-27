export class Button {
  /**
   * Creates an instance of Button.
   * @typedef {import('../../engine/sprite.js').TileData} TileData
   *
   * @constructor
   * @param {number} param.x
   * @param {number} param.y
   * @param {number} param.width
   * @param {number} param.height
   * @param {TileData} param.tileData
   */
  constructor({ x, y, width, height, tileData }) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.tileData = tileData;
  }

  /**
   * @typedef {import('../../engine/controls.js').Coords} Coords
   * @param {{ clickedCoords: Coords }}
   * @returns {boolean}
   */
  isClicked({ clickedCoords }) {
    const x = clickedCoords.x;
    const y = clickedCoords.y;

    return x > button.x && x < button.x + button.width && y > button.y && y < button.y + button.height;
  }
}
