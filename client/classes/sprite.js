export class Sprite {
  constructor({ tileMap, sourceX, sourceY, canvasContext }) {
    this.tileMap = tileMap;
    this.canvasContext = canvasContext;

    this.posX = 0;
    this.posY = 0;
  }

  setPos({ x, y }) {
    this.posX = x;
    this.posY = y;
  }
}
