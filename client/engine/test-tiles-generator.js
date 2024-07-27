import { tiles } from '../constants/tiles.js';

export class TestTilesGenerator {
  static generateAllTiles(stateManager) {
    this.sprites = [];
    let offset = 16;
    let iteration = 1;

    for (const key in tiles) {
      stateManager.setCell({
        x: offset,
        y: 32 * iteration,
        tileData: tiles[key],
      });

      offset += 32;

      if (offset >= 496) {
        offset = 16;
        iteration++;
      }
    }
  }
}
