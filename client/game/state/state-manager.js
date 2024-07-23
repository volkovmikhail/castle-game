export class StateManager {
  /**
   * @typedef {import('./cell.js').Cell} Cell
   * @type {Map<string, Cell>}
   * key - <X:Y> format
   */
  #state = [];

  getState() {
    return this.#state;
  }
}
