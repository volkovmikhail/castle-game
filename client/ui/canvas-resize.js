import { CANVAS_PIXEL_SCALE } from '../constants/canvas-display.js';

/**
 * @param {number} stageCssWidth
 * @param {number} stageCssHeight
 * @param {number} pixelScale
 * @returns {{ internalWidth: number; internalHeight: number; displayWidth: number; displayHeight: number }}
 */
export function computeCanvasDimensions(stageCssWidth, stageCssHeight, pixelScale) {
  const s = Math.max(1, Math.floor(pixelScale));
  const internalWidth = Math.max(1, Math.floor(stageCssWidth / s));
  const internalHeight = Math.max(1, Math.floor(stageCssHeight / s));
  const displayWidth = internalWidth * s;
  const displayHeight = internalHeight * s;

  return { internalWidth, internalHeight, displayWidth, displayHeight };
}

/**
 * Выставить размеры буфера канваса и CSS под стейдж и масштаб пикселей.
 *
 * @param {{ canvas: HTMLCanvasElement; stage: Element; pixelScale?: number }} options
 * @returns {boolean} true, если изменились внутренние width/height буфера (нужен `resizeViewport`).
 */
export function syncCanvasSize({ canvas, stage, pixelScale = CANVAS_PIXEL_SCALE }) {
  const { internalWidth, internalHeight, displayWidth, displayHeight } = computeCanvasDimensions(
    stage.clientWidth,
    stage.clientHeight,
    pixelScale
  );

  const bufferChanged = canvas.width !== internalWidth || canvas.height !== internalHeight;

  if (bufferChanged) {
    canvas.width = internalWidth;
    canvas.height = internalHeight;
  }

  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;

  return bufferChanged;
}

/**
 * Подписка на изменение размера стейджа (ResizeObserver + rAF-дребезг).
 * При смене внутреннего размера буфера вызывает `game.resizeViewport()`.
 *
 * @param {{
 *   canvas: HTMLCanvasElement;
 *   stage: Element;
 *   game: import('../game/game.js').Game;
 *   pixelScale?: number;
 * }} options
 */
export function attachCanvasResize({ canvas, stage, game, pixelScale = CANVAS_PIXEL_SCALE }) {
  let frame = 0;

  const apply = () => {
    const changed = syncCanvasSize({ canvas, stage, pixelScale });
    if (changed) {
      game.resizeViewport();
    }
  };

  const schedule = () => {
    if (frame) {
      cancelAnimationFrame(frame);
    }
    frame = requestAnimationFrame(() => {
      frame = 0;
      apply();
    });
  };

  const ro = new ResizeObserver(schedule);
  ro.observe(stage);
  schedule();
}
