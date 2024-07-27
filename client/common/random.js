export class Random {
  /**
   * min and max included
   *
   * @static
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  static getRandomFromRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }
}
