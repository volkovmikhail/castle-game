import { tiles } from '../constants/tiles.js';
import { BUILDINGS_TOOLBAR, DEFAULT_BUILDING_KEY } from '../constants/buildings-toolbar.js';

export class UI {
  /**
   * @type {string}
   */
  #selectedBuilding = DEFAULT_BUILDING_KEY;

  /**
   * @type {HTMLElement | null}
   */
  #selectedItemEl = null;

  constructor() {
    this.#init();
  }

  #init() {
    const root = document.getElementById('building-selector');
    if (!root) {
      return;
    }

    for (const { key, spriteW, spriteH } of BUILDINGS_TOOLBAR) {
      const tile = tiles[key];
      if (!tile) {
        continue;
      }

      const item = document.createElement('div');
      item.className = 'building-selector-item';
      item.dataset.building = key;

      const preview = document.createElement('div');
      preview.className =
        spriteW > 16 || spriteH > 16
          ? 'building-preview building-preview--32'
          : 'building-preview building-preview--16';
      preview.style.backgroundPosition = `-${tile.mapX}px -${tile.mapY}px`;

      item.appendChild(preview);
      root.appendChild(item);

      item.addEventListener('click', () => {
        this.#selectedBuilding = key;
        this.#setSelectedItem(item);
      });
    }

    const initial = root.querySelector(`[data-building="${DEFAULT_BUILDING_KEY}"]`);
    if (initial) {
      this.#setSelectedItem(initial);
    }
  }

  /**
   * @param {HTMLElement} item
   */
  #setSelectedItem(item) {
    if (this.#selectedItemEl) {
      this.#selectedItemEl.classList.remove('building-selector-item--selected');
    }
    this.#selectedItemEl = item;
    item.classList.add('building-selector-item--selected');
  }

  getSelectedBuilding() {
    return this.#selectedBuilding;
  }
}
