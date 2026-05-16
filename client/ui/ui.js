import { tiles } from '../constants/tiles.js';
import { BUILDINGS_TOOLBAR, DEFAULT_BUILDING_KEY } from '../constants/buildings-toolbar.js';
import { BARN_TOOL_KEY, canAfford, formatCostLineForTool, getNumericCost } from '../constants/economy.js';
import { BASE_STORAGE_CAP_WHEAT_WOOD } from '../constants/resources.js';
import { getShopExchangePreviewLine, SHOP_QUANTITY_STEP } from '../constants/shop-exchange.js';

export class UI {
  static #previewTargetSize = 56;

  static #previewPadding = 10;

  /**
   * @param {string} key
   * @returns {string}
   */
  static #getBuildingLabel(key) {
    if (key === 'knight') {
      return 'Рыцарь';
    }
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
  #resourceWheatEl = null;
  #resourceWoodEl = null;
  #resourceGoldEl = null;

  #storageMaxWheat = BASE_STORAGE_CAP_WHEAT_WOOD;
  #storageMaxWood = BASE_STORAGE_CAP_WHEAT_WOOD;

  /**
   * @type {import('../constants/resources.js').PlayerResources | null}
   */
  #lastResources = null;

  /** @type {HTMLElement | null} */
  #marketModalEl = null;

  /**
   * @type {{
   *   getResources: () => import('../constants/resources.js').PlayerResources | undefined;
   *   onExchange: (
   *     kind: 'wheatToGold' | 'woodToGold' | 'goldToWood' | 'goldToWheat',
   *     qty: number
   *   ) => { ok: boolean; message?: string };
   * } | null}
   */
  #marketShopCallbacks = null;

  /** @type {((e: KeyboardEvent) => void) | null} */
  #marketEscapeHandler = null;

  constructor() {
    this.#init();
  }

  #init() {
    this.#playerColorDotEl = document.getElementById('player-color-dot');
    this.#playerColorLabelEl = document.getElementById('player-color-label');
    this.#toastRootEl = document.getElementById('ui-toast-root');
    this.#resourceWheatEl = document.getElementById('resource-wheat');
    this.#resourceWoodEl = document.getElementById('resource-wood');
    this.#resourceGoldEl = document.getElementById('resource-gold');

    const root = document.getElementById('building-selector');
    if (!root) {
      return;
    }

    for (const entry of BUILDINGS_TOOLBAR) {
      const { key, spriteW, spriteH } = entry;
      const previewTileKey =
        'previewTileKey' in entry && typeof entry.previewTileKey === 'string'
          ? entry.previewTileKey
          : key;
      /** @type {{ mapX: number; mapY: number } | undefined} */
      const tile = tiles[previewTileKey];
      const externalSprite = 'externalSprite' in entry && entry.externalSprite;

      if (!tile && !externalSprite && key !== BARN_TOOL_KEY) {
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
      preview.className = externalSprite ? 'building-preview building-preview--knight' : 'building-preview';
      preview.style.width = `${spriteW}px`;
      preview.style.height = `${spriteH}px`;
      if (tile) {
        preview.style.backgroundPosition = `-${tile.mapX}px -${tile.mapY}px`;
      } else {
        preview.style.backgroundPosition = '0 -16px';
      }

      const meta = document.createElement('div');
      meta.className = 'building-selector-item__meta';

      const label = document.createElement('span');
      label.className = 'building-label';
      label.textContent =
        'label' in entry && typeof entry.label === 'string' && entry.label.length > 0
          ? entry.label
          : UI.#getBuildingLabel(key);

      const costLine = formatCostLineForTool(key);
      const cost = document.createElement('span');
      cost.className = 'building-cost';
      cost.textContent = costLine;

      meta.appendChild(label);
      meta.appendChild(cost);

      item.appendChild(preview);
      item.appendChild(meta);
      root.appendChild(item);

      item.addEventListener('click', () => {
        if (item.classList.contains('building-selector-item--disabled')) {
          this.showToast('Недостаточно ресурсов.');
          return;
        }
        this.#selectedBuilding = key;
        this.#setSelectedItem(item);
      });
    }

    const initial = root.querySelector(`[data-building="${DEFAULT_BUILDING_KEY}"]`);
    if (initial) {
      this.#setSelectedItem(initial);
    }

    this.#initMarketShopModal();
  }

