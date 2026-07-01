import { TILE_SIZE } from '../constants/sizes.js';
import {
  WORLD_HEIGHT_PX,
  WORLD_MIN_VISIBLE_EDGE_PX,
  WORLD_WIDTH_PX,
} from '../constants/world.js';
import { getScrollSensitivity } from '../ui/settings-store.js';

/**
 * @typedef {{ x: number, y: number, tx: number, ty:number }} Coords
 */
export class Controls {
  /**
   * Creates an instance of Controls.
   *
   * @constructor
   * @param {{ canvas: HTMLElement; }} params
   */
  constructor({ canvas }) {
    this.canvas = canvas;
  }

  /**
   * @type {Coords}
   */
  #selectedCoords;

  /**
   * @type {Coords}
   */
  #clickedStateCoords = null;

  #isMouseDown = false;
  /** @type {boolean} */
  #isPanning = false;
  /** ПКМ зажата: тянем — рамка выделения (как Shift+ЛКМ); просто клик — приказ юнитам. */
  #isRightMouseDown = false;
  /** Shift зажат в момент ЛКМ — перетаскивание = рамка выделения; без Shift = панорама камеры. */
  #dragStartedWithShift = false;
  #startX;
  #startY;

  #canvasStartX;
  #canvasStartY;

  /** @type {{ wx: number; wy: number } | null} */
  #marqueeWorldStart = null;
  /** @type {{ wx: number; wy: number } | null} */
  #marqueeWorldCurrent = null;
  #marqueeExceededThreshold = false;
  /** @type {{ minX: number; minY: number; maxX: number; maxY: number } | null} */
  #pendingMarquee = null;
  #suppressNextClick = false;

  #scrollOffsetX = 0;
  #scrollOffsetY = 0;
  #viewportWidth = 0;
  #viewportHeight = 0;

  /**
   * @type {{ wx: number; wy: number } | null}
   */
  #pendingRightWorld = null;

  /**
   * @type {boolean}
   */
  #lastLeftClickShift = false;
  #isSpacePressed = false;
  #pendingSelectAllKnights = false;
  /** Нажата «X» — открыть магазин (обмен). */
  #pendingOpenShop = false;
  /** Нажата «Z» — открыть кузницу (прокачка рыцарей). */
  #pendingOpenForge = false;
  /** Нажата «C» — открыть пушку/замок (прокачка). */
  #pendingOpenCastle = false;
  /** Нажата «1» — переключить режим тренировки воинов. */
  #pendingToggleTrain = false;
  /** Нажата «2» — переключить режим постройки. */
  #pendingToggleBuild = false;
  /** Нажата «R» — снять выделение с воинов. */
  #pendingClearSelection = false;
  /** Нажата «F» — перевести камеру к своему замку. */
  #pendingJumpToCastle = false;
  /** Зажат E — режим приказа перемещения (ЛКМ = идти к точке), курсор-прицел. */
  #isMovePressed = false;

  /** @type {{ x: number; y: number } | null} последняя позиция мыши относительно канваса. */
  #lastCanvasX = null;
  #lastCanvasY = null;

  /** Скорость панорамы камеры кнопками WASD, пикселей мира в миллисекунду. */
  static #KEY_PAN_SPEED_PER_MS = 0.4;

  /** @type {Set<string>} нажатые сейчас кнопки панорамы WASD (event.code). */
  #pressedPanKeys = new Set();

