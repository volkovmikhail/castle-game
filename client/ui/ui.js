import { tiles } from '../constants/tiles.js';
import { BUILDINGS_TOOLBAR, DEFAULT_BUILDING_KEY } from '../constants/buildings-toolbar.js';
import {
  BARN_TOOL_KEY,
  BLACKSMITH_TOOL_KEY,
  HOUSE_TOOL_KEY,
  KNIGHT_TOOL_KEY,
  canAfford,
  formatCostLineForTool,
  formatMissingResources,
  getNumericCost,
} from '../constants/economy.js';
import {
  describeKnightUpgradeStat,
  formatKnightUpgradeCostLine,
  getKnightUpgradeCost,
  KNIGHT_UPGRADE_LEVELS_PER_BLACKSMITH,
} from '../constants/knight-upgrades.js';
import {
  castleMaxLevelForKind,
  describeCastleUpgradeStat,
  formatCastleUpgradeCostLine,
  getCastleUpgradeCost,
} from '../constants/castle-upgrades.js';
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
      return 'Knight';
    }
    const trimmed = key.replace(/^house/, '');
    const base = trimmed.length > 0 ? trimmed : key;
    const spaced = base.replace(/([a-z])([A-Z])/g, '$1 $2');
    return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
  }

  /**
   * @type {string | null}
   */
  #selectedBuilding = null;

  /**
   * @type {HTMLElement | null}
   */
  #selectedItemEl = null;
  #playerColorDotEl = null;
  #playerColorLabelEl = null;
  #toastRootEl = null;
  #sidebarBuildBtnEl = null;
  #sidebarTrainKnightBtnEl = null;
  #sidebarTrainKnightCostEl = null;
  #sidebarCancelBtnEl = null;
  /** @type {HTMLElement | null} */
  #buildModalEl = null;
  #resourceWheatEl = null;
  #resourceWoodEl = null;
  #resourceGoldEl = null;
  #resourceKnightsEl = null;
  #armyHealthLevelEl = null;
  #armyAttackLevelEl = null;

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

  /** @type {HTMLElement | null} */
  #knightUpgradeModalEl = null;

  /**
   * @type {{
   *   getViewState: () => {
   *     healthLevel: number;
   *     attackLevel: number;
   *     maxLevel: number;
   *     blacksmithCount: number;
   *     resources: import('../constants/resources.js').PlayerResources;
   *   };
   *   onUpgrade: (kind: 'health' | 'attack') => { ok: boolean; message?: string };
   * } | null}
   */
  #knightUpgradeCallbacks = null;

  /** @type {HTMLElement | null} */
  #castleUpgradeModalEl = null;

  /**
   * @type {{
   *   getViewState: () => {
   *     rangeLevel: number;
   *     damageLevel: number;
   *     speedLevel: number;
   *     resources: import('../constants/resources.js').PlayerResources;
   *   };
   *   onUpgrade: (kind: 'range' | 'damage' | 'speed') => { ok: boolean; message?: string };
   * } | null}
   */
  #castleUpgradeCallbacks = null;

  /** @type {((e: KeyboardEvent) => void) | null} */
  #modalEscapeHandler = null;

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
    this.#resourceKnightsEl = document.getElementById('resource-knights');
    this.#armyHealthLevelEl = document.getElementById('army-health-level');
    this.#armyAttackLevelEl = document.getElementById('army-attack-level');
    this.#sidebarBuildBtnEl = document.getElementById('sidebar-build-btn');
    this.#sidebarTrainKnightBtnEl = document.getElementById('sidebar-train-knight-btn');
    this.#sidebarTrainKnightCostEl = document.getElementById('sidebar-train-knight-cost');
    this.#sidebarCancelBtnEl = document.getElementById('sidebar-cancel-btn');
    if (this.#sidebarTrainKnightCostEl) {
      this.#sidebarTrainKnightCostEl.textContent = formatCostLineForTool(KNIGHT_TOOL_KEY);
    }

    this.#sidebarBuildBtnEl?.addEventListener('click', () => {
      this.openBuildModal();
    });

    this.#sidebarTrainKnightBtnEl?.addEventListener('click', () => {
      this.#armBuilding(KNIGHT_TOOL_KEY);
    });

    this.#sidebarCancelBtnEl?.addEventListener('click', () => {
      this.#cancelPlacement();
    });

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

      if (
        !tile &&
        !externalSprite &&
        key !== BARN_TOOL_KEY &&
        key !== HOUSE_TOOL_KEY &&
        key !== BLACKSMITH_TOOL_KEY
      ) {
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

      const previewWrap = document.createElement('div');
      previewWrap.className = 'building-preview-wrap';
      previewWrap.style.width = `${spriteSide * previewScale + UI.#previewPadding * 2}px`;
      previewWrap.style.height = `${spriteSide * previewScale + UI.#previewPadding * 2}px`;

      const preview = document.createElement('div');
      preview.className = externalSprite ? 'building-preview building-preview--knight' : 'building-preview';
      preview.style.width = `${spriteW}px`;
      preview.style.height = `${spriteH}px`;
      if (tile) {
        preview.style.backgroundPosition = `-${tile.mapX}px -${tile.mapY}px`;
      } else {
        preview.style.backgroundPosition = '0 -16px';
      }
      previewWrap.appendChild(preview);

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

      item.appendChild(previewWrap);
      item.appendChild(meta);
      root.appendChild(item);

      item.addEventListener('click', () => {
        if (item.classList.contains('building-selector-item--disabled')) {
          const message = this.#lastResources
            ? formatMissingResources(this.#lastResources, getNumericCost(key))
            : 'Not enough resources.';
          this.showToast(message);
          return;
        }
        this.#selectedBuilding = key;
        this.#setSelectedItem(item);
        this.closeBuildModal();
        this.#updateActionButtonsState();
      });
    }

    const initial = root.querySelector(`[data-building="${DEFAULT_BUILDING_KEY}"]`);
    if (initial) {
      this.#setSelectedItem(initial);
    }

    this.#initBuildModal();
    this.#initMarketShopModal();
    this.#initKnightUpgradeModal();
    this.#initCastleUpgradeModal();
    this.#initModalEscapeHandler();
  }

  #initBuildModal() {
    this.#buildModalEl = document.getElementById('build-modal');
    if (!this.#buildModalEl) {
      return;
    }
    const close = () => this.closeBuildModal();
    for (const el of this.#buildModalEl.querySelectorAll('[data-build-modal-close]')) {
      el.addEventListener('click', close);
    }
  }

  openBuildModal() {
    if (!this.#buildModalEl) {
      return;
    }
    this.#buildModalEl.hidden = false;
    this.#buildModalEl.setAttribute('aria-hidden', 'false');
  }

  closeBuildModal() {
    if (!this.#buildModalEl) {
      return;
    }
    this.#buildModalEl.hidden = true;
    this.#buildModalEl.setAttribute('aria-hidden', 'true');
  }

  /**
   * Выходит из режима постройки (после успешной установки здания). Для рыцарей не вызывается —
   * режим найма остаётся активным, чтобы можно было ставить их подряд без повторного клика.
   */
  exitBuildMode() {
    this.#cancelPlacement();
  }

  /**
   * @param {string} key
   */
  #armBuilding(key) {
    this.#selectedBuilding = key;
    this.#clearSelectedItem();
    this.closeBuildModal();
    this.#updateActionButtonsState();
  }

  #cancelPlacement() {
    this.#selectedBuilding = null;
    this.#clearSelectedItem();
    this.#updateActionButtonsState();
  }

  #clearSelectedItem() {
    if (this.#selectedItemEl) {
      this.#selectedItemEl.classList.remove('building-selector-item--selected');
      this.#selectedItemEl = null;
    }
  }

  #updateActionButtonsState() {
    const active = this.#selectedBuilding !== null;
    const isKnight = this.#selectedBuilding === KNIGHT_TOOL_KEY;
    const isOtherBuilding = active && !isKnight;

    // Основные кнопки сохраняют своё действие; подсвечиваем активный режим размещения.
    this.#sidebarBuildBtnEl?.classList.toggle('sidebar-build-btn--active', isOtherBuilding);
    this.#sidebarTrainKnightBtnEl?.classList.toggle('sidebar-build-btn--active', isKnight);

    // Единая кнопка отмены — видна, пока активен любой режим (постройка или тренировка).
    if (this.#sidebarCancelBtnEl) {
      this.#sidebarCancelBtnEl.hidden = !active;
      this.#sidebarCancelBtnEl.textContent = isKnight
        ? 'Cancel training (Esc)'
        : 'Cancel building (Esc)';
    }
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
      captionEl.textContent = 'Wheat amount (you give)';
    } else if (kind === 'woodToGold') {
      captionEl.textContent = 'Wood amount (you give)';
    } else {
      captionEl.textContent = 'Gold (you spend)';
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
    this.closeKnightUpgrade();
    this.closeCastleUpgrade();
    this.#marketShopCallbacks = callbacks;
    this.#marketModalEl.hidden = false;
    this.#marketModalEl.setAttribute('aria-hidden', 'false');

    const qtyInput = document.getElementById('market-shop-qty');
    if (qtyInput) {
      qtyInput.value = String(SHOP_QUANTITY_STEP);
    }

    this.#refreshMarketShopPreview();

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
   * Текущее число рыцарей и лимит (по жилым домам).
   *
   * @param {number} current
   * @param {number} max
   */
  setKnightSlots(current, max) {
    if (this.#resourceKnightsEl) {
      this.#resourceKnightsEl.textContent = `${current} / ${max}`;
    }
  }

  /**
   * Уровни прокачки войск в сайдбаре.
   *
   * @param {number} healthLevel
   * @param {number} attackLevel
   * @param {number} maxLevel
   */
  setKnightArmyLevels(healthLevel, attackLevel, maxLevel) {
    const max = Math.max(0, maxLevel);
    if (this.#armyHealthLevelEl) {
      this.#armyHealthLevelEl.textContent = `${healthLevel} / ${max}`;
    }
    if (this.#armyAttackLevelEl) {
      this.#armyAttackLevelEl.textContent = `${attackLevel} / ${max}`;
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
    if (this.#knightUpgradeModalEl && !this.#knightUpgradeModalEl.hidden) {
      this.#refreshKnightUpgradeModal();
    }
    if (this.#castleUpgradeModalEl && !this.#castleUpgradeModalEl.hidden) {
      this.#refreshCastleUpgradeModal();
    }
  }

  #initKnightUpgradeModal() {
    this.#knightUpgradeModalEl = document.getElementById('knight-upgrade-modal');
    if (!this.#knightUpgradeModalEl) {
      return;
    }

    document.getElementById('knight-upgrade-health-btn')?.addEventListener('click', () => {
      this.#confirmKnightUpgrade('health');
    });
    document.getElementById('knight-upgrade-attack-btn')?.addEventListener('click', () => {
      this.#confirmKnightUpgrade('attack');
    });

    const close = () => this.closeKnightUpgrade();
    for (const el of this.#knightUpgradeModalEl.querySelectorAll('[data-knight-upgrade-close]')) {
      el.addEventListener('click', close);
    }
  }

  #initModalEscapeHandler() {
    if (this.#modalEscapeHandler) {
      return;
    }
    this.#modalEscapeHandler = (e) => {
      if (e.key !== 'Escape') {
        return;
      }
      if (this.#knightUpgradeModalEl && !this.#knightUpgradeModalEl.hidden) {
        e.preventDefault();
        this.closeKnightUpgrade();
        return;
      }
      if (this.#castleUpgradeModalEl && !this.#castleUpgradeModalEl.hidden) {
        e.preventDefault();
        this.closeCastleUpgrade();
        return;
      }
      if (this.#marketModalEl && !this.#marketModalEl.hidden) {
        e.preventDefault();
        this.closeMarketShop();
        return;
      }
      if (this.#buildModalEl && !this.#buildModalEl.hidden) {
        e.preventDefault();
        this.closeBuildModal();
        return;
      }
      if (this.#selectedBuilding !== null) {
        e.preventDefault();
        this.#cancelPlacement();
      }
    };
    document.addEventListener('keydown', this.#modalEscapeHandler);
  }

  /**
   * @param {'health' | 'attack'} kind
   */
  #confirmKnightUpgrade(kind) {
    if (!this.#knightUpgradeCallbacks) {
      return;
    }
    const result = this.#knightUpgradeCallbacks.onUpgrade(kind);
    if (!result.ok && result.message) {
      this.showToast(result.message);
    }
    this.#refreshKnightUpgradeModal();
  }

  #refreshKnightUpgradeModal() {
    if (!this.#knightUpgradeModalEl || !this.#knightUpgradeCallbacks) {
      return;
    }
    const state = this.#knightUpgradeCallbacks.getViewState();
    const { healthLevel, attackLevel, maxLevel, blacksmithCount, resources } = state;

    const leadEl = document.getElementById('knight-upgrade-lead');
    if (leadEl) {
      leadEl.textContent = `Upgrade all your knights. Blacksmiths: ${blacksmithCount} · max level per stat: ${maxLevel} (${KNIGHT_UPGRADE_LEVELS_PER_BLACKSMITH} per blacksmith).`;
    }

    const healthLevelsEl = document.getElementById('knight-upgrade-health-levels');
    const attackLevelsEl = document.getElementById('knight-upgrade-attack-levels');
    if (healthLevelsEl) {
      healthLevelsEl.textContent = `${healthLevel} / ${maxLevel}`;
    }
    if (attackLevelsEl) {
      attackLevelsEl.textContent = `${attackLevel} / ${maxLevel}`;
    }

    const healthStatEl = document.getElementById('knight-upgrade-health-stat');
    const attackStatEl = document.getElementById('knight-upgrade-attack-stat');
    if (healthStatEl) {
      healthStatEl.textContent = describeKnightUpgradeStat('health', healthLevel);
    }
    if (attackStatEl) {
      attackStatEl.textContent = describeKnightUpgradeStat('attack', attackLevel);
    }

    const healthCostEl = document.getElementById('knight-upgrade-health-cost');
    const attackCostEl = document.getElementById('knight-upgrade-attack-cost');
    const healthBtn = document.getElementById('knight-upgrade-health-btn');
    const attackBtn = document.getElementById('knight-upgrade-attack-btn');

    if (healthLevel >= maxLevel) {
      if (healthCostEl) {
        healthCostEl.textContent = 'Max level reached for your blacksmiths.';
      }
      healthBtn?.setAttribute('disabled', '');
    } else {
      const next = healthLevel + 1;
      const cost = formatKnightUpgradeCostLine('health', next);
      if (healthCostEl) {
        healthCostEl.textContent = `Next level (${next}): ${cost}`;
      }
      if (canAfford(resources, getKnightUpgradeCost('health', next))) {
        healthBtn?.removeAttribute('disabled');
      } else {
        healthBtn?.setAttribute('disabled', '');
      }
    }

    if (attackLevel >= maxLevel) {
      if (attackCostEl) {
        attackCostEl.textContent = 'Max level reached for your blacksmiths.';
      }
      attackBtn?.setAttribute('disabled', '');
    } else {
      const next = attackLevel + 1;
      const cost = formatKnightUpgradeCostLine('attack', next);
      if (attackCostEl) {
        attackCostEl.textContent = `Next level (${next}): ${cost}`;
      }
      if (canAfford(resources, getKnightUpgradeCost('attack', next))) {
        attackBtn?.removeAttribute('disabled');
      } else {
        attackBtn?.setAttribute('disabled', '');
      }
    }
  }

  /**
   * @param {{
   *   getViewState: () => {
   *     healthLevel: number;
   *     attackLevel: number;
   *     maxLevel: number;
   *     blacksmithCount: number;
   *     resources: import('../constants/resources.js').PlayerResources;
   *   };
   *   onUpgrade: (kind: 'health' | 'attack') => { ok: boolean; message?: string };
   * }} callbacks
   */
  openKnightUpgrade(callbacks) {
    if (!this.#knightUpgradeModalEl) {
      return;
    }
    this.closeMarketShop();
    this.closeCastleUpgrade();
    this.#knightUpgradeCallbacks = callbacks;
    this.#knightUpgradeModalEl.hidden = false;
    this.#knightUpgradeModalEl.setAttribute('aria-hidden', 'false');
    this.#refreshKnightUpgradeModal();
    document.getElementById('knight-upgrade-health-btn')?.focus();
  }

  closeKnightUpgrade() {
    if (!this.#knightUpgradeModalEl) {
      return;
    }
    this.#knightUpgradeModalEl.hidden = true;
    this.#knightUpgradeModalEl.setAttribute('aria-hidden', 'true');
    this.#knightUpgradeCallbacks = null;
  }

  #initCastleUpgradeModal() {
    this.#castleUpgradeModalEl = document.getElementById('castle-upgrade-modal');
    if (!this.#castleUpgradeModalEl) {
      return;
    }

    document.getElementById('castle-upgrade-range-btn')?.addEventListener('click', () => {
      this.#confirmCastleUpgrade('range');
    });
    document.getElementById('castle-upgrade-damage-btn')?.addEventListener('click', () => {
      this.#confirmCastleUpgrade('damage');
    });
    document.getElementById('castle-upgrade-speed-btn')?.addEventListener('click', () => {
      this.#confirmCastleUpgrade('speed');
    });

    const close = () => this.closeCastleUpgrade();
    for (const el of this.#castleUpgradeModalEl.querySelectorAll('[data-castle-upgrade-close]')) {
      el.addEventListener('click', close);
    }
  }

  /**
   * @param {'range' | 'damage' | 'speed'} kind
   */
  #confirmCastleUpgrade(kind) {
    if (!this.#castleUpgradeCallbacks) {
      return;
    }
    const result = this.#castleUpgradeCallbacks.onUpgrade(kind);
    if (!result.ok && result.message) {
      this.showToast(result.message);
    }
    this.#refreshCastleUpgradeModal();
  }

  #refreshCastleUpgradeModal() {
    if (!this.#castleUpgradeModalEl || !this.#castleUpgradeCallbacks) {
      return;
    }
    const { rangeLevel, damageLevel, speedLevel, resources } =
      this.#castleUpgradeCallbacks.getViewState();

    /** @type {[('range'|'damage'|'speed'), number][]} */
    const rows = [
      ['range', rangeLevel],
      ['damage', damageLevel],
      ['speed', speedLevel],
    ];

    for (const [kind, level] of rows) {
      const maxLevel = castleMaxLevelForKind(kind);
      const maxLabel = Number.isFinite(maxLevel) ? String(maxLevel) : '∞';

      const levelsEl = document.getElementById(`castle-upgrade-${kind}-levels`);
      if (levelsEl) {
        levelsEl.textContent = `${level} / ${maxLabel}`;
      }

      const statEl = document.getElementById(`castle-upgrade-${kind}-stat`);
      if (statEl) {
        statEl.textContent = describeCastleUpgradeStat(kind, level);
      }

      const costEl = document.getElementById(`castle-upgrade-${kind}-cost`);
      const btn = document.getElementById(`castle-upgrade-${kind}-btn`);

      if (level >= maxLevel) {
        if (costEl) {
          costEl.textContent = 'Max level reached.';
        }
        btn?.setAttribute('disabled', '');
        continue;
      }

      const next = level + 1;
      if (costEl) {
        costEl.textContent = `Next level (${next}): ${formatCastleUpgradeCostLine(kind, next)}`;
      }
      if (canAfford(resources, getCastleUpgradeCost(kind, next))) {
        btn?.removeAttribute('disabled');
      } else {
        btn?.setAttribute('disabled', '');
      }
    }
  }

  /**
   * @param {{
   *   getViewState: () => {
   *     rangeLevel: number;
   *     damageLevel: number;
   *     speedLevel: number;
   *     resources: import('../constants/resources.js').PlayerResources;
   *   };
   *   onUpgrade: (kind: 'range' | 'damage' | 'speed') => { ok: boolean; message?: string };
   * }} callbacks
   */
  openCastleUpgrade(callbacks) {
    if (!this.#castleUpgradeModalEl) {
      return;
    }
    this.closeMarketShop();
    this.closeKnightUpgrade();
    this.#castleUpgradeCallbacks = callbacks;
    this.#castleUpgradeModalEl.hidden = false;
    this.#castleUpgradeModalEl.setAttribute('aria-hidden', 'false');
    this.#refreshCastleUpgradeModal();
    document.getElementById('castle-upgrade-range-btn')?.focus();
  }

  closeCastleUpgrade() {
    if (!this.#castleUpgradeModalEl) {
      return;
    }
    this.#castleUpgradeModalEl.hidden = true;
    this.#castleUpgradeModalEl.setAttribute('aria-hidden', 'true');
    this.#castleUpgradeCallbacks = null;
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
