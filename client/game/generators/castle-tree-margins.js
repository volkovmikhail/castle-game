import { PLAYER_PROFILES } from '../../constants/players.js';
import { TILE_SIZE } from '../../constants/sizes.js';
import { tiles } from '../../constants/tiles.js';

const MARGIN_TILES = 1;

/** @typedef {{ minX: number; maxX: number; minY: number; maxY: number }} CastleNoTreeMargin */

/** @type {CastleNoTreeMargin[] | null} */
let cachedMargins = null;

/**
 * Прямоугольники в координатах мира (как ключи state): без деревьев вокруг
 * переданных стартовых замков. Мультиплеер передаёт сюда только активные слоты
 * партии — углы пустых слотов остаются заросшими лесом.
 *
 * @param {{ x: number; y: number }[]} castleStarts
 * @returns {CastleNoTreeMargin[]}
 */
export function computeCastleNoTreeMarginsPx(castleStarts) {
  const w = tiles.castle.width;
  const h = tiles.castle.height;
  const pad = MARGIN_TILES * TILE_SIZE;

  return castleStarts.map(({ x: cx, y: cy }) => ({
    minX: cx - pad,
    maxX: cx + w + pad - TILE_SIZE,
    minY: cy - pad,
    maxY: cy + h + pad - TILE_SIZE,
  }));
}

/**
 * Каймы всех профилей (одиночный режим: заняты все 4 угла).
 *
 * @returns {CastleNoTreeMargin[]}
 */
export function getCastleNoTreeMarginsPx() {
  if (!cachedMargins) {
    cachedMargins = computeCastleNoTreeMarginsPx(PLAYER_PROFILES.map((p) => p.castleStart));
  }
  return cachedMargins;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {CastleNoTreeMargin[]} [margins] каймы активных замков; по умолчанию — всех профилей
 * @returns {boolean}
 */
export function isInsideCastleNoTreeMargin(x, y, margins = getCastleNoTreeMarginsPx()) {
  return margins.some((r) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY);
}
