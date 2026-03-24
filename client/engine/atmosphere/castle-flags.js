import { registerSpritePostDraw } from '../sprite-post-draw-registry.js';

const FLAG_FRAME = 8;
const FRAMES = 4;
const STRIP_ROOK = { mapX: 112, mapY: 112 };
const STRIP_TOWER = { mapX: 112, mapY: 96 };

/** Смещения 8×8 флага от левого верхнего угла спрайта замка 32×32. */
const ROOK_FLAG = { ox: 24, oy: 11 };
const TOWER_FLAG = { ox: 11, oy: -4 };

/** Фикс + случайная добавка при старте (мс), отдельно для каждого флага. */
const FLAG_INTERVAL_MS_BASE = 820;
const FLAG_INTERVAL_MS_JITTER = 1020;

function makeFlagTiming() {
  const intervalMs = FLAG_INTERVAL_MS_BASE + Math.random() * FLAG_INTERVAL_MS_JITTER;
  return { intervalMs, phaseMs: Math.random() * intervalMs };
}

const rookFlagTiming = makeFlagTiming();
const towerFlagTiming = makeFlagTiming();

function getFlagFrameIndex(timeMs, timing) {
  return Math.floor((timeMs + timing.phaseMs) / timing.intervalMs) % FRAMES;
}

/**
 * @param {number} frame
 * @param {{ mapX: number; mapY: number }} strip
 */
function frameSourceRect(frame, strip) {
  const col = frame % 2;
  const row = Math.floor(frame / 2);
  return {
    sx: strip.mapX + col * FLAG_FRAME,
    sy: strip.mapY + row * FLAG_FRAME,
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} tileMap
 * @param {number} destX
 * @param {number} destY
 * @param {number} frame
 * @param {{ mapX: number; mapY: number }} strip
 */
function blitFlagFrame(ctx, tileMap, destX, destY, frame, strip) {
  const { sx, sy } = frameSourceRect(frame, strip);
  ctx.drawImage(tileMap, sx, sy, FLAG_FRAME, FLAG_FRAME, destX, destY, FLAG_FRAME, FLAG_FRAME);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} tileMap
 * @param {number} screenX
 * @param {number} screenY
 * @param {number} timeMs
 */
export function drawCastleFlagsFromTilemap(ctx, tileMap, screenX, screenY, timeMs) {
  const frameRook = getFlagFrameIndex(timeMs, rookFlagTiming);
  const frameTower = getFlagFrameIndex(timeMs, towerFlagTiming);

  blitFlagFrame(ctx, tileMap, screenX + ROOK_FLAG.ox, screenY + ROOK_FLAG.oy, frameRook, STRIP_TOWER);
  blitFlagFrame(ctx, tileMap, screenX + TOWER_FLAG.ox, screenY + TOWER_FLAG.oy, frameTower, STRIP_ROOK);
}

registerSpritePostDraw('castle', (sprite, ctx, tileMap, timeMs) => {
  const { x, y } = sprite.getPos();
  drawCastleFlagsFromTilemap(ctx, tileMap, x, y, timeMs);
});
