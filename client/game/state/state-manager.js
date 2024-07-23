export class StateManager {
  /**
   * @typedef {import('./cell.js').Cell} Cell
   * @type {Cell[]}
   */
  #state = [];
  // new Map<"X:Y", Cell> - maybe use this data structure

  getState() {
    return this.#state;
  }
}
