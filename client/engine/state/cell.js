export class Cell {
  /**
   * Creates an instance of Cell.
   *
   * @constructor
   * @param {{ spriteType: string; isRenderable: boolean; }}
   */
  constructor({ spriteType, isRenderable }) {
    this.isRenderable = isRenderable;
    this.spriteType = spriteType;
  }

  spriteType;
  isRenderable;
  // other state data
}
