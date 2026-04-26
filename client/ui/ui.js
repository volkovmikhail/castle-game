import { tiles } from '../constants/tiles.js';
import { BUILDINGS_TOOLBAR, DEFAULT_BUILDING_KEY } from '../constants/buildings-toolbar.js';

export class UI {
  static #previewTargetSize = 56;

  static #previewPadding = 10;

  /**
   * @param {string} key
   * @returns {string}
   */
  static #getBuildingLabel(key) {
    const trimmed = key.replace(/^house/, '');
    const base = trimmed.length > 0 ? trimmed : key;
    const spaced = base.replace(/([a-z])([A-Z])/g, '$1 $2');
    return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
  }

  /**
   * @type {string}
   */
  #selectedBuilding = DEFAULT_BUILDING_KEY;

  /**
   * @type {HTMLElement | null}
   */
  #selectedItemEl = null;
  #playerColorDotEl = null;
  #playerColorLabelEl = null;
  #toastRootEl = null;

  constructor() {
    this.#init();
  }

  #init() {
    this.#playerColorDotEl = document.getElementById('player-color-dot');
    this.#playerColorLabelEl = document.getElementById('player-color-label');
    this.#toastRootEl = document.getElementById('ui-toast-root');

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
      const spriteSide = Math.max(spriteW, spriteH);
      const previewScale = Math.max(1, UI.#previewTargetSize / spriteSide);
      item.style.setProperty('--preview-w', `${spriteW}px`);
      item.style.setProperty('--preview-h', `${spriteH}px`);
      item.style.setProperty('--preview-scale', `${previewScale}`);
      item.style.setProperty('--preview-pad', `${UI.#previewPadding}px`);

      const preview = document.createElement('div');
      preview.className = 'building-preview';
      preview.style.width = `${spriteW}px`;
      preview.style.height = `${spriteH}px`;
      preview.style.backgroundPosition = `-${tile.mapX}px -${tile.mapY}px`;

      const label = document.createElement('span');
      label.className = 'building-label';
      label.textContent = UI.#getBuildingLabel(key);

      item.appendChild(preview);
      item.appendChild(label);
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

  /**
   * @param {{ title: string; color: string; }} playerProfile
   */
  setPlayerBadge({ title, color }) {
    if (this.#playerColorLabelEl) {
      this.#playerColorLabelEl.textContent = title;
    }
    if (this.#playerColorDotEl) {
      this.#playerColorDotEl.style.background = color;
    }
  }

  /**
   * @param {string} message
   */
  showToast(message) {
    if (!this.#toastRootEl) {
      return;
    }

    const toastEl = document.createElement('div');
    toastEl.className = 'ui-toast';
    toastEl.textContent = message;
    this.#toastRootEl.appendChild(toastEl);

    requestAnimationFrame(() => {
      toastEl.classList.add('ui-toast--visible');
    });

    window.setTimeout(() => {
      toastEl.classList.remove('ui-toast--visible');
      window.setTimeout(() => {
        toastEl.remove();
      }, 180);
    }, 2000);
  }
}
