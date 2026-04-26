/**
 * Расширяемые эффекты после основного спрайта (флаги, частицы на тайле и т.д.).
 * @typedef {import('./sprite.js').Sprite} Sprite
 * @typedef {import('./state/cell.js').Cell} Cell
 */

/**
 * @type {Map<string, (sprite: Sprite, ctx: CanvasRenderingContext2D, tileMap: CanvasImageSource, timeMs: number, cell?: Cell) => void>}
 */
const handlers = new Map();

/**
 * @param {string} tileType
 * @param {(sprite: Sprite, ctx: CanvasRenderingContext2D, tileMap: CanvasImageSource, timeMs: number, cell?: Cell) => void} fn
 */
export function registerSpritePostDraw(tileType, fn) {
  handlers.set(tileType, fn);
}

/**
 * @param {Sprite} sprite
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} tileMap
 * @param {number} timeMs
 * @param {Cell} [cell]
 */
export function runSpritePostDraw(sprite, ctx, tileMap, timeMs, cell) {
  const type = sprite.getTileData().type;
  const fn = handlers.get(type);
  if (fn) {
    fn(sprite, ctx, tileMap, timeMs, cell);
  }
}
