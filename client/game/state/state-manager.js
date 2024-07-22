export class StateManager {
  /**
   * @typedef {import('./cell.js').Cell} Cell
   * @type {Cell[]}
   */
  #state = [];

  getState() {
    return this.#state;
  }
}
