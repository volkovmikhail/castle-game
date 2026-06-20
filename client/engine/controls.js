import { TILE_SIZE } from '../constants/sizes.js';
import {
  WORLD_HEIGHT_PX,
  WORLD_MIN_VISIBLE_EDGE_PX,
  WORLD_WIDTH_PX,
} from '../constants/world.js';

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
  /** Зажат S — режим приказа перемещения (ЛКМ = идти к точке), курсор-прицел. */
  #isMovePressed = false;

  /** @type {{ x: number; y: number } | null} последняя позиция мыши относительно канваса. */
  #lastCanvasX = null;
  #lastCanvasY = null;

  /** Множитель чувствительности скролла трекпада/колеса. */
  static #WHEEL_SENSITIVITY = 0.4;

  init() {
    this.setViewportSize({ width: this.canvas.width, height: this.canvas.height });

    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space') {
        this.#isSpacePressed = true;
        event.preventDefault();
      }
      if (
        event.code === 'KeyA' &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.repeat
      ) {
        const t = event.target;
        if (
          t instanceof HTMLElement &&
          (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
        ) {
          return;
        }
        this.#pendingSelectAllKnights = true;
        event.preventDefault();
      }
      if (
        event.code === 'KeyS' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const t = event.target;
        if (
          t instanceof HTMLElement &&
          (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
        ) {
          return;
        }
        this.#setMovePressed(true);
      }
    });

    window.addEventListener('keyup', (event) => {
      if (event.code === 'Space') {
        this.#isSpacePressed = false;
        event.preventDefault();
      }
      if (event.code === 'KeyS') {
        this.#setMovePressed(false);
      }
    });

    window.addEventListener('blur', () => {
      this.#isSpacePressed = false;
      this.#setMovePressed(false);
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
        this.#setScrollOffset({
          offsetX: this.#scrollOffsetX - event.deltaX * Controls.#WHEEL_SENSITIVITY,
          offsetY: this.#scrollOffsetY - event.deltaY * Controls.#WHEEL_SENSITIVITY,
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

  /** Зажата ли кнопка S (режим приказа перемещения выделенных рыцарей). */
  isMovePressed() {
    return this.#isMovePressed;
  }

  /**
   * Один раз за нажатие Shift+A (выделить всех своих рыцарей).
   *
   * @returns {boolean}
   */
  consumeSelectAllKnightsRequest() {
    const v = this.#pendingSelectAllKnights;
    this.#pendingSelectAllKnights = false;
    return v;
  }
}
