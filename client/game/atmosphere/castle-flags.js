import { registerSpritePostDraw } from '../../engine/sprite-post-draw-registry.js';
import { PLAYER_PROFILES } from '../../constants/players.js';

const FLAG_FRAME = 8;
const FRAMES = 4;
const STRIP_ROOK = { mapX: 112, mapY: 112 };
const STRIP_TOWER = { mapX: 112, mapY: 96 };
const DEFAULT_FLAG_COLOR = '#ffffff';
const POLE_MASK_ROOK = { x: 3, width: 1 };
const POLE_MASK_TOWER = { x: 0, width: 1 };

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
const playerColorByUserId = new Map(PLAYER_PROFILES.map(({ userId, color }) => [userId, color]));

/** @type {HTMLCanvasElement | null} */
let tintCanvas = null;
/** @type {CanvasRenderingContext2D | null} */
let tintCtx = null;

function getTintContext() {
  if (!tintCanvas) {
    tintCanvas = document.createElement('canvas');
    tintCanvas.width = FLAG_FRAME;
    tintCanvas.height = FLAG_FRAME;
    tintCtx = tintCanvas.getContext('2d');
  }
  return tintCtx;
}

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
 * @param {string} color
 * @param {{ x: number; width: number }} poleMask
 */
function blitFlagFrame(ctx, tileMap, destX, destY, frame, strip, color, poleMask) {
  const { sx, sy } = frameSourceRect(frame, strip);
  const localTintCtx = getTintContext();
  if (!localTintCtx) {
    ctx.drawImage(tileMap, sx, sy, FLAG_FRAME, FLAG_FRAME, destX, destY, FLAG_FRAME, FLAG_FRAME);
    return;
  }

  localTintCtx.clearRect(0, 0, FLAG_FRAME, FLAG_FRAME);
  localTintCtx.globalCompositeOperation = 'source-over';
  localTintCtx.drawImage(tileMap, sx, sy, FLAG_FRAME, FLAG_FRAME, 0, 0, FLAG_FRAME, FLAG_FRAME);
  localTintCtx.globalCompositeOperation = 'source-atop';
  localTintCtx.fillStyle = color;
  localTintCtx.fillRect(0, 0, FLAG_FRAME, FLAG_FRAME);
  localTintCtx.globalCompositeOperation = 'source-over';
  // Возвращаем ножку флага в оригинальном цвете спрайта.
  localTintCtx.drawImage(
    tileMap,
    sx + poleMask.x,
    sy,
    poleMask.width,
    FLAG_FRAME,
    poleMask.x,
    0,
    poleMask.width,
    FLAG_FRAME
  );

  ctx.drawImage(localTintCtx.canvas, destX, destY);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} tileMap
 * @param {number} screenX
 * @param {number} screenY
 * @param {number} timeMs
 * @param {string | undefined | null} ownerUserId
 */
export function drawCastleFlagsFromTilemap(ctx, tileMap, screenX, screenY, timeMs, ownerUserId) {
  const frameRook = getFlagFrameIndex(timeMs, rookFlagTiming);
  const frameTower = getFlagFrameIndex(timeMs, towerFlagTiming);
  const ownerColor = playerColorByUserId.get(ownerUserId ?? '') ?? DEFAULT_FLAG_COLOR;

  blitFlagFrame(
    ctx,
    tileMap,
    screenX + ROOK_FLAG.ox,
    screenY + ROOK_FLAG.oy,
    frameRook,
    STRIP_TOWER,
    ownerColor,
    POLE_MASK_ROOK
  );
  blitFlagFrame(
    ctx,
    tileMap,
    screenX + TOWER_FLAG.ox,
    screenY + TOWER_FLAG.oy,
    frameTower,
    STRIP_ROOK,
    ownerColor,
    POLE_MASK_TOWER
  );
}

registerSpritePostDraw('castle', (sprite, ctx, tileMap, timeMs, cell) => {
  const { x, y } = sprite.getPos();
  drawCastleFlagsFromTilemap(ctx, tileMap, x, y, timeMs, cell?.ownerUserId);
});
