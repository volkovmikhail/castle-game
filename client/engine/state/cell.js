export class Cell {
  /**
   * Creates an instance of Cell.
   *
   * @constructor
   * @param {{ spriteType: string; isRenderable: boolean; ownerUserId: string }}
   */
  constructor({ spriteType, isRenderable, ownerUserId }) {
    this.isRenderable = isRenderable;
    this.spriteType = spriteType;
    this.ownerUserId = ownerUserId;
  }

  spriteType;
  isRenderable;
  ownerUserId;
  // other state data
}