  #refreshMarketShopPreview() {
    if (!this.#marketModalEl || !this.#marketShopCallbacks) {
      return;
    }
    const qtyInput = document.getElementById('market-shop-qty');
    const previewEl = document.getElementById('market-shop-preview');
    const captionEl = document.getElementById('market-shop-qty-caption');
    if (!qtyInput || !previewEl || !captionEl) {
      return;
    }
    const kind = /** @type {'wheatToGold' | 'woodToGold' | 'goldToWood' | 'goldToWheat'} */ (
      this.#marketModalEl.querySelector('input[name="market-exchange"]:checked')?.value ?? 'wheatToGold'
    );
    const resources = this.#marketShopCallbacks.getResources() ?? {
      wheat: 0,
      wood: 0,
      gold: 0,
    };
    const qty = Number(qtyInput.value);
    previewEl.textContent = getShopExchangePreviewLine(kind, qty, resources);

    if (kind === 'wheatToGold') {
      captionEl.textContent = 'Количество пшеницы (отдаёте)';
    } else if (kind === 'woodToGold') {
      captionEl.textContent = 'Количество дерева (отдаёте)';
    } else {
      captionEl.textContent = 'Золото (тратите)';
    }
  }

  #initMarketShopModal() {
    this.#marketModalEl = document.getElementById('market-shop-modal');
    if (!this.#marketModalEl) {
      return;
    }

    const qtyInput = document.getElementById('market-shop-qty');

    const stepQty = (delta) => {
      if (!qtyInput) {
        return;
      }
      const next = Math.max(0, Math.floor(Number(qtyInput.value) || 0) + delta);
      qtyInput.value = String(next);
      this.#refreshMarketShopPreview();
    };

    document.getElementById('market-shop-qty-minus')?.addEventListener('click', () => {
      stepQty(-SHOP_QUANTITY_STEP);
    });
    document.getElementById('market-shop-qty-plus')?.addEventListener('click', () => {
      stepQty(SHOP_QUANTITY_STEP);
    });

    qtyInput?.addEventListener('input', () => this.#refreshMarketShopPreview());

    for (const radio of this.#marketModalEl.querySelectorAll('input[name="market-exchange"]')) {
      radio.addEventListener('change', () => this.#refreshMarketShopPreview());
    }

    document.getElementById('market-shop-confirm')?.addEventListener('click', () => {
      if (!this.#marketShopCallbacks || !qtyInput) {
        return;
      }
      const kind = /** @type {'wheatToGold' | 'woodToGold' | 'goldToWood' | 'goldToWheat'} */ (
        this.#marketModalEl.querySelector('input[name="market-exchange"]:checked')?.value ?? 'wheatToGold'
      );
      const qty = Number(qtyInput.value);
      const result = this.#marketShopCallbacks.onExchange(kind, qty);
      if (!result.ok && result.message) {
        this.showToast(result.message);
        return;
      }
      this.#refreshMarketShopPreview();
    });

    const close = () => this.closeMarketShop();

    for (const el of this.#marketModalEl.querySelectorAll('[data-market-shop-close]')) {
      el.addEventListener('click', close);
    }
  }

  /**
   * @param {{
   *   getResources: () => import('../constants/resources.js').PlayerResources | undefined;
   *   onExchange: (
   *     kind: 'wheatToGold' | 'woodToGold' | 'goldToWood' | 'goldToWheat',
   *     qty: number
   *   ) => { ok: boolean; message?: string };
   * }} callbacks
   */
  openMarketShop(callbacks) {
    if (!this.#marketModalEl) {
      return;
    }
    this.#marketShopCallbacks = callbacks;
    this.#marketModalEl.hidden = false;
    this.#marketModalEl.setAttribute('aria-hidden', 'false');

    const qtyInput = document.getElementById('market-shop-qty');
    if (qtyInput) {
      qtyInput.value = String(SHOP_QUANTITY_STEP);
    }

    this.#refreshMarketShopPreview();

    if (!this.#marketEscapeHandler) {
      this.#marketEscapeHandler = (e) => {
        if (e.key === 'Escape' && this.#marketModalEl && !this.#marketModalEl.hidden) {
          e.preventDefault();
          this.closeMarketShop();
        }
      };
      document.addEventListener('keydown', this.#marketEscapeHandler);
    }

    qtyInput?.focus();
  }

  closeMarketShop() {
    if (!this.#marketModalEl) {
      return;
    }
    this.#marketModalEl.hidden = true;
    this.#marketModalEl.setAttribute('aria-hidden', 'true');
    this.#marketShopCallbacks = null;
  }

  /**
   * Лимиты склада для отображения пшеницы/дерева (золото без лимита).
   *
   * @param {number} maxWheat
   * @param {number} maxWood
   */
  setStorageCaps(maxWheat, maxWood) {
    this.#storageMaxWheat = maxWheat;
    this.#storageMaxWood = maxWood;
    if (this.#lastResources) {
      this.setResources(this.#lastResources);
    }
  }

  /**
   * @param {import('../constants/resources.js').PlayerResources} resources
   */
  setResources(resources) {
    this.#lastResources = { ...resources };
    if (this.#resourceWheatEl) {
      this.#resourceWheatEl.textContent = `${resources.wheat} / ${this.#storageMaxWheat}`;
    }
    if (this.#resourceWoodEl) {
      this.#resourceWoodEl.textContent = `${resources.wood} / ${this.#storageMaxWood}`;
    }
    if (this.#resourceGoldEl) {
      this.#resourceGoldEl.textContent = String(resources.gold);
    }
    this.#refreshBuildingAffordability();
    if (this.#marketModalEl && !this.#marketModalEl.hidden) {
      this.#refreshMarketShopPreview();
    }
  }

  #refreshBuildingAffordability() {
    const root = document.getElementById('building-selector');
    if (!root || !this.#lastResources) {
      return;
    }

    for (const item of root.querySelectorAll('.building-selector-item[data-building]')) {
      const key = item.getAttribute('data-building');
      if (!key) {
        continue;
      }
      const cost = getNumericCost(key);
      const ok = canAfford(this.#lastResources, cost);
      item.classList.toggle('building-selector-item--disabled', !ok);
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
