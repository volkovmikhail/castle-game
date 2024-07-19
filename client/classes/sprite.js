export class Sprite {
  /**
   * @param {{
   *     mapX: number,
   *     mapY: number,
   *     width: number,
   *     height: number
   *   }
   * } tileData
   */
  constructor(tileData) {
    this.tileData = tileData;

    this.posX = 0;
    this.posY = 0;
  }

  /**
   *
   * @param {{ x: number, y: number }} options
   */
  setPos({ x, y }) {
    this.posX = x ?? this.posX;
    this.posY = y ?? this.posY;
  }

  /**
   *
   * @returns {{ x: number; y: number; }}
   */
  getPos() {
    return {
      x: this.posX,
      y: this.posY,
    };
  }

  /**
   *
   * @returns {{ mapX: number; mapY: number; width: number; height: number; }}
   */
  getTileData() {
    return this.tileData;
  }
}
