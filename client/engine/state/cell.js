export class Cell {
  /**
   * Creates an instance of Cell.
   *
   * @constructor
   * @param {{ spriteType: string; isRenderable: boolean; ownerUserId: string, entity: any }}
   */
  constructor({ spriteType, isRenderable, ownerUserId, entity }) {
    this.isRenderable = isRenderable;
    this.spriteType = spriteType;
    this.ownerUserId = ownerUserId;

    //then while update game state check with "instanceof" to identify the type of entity
    this.entity = entity;
  }

  spriteType;
  isRenderable;
  ownerUserId;

  entity;

  // other state data
}