  init() {
    this.setViewportSize({ width: this.canvas.width, height: this.canvas.height });

    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space') {
        this.#isSpacePressed = true;
        event.preventDefault();
      }
      // В текстовых полях не перехватываем клавиши. В числовом поле (например,
      // количество в магазине) блокируем только цифры-хоткеи — буквы вроде X/Z/C
      // должны работать, иначе модалку не закрыть с фокусом в инпуте.
      if (Controls.#isTextEntryTarget(event.target)) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const inNumberInput = Controls.#isNumberInputTarget(event.target);

      // Q — выделить всех своих рыцарей (раньше было Shift+A).
      if (event.code === 'KeyQ' && !event.repeat) {
        this.#pendingSelectAllKnights = true;
        event.preventDefault();
      }

      // E — режим приказа перемещения (раньше было S).
      if (event.code === 'KeyE') {
        this.#setMovePressed(true);
      }

      // WASD — панорама камеры.
      if (
        event.code === 'KeyW' ||
        event.code === 'KeyA' ||
        event.code === 'KeyS' ||
        event.code === 'KeyD'
      ) {
        this.#pressedPanKeys.add(event.code);
        event.preventDefault();
      }

      // X / Z / C — открыть магазин / кузницу / пушку (замок), если есть.
      if (event.code === 'KeyX' && !event.repeat) {
        this.#pendingOpenShop = true;
        event.preventDefault();
      }
      if (event.code === 'KeyZ' && !event.repeat) {
        this.#pendingOpenForge = true;
        event.preventDefault();
      }
      if (event.code === 'KeyC' && !event.repeat) {
        this.#pendingOpenCastle = true;
        event.preventDefault();
      }

      // 1 — переключить режим тренировки воинов (повторное нажатие отключает).
      // В числовом поле цифры не перехватываем — там их набирают.
      if (event.code === 'Digit1' && !event.repeat && !inNumberInput) {
        this.#pendingToggleTrain = true;
        event.preventDefault();
      }

      // 2 — переключить режим постройки (повторное нажатие отключает).
      if (event.code === 'Digit2' && !event.repeat && !inNumberInput) {
        this.#pendingToggleBuild = true;
        event.preventDefault();
      }

      // R — полностью снять выделение с воинов.
      if (event.code === 'KeyR' && !event.repeat) {
        this.#pendingClearSelection = true;
        event.preventDefault();
      }

      // F — мгновенно перевести камеру к своему замку.
      if (event.code === 'KeyF' && !event.repeat) {
        this.#pendingJumpToCastle = true;
        event.preventDefault();
      }
    });

    window.addEventListener('keyup', (event) => {
      if (event.code === 'Space') {
        this.#isSpacePressed = false;
        event.preventDefault();
      }
      if (event.code === 'KeyE') {
        this.#setMovePressed(false);
      }
      this.#pressedPanKeys.delete(event.code);
    });

    window.addEventListener('blur', () => {
      this.#isSpacePressed = false;
      this.#setMovePressed(false);
      this.#pressedPanKeys.clear();
    });

    this.canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    this.canvas.addEventListener(
      'wheel',
      (event) => {
        // Пинч-зум на трекпаде приходит как wheel с ctrlKey — не используем его для панорамы.
        if (event.ctrlKey) return;
        event.preventDefault();
        // Чувствительность берём каждый раз — меняется в настройках на лету.
        const sensitivity = getScrollSensitivity();
        this.#setScrollOffset({
          offsetX: this.#scrollOffsetX - event.deltaX * sensitivity,
          offsetY: this.#scrollOffsetY - event.deltaY * sensitivity,
        });

        if (this.#lastCanvasX != null && this.#lastCanvasY != null) {
          const { tx, ty } = this.#calculateTileSizedCoords({
            canvasX: this.#lastCanvasX,
            canvasY: this.#lastCanvasY,
          });
          this.#setSelectedCoords({ tx, ty, x: this.#lastCanvasX, y: this.#lastCanvasY });
        }
      },
      { passive: false }
    );

    this.canvas.addEventListener('mousemove', (event) => {
      const cords = this.#calculateSelectorCoords(event);
      this.#lastCanvasX = cords.x;
      this.#lastCanvasY = cords.y;
      if (this.#isPanning && !this.#dragStartedWithShift) {
        const offset = this.#calculateOffset(event);

        this.#setScrollOffset(offset);
      }

      const isMarqueeDragging = (this.#isMouseDown && this.#dragStartedWithShift) || this.#isRightMouseDown;
      if (isMarqueeDragging && this.#marqueeWorldStart) {
        const { x, y } = this.#calculateCanvasRelativeCoords(event);
        const wx = x - this.#scrollOffsetX;
        const wy = y - this.#scrollOffsetY;
        this.#marqueeWorldCurrent = { wx, wy };
        const dx = wx - this.#marqueeWorldStart.wx;
        const dy = wy - this.#marqueeWorldStart.wy;
        if (Math.hypot(dx, dy) >= 4) {
          this.#marqueeExceededThreshold = true;
        }
      }

      this.#setSelectedCoords(cords);
    });

    this.canvas.addEventListener('mousedown', (event) => {
      if (event.button === 2) {
        const { x, y } = this.#calculateCanvasRelativeCoords(event);
        this.#startX = event.clientX;
        this.#startY = event.clientY;
        this.#isRightMouseDown = true;
        const wx = x - this.#scrollOffsetX;
        const wy = y - this.#scrollOffsetY;
        this.#marqueeWorldStart = { wx, wy };
        this.#marqueeWorldCurrent = { wx, wy };
        this.#marqueeExceededThreshold = false;
        return;
      }

      if (event.button !== 0) {
        return;
      }

      const { x, y } = this.#calculateCanvasRelativeCoords(event);

      this.#canvasStartX = x - this.#scrollOffsetX;
      this.#canvasStartY = y - this.#scrollOffsetY;

      this.#startX = event.clientX;
      this.#startY = event.clientY;
      this.#isMouseDown = true;
      this.#dragStartedWithShift = event.shiftKey;
      if (event.shiftKey) {
        this.#isPanning = false;
        const wx = x - this.#scrollOffsetX;
        const wy = y - this.#scrollOffsetY;
        this.#marqueeWorldStart = { wx, wy };
        this.#marqueeWorldCurrent = { wx, wy };
        this.#marqueeExceededThreshold = false;
      } else {
        this.#isPanning = true;
        this.#marqueeWorldStart = null;
        this.#marqueeWorldCurrent = null;
        this.#marqueeExceededThreshold = false;
      }
    });

    this.canvas.addEventListener('mouseup', (event) => {
      if (event.button === 2) {
        if (this.#marqueeExceededThreshold && this.#marqueeWorldStart && this.#marqueeWorldCurrent) {
          const a = this.#marqueeWorldStart;
          const b = this.#marqueeWorldCurrent;
          this.#pendingMarquee = {
            minX: Math.min(a.wx, b.wx),
            minY: Math.min(a.wy, b.wy),
            maxX: Math.max(a.wx, b.wx),
            maxY: Math.max(a.wy, b.wy),
          };
        } else {
          const { x, y } = this.#calculateCanvasRelativeCoords(event);
          this.#pendingRightWorld = {
            wx: x - this.#scrollOffsetX,
            wy: y - this.#scrollOffsetY,
          };
        }
        this.#isRightMouseDown = false;
        this.#marqueeWorldStart = null;
        this.#marqueeWorldCurrent = null;
        this.#marqueeExceededThreshold = false;
        return;
      }
      if (event.button === 0) {
        if (this.#dragStartedWithShift && this.#marqueeExceededThreshold && this.#marqueeWorldStart && this.#marqueeWorldCurrent) {
          const a = this.#marqueeWorldStart;
          const b = this.#marqueeWorldCurrent;
          this.#pendingMarquee = {
            minX: Math.min(a.wx, b.wx),
            minY: Math.min(a.wy, b.wy),
            maxX: Math.max(a.wx, b.wx),
            maxY: Math.max(a.wy, b.wy),
          };
          this.#suppressNextClick = true;
        }
        this.#marqueeWorldStart = null;
        this.#marqueeWorldCurrent = null;
        this.#marqueeExceededThreshold = false;
        this.#isMouseDown = false;
        this.#isPanning = false;
      }
    });

    this.canvas.addEventListener('click', (event) => {
      if (event.button !== 0) {
        return;
      }

      if (this.#suppressNextClick) {
        this.#suppressNextClick = false;
        return;
      }

      const cords = this.#calculateClickedStateCoords(event);
      const { x, y } = this.#calculateCanvasRelativeCoords(event);
      const worldPx = x - this.#scrollOffsetX;
      const worldPy = y - this.#scrollOffsetY;

      if (this.#isClick(event)) {
        this.#lastLeftClickShift = event.shiftKey;
        this.#setClickedCoords({ ...cords, worldPx, worldPy });
      }
    });
  }

  /**
   * Returns coords related to State Map
   *
   * @param {*} event
   * @returns {{tx: number, ty: number}}
   */
  #calculateClickedStateCoords(event) {
    const { x, y } = this.#calculateCanvasRelativeCoords(event);

    const { tx, ty } = this.#calculateTileSizedCoords({ canvasX: x, canvasY: y });

    return { tx: tx - this.#scrollOffsetX, ty: ty - this.#scrollOffsetY };
  }

  /**
   * Returns tile coords related to current player view (just applies offset and adjusts)
   *
   * @param {*} event
   * @returns {Coords}
   */
  #calculateSelectorCoords(event) {
    const { x, y } = this.#calculateCanvasRelativeCoords(event);

    const { tx, ty } = this.#calculateTileSizedCoords({ canvasX: x, canvasY: y });

    return { tx, ty, x, y };
  }

  /**
   * @param {{ canvasX: number; canvasY: number; }}
   * @returns {{ tx: number; ty: number; }}
   */
  #calculateTileSizedCoords({ canvasX, canvasY }) {
    const tileSizeOffsetX = this.#scrollOffsetX % TILE_SIZE;
    const tileSizeOffsetY = this.#scrollOffsetY % TILE_SIZE;

    const tx = Math.floor((canvasX - tileSizeOffsetX) / TILE_SIZE) * TILE_SIZE;
    const ty = Math.floor((canvasY - tileSizeOffsetY) / TILE_SIZE) * TILE_SIZE;

    return { tx: tx + tileSizeOffsetX, ty: ty + tileSizeOffsetY };
  }

  #calculateCanvasRelativeCoords(event) {
    const rect = this.canvas.getBoundingClientRect();

    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = Math.round((event.clientX - rect.left) * scaleX);
    const y = Math.round((event.clientY - rect.top) * scaleY);

    return { x, y };
  }

  #calculateOffset(event) {
    const { x, y } = this.#calculateCanvasRelativeCoords(event);

    return { offsetX: x - this.#canvasStartX, offsetY: y - this.#canvasStartY };
  }

  #isClick(event) {
    if (!this.#isMouseDown) {
      const deltaX = event.clientX - this.#startX;
      const deltaY = event.clientY - this.#startY;

      if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) {
        return true;
      }
      event.stopImmediatePropagation();

      return false;
    }

    return false;
  }

  #setScrollOffset({ offsetX, offsetY }) {
    const minOffsetX = -WORLD_WIDTH_PX + WORLD_MIN_VISIBLE_EDGE_PX;
    const maxOffsetX = this.#viewportWidth - WORLD_MIN_VISIBLE_EDGE_PX;
    const minOffsetY = -WORLD_HEIGHT_PX + WORLD_MIN_VISIBLE_EDGE_PX;
    const maxOffsetY = this.#viewportHeight - WORLD_MIN_VISIBLE_EDGE_PX;

    this.#scrollOffsetX = Math.round(Math.min(Math.max(offsetX, minOffsetX), maxOffsetX));
    this.#scrollOffsetY = Math.round(Math.min(Math.max(offsetY, minOffsetY), maxOffsetY));
  }

  getScrollOffset() {
    return {
      offsetX: this.#scrollOffsetX,
      offsetY: this.#scrollOffsetY,
    };
  }

  /**
   * Центрировать камеру на точке мира (например на своём замке при старте).
   *
   * @param {number} worldX
   * @param {number} worldY
   */
  centerOn(worldX, worldY) {
    this.#setScrollOffset({
      offsetX: this.#viewportWidth / 2 - worldX,
      offsetY: this.#viewportHeight / 2 - worldY,
    });
  }

  #setSelectedCoords(cords) {
    this.#selectedCoords = cords;
  }

  #setClickedCoords(cords) {
    this.#clickedStateCoords = cords;
  }

  getSelectedCoords() {
    return this.#selectedCoords ?? { tx: -TILE_SIZE, ty: -TILE_SIZE, x: -1, y: -1 };
  }

  /**
   * returns game (state) related coords
   *
   * @returns {{ tx: number; ty: number; shiftKey: boolean; worldPx: number; worldPy: number } | null}
   */
  getClickedCoords() {
    if (this.#clickedStateCoords === null) {
      return null;
    }

    const cords = {
      ...this.#clickedStateCoords,
      shiftKey: this.#lastLeftClickShift,
    };

    this.#clickedStateCoords = null;

    return cords;
  }

  /**
   * ПКМ в координатах мира (центр клика), для приказов юнитам.
   *
   * @returns {{ wx: number; wy: number } | null}
   */
  consumeRightClickWorld() {
    const p = this.#pendingRightWorld;
    this.#pendingRightWorld = null;
    return p;
  }

  /**
   * Рамка выделения в мировых пикселях (для отрисовки), пока тянут ЛКМ с зажатым Shift.
   *
   * @returns {{ minX: number; minY: number; maxX: number; maxY: number } | null}
   */
  getMarqueeDraftWorldRect() {
    const isMarqueeDragging = (this.#isMouseDown && this.#dragStartedWithShift) || this.#isRightMouseDown;
    if (!isMarqueeDragging || !this.#marqueeExceededThreshold) {
      return null;
    }
    if (!this.#marqueeWorldStart || !this.#marqueeWorldCurrent) {
      return null;
    }
    const a = this.#marqueeWorldStart;
    const b = this.#marqueeWorldCurrent;
    return {
      minX: Math.min(a.wx, b.wx),
      minY: Math.min(a.wy, b.wy),
      maxX: Math.max(a.wx, b.wx),
      maxY: Math.max(a.wy, b.wy),
    };
  }

  /**
   * Один раз за завершённый жест «рамка с Shift»; затем сбрасывается в null.
   *
   * @returns {{ minX: number; minY: number; maxX: number; maxY: number } | null}
   */
  consumeMarqueeSelectionWorldRect() {
    const r = this.#pendingMarquee;
    this.#pendingMarquee = null;
    return r;
  }

  /**
   * @param {{ width: number; height: number; }} param0
   */
  setViewportSize({ width, height }) {
    this.#viewportWidth = width;
    this.#viewportHeight = height;
    this.#setScrollOffset({
      offsetX: this.#scrollOffsetX,
      offsetY: this.#scrollOffsetY,
    });
  }

  isSpacePressed() {
    return this.#isSpacePressed;
  }

  /** Включить/выключить режим перемещения: меняем курсор канваса на прицел. */
  #setMovePressed(on) {
    if (this.#isMovePressed === on) {
      return;
    }
    this.#isMovePressed = on;
    this.canvas.style.cursor = on ? 'crosshair' : '';
  }

  /** Зажата ли кнопка E (режим приказа перемещения выделенных рыцарей). */
  isMovePressed() {
    return this.#isMovePressed;
  }

  /**
   * Один раз за нажатие Q (выделить всех своих рыцарей).
   *
   * @returns {boolean}
   */
  consumeSelectAllKnightsRequest() {
    const v = this.#pendingSelectAllKnights;
    this.#pendingSelectAllKnights = false;
    return v;
  }

  /** Один раз за нажатие «X» (открыть магазин). */
  consumeOpenShopRequest() {
    const v = this.#pendingOpenShop;
    this.#pendingOpenShop = false;
    return v;
  }

  /** Один раз за нажатие «Z» (открыть кузницу). */
  consumeOpenForgeRequest() {
    const v = this.#pendingOpenForge;
    this.#pendingOpenForge = false;
    return v;
  }

  /** Один раз за нажатие «C» (открыть пушку/замок). */
  consumeOpenCastleRequest() {
    const v = this.#pendingOpenCastle;
    this.#pendingOpenCastle = false;
    return v;
  }

  /** Один раз за нажатие «1» (переключить режим тренировки воинов). */
  consumeToggleTrainRequest() {
    const v = this.#pendingToggleTrain;
    this.#pendingToggleTrain = false;
    return v;
  }

  /** Один раз за нажатие «2» (переключить режим постройки). */
  consumeToggleBuildRequest() {
    const v = this.#pendingToggleBuild;
    this.#pendingToggleBuild = false;
    return v;
  }

  /** Один раз за нажатие «R» (снять выделение с воинов). */
  consumeClearSelectionRequest() {
    const v = this.#pendingClearSelection;
    this.#pendingClearSelection = false;
    return v;
  }

  /** Один раз за нажатие «F» (камера к своему замку). */
  consumeJumpToCastleRequest() {
    const v = this.#pendingJumpToCastle;
    this.#pendingJumpToCastle = false;
    return v;
  }

  /**
   * Сдвиг камеры кнопками WASD; вызывать каждый кадр.
   *
   * @param {number} timeStep миллисекунды с прошлого кадра.
   */
  updateKeyboardPan(timeStep) {
    if (this.#pressedPanKeys.size === 0) {
      return;
    }
    const step = Controls.#KEY_PAN_SPEED_PER_MS * timeStep;
    let dx = 0;
    let dy = 0;
    if (this.#pressedPanKeys.has('KeyW')) dy += step;
    if (this.#pressedPanKeys.has('KeyS')) dy -= step;
    if (this.#pressedPanKeys.has('KeyA')) dx += step;
    if (this.#pressedPanKeys.has('KeyD')) dx -= step;
    if (dx === 0 && dy === 0) {
      return;
    }
    this.#setScrollOffset({
      offsetX: this.#scrollOffsetX + dx,
      offsetY: this.#scrollOffsetY + dy,
    });
    if (this.#lastCanvasX != null && this.#lastCanvasY != null) {
      const { tx, ty } = this.#calculateTileSizedCoords({
        canvasX: this.#lastCanvasX,
        canvasY: this.#lastCanvasY,
      });
      this.#setSelectedCoords({ tx, ty, x: this.#lastCanvasX, y: this.#lastCanvasY });
    }
  }

  /** Текстовое поле ввода — тут любые горячие клавиши игнорируем (человек печатает). */
  static #isTextEntryTarget(t) {
    if (!(t instanceof HTMLElement)) {
      return false;
    }
    if (t.isContentEditable) {
      return true;
    }
    if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') {
      return true;
    }
    if (t instanceof HTMLInputElement) {
      const type = (t.getAttribute('type') || 'text').toLowerCase();
      return type !== 'number' && type !== 'range';
    }
    return false;
  }

  /** Числовое поле (например, количество в магазине) — блокируем только цифры-хоткеи. */
  static #isNumberInputTarget(t) {
    return t instanceof HTMLInputElement && (t.type === 'number' || t.type === 'range');
  }
}
