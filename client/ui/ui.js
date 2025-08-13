export class UI {
  /**
   * @type {string}
   */
  #selectedBuilding;

  #houseBlackSmithSelector;
  #houseFarmSelector;

  constructor() {
    this.#houseBlackSmithSelector = document.getElementById('house-black-smith-selector');
    this.#houseFarmSelector = document.getElementById('house-farm-selector');
    this.#init();
  }

  #init() {
    this.#houseBlackSmithSelector.addEventListener('click', () => {
      this.#selectedBuilding = 'houseBlacksmith';
    });

    this.#houseFarmSelector.addEventListener('click', () => {
      this.#selectedBuilding = 'houseFarm';
    });
  }

  getSelectedBuilding() {
    return this.#selectedBuilding;
  }
}
