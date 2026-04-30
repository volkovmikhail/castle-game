import { PLAYER_PROFILES } from '../../constants/players.js';
import { TILE_SIZE } from '../../constants/sizes.js';
import { tiles } from '../../constants/tiles.js';

const MARGIN_TILES = 2;

/** @type {{ minX: number; maxX: number; minY: number; maxY: number }[] | null} */
let cachedMargins = null;

/**
 * Прямоугольники в координатах мира (как ключи state): без деревьев вокруг стартовых замков.
 *
 * @returns {{ minX: number; maxX: number; minY: number; maxY: number }[]}
 */
export function getCastleNoTreeMarginsPx() {
  if (cachedMargins) {
    return cachedMargins;
  }

  const w = tiles.castle.width;
  const h = tiles.castle.height;
  const pad = MARGIN_TILES * TILE_SIZE;

  cachedMargins = PLAYER_PROFILES.map(({ castleStart: { x: cx, y: cy } }) => ({
    minX: cx - pad,
    maxX: cx + w + pad - TILE_SIZE,
    minY: cy - pad,
    maxY: cy + h + pad - TILE_SIZE,
  }));

  return cachedMargins;
}

/**
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isInsideCastleNoTreeMargin(x, y) {
  return getCastleNoTreeMarginsPx().some(
    (r) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY
  );
}
