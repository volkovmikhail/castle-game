import { TILE_SIZE } from '../../constants/sizes.js';
import { tiles } from '../../constants/tiles.js';
import {
  FOREST_SPAWN_RARE_ROLL_MAX,
  FOREST_SPAWN_RARE_THRESHOLD,
  FOREST_SPAWN_RARE_TILE_KEYS,
} from '../../constants/forest-flora-spawn.js';
import { TreesGenerator } from '../generators/trees-generator.js';

/** Тот же пул и те же пропорции (обычные/редкие), что и у обычной генерации леса в игре. */
const COMMON_TREE_KEYS = TreesGenerator.getInitialFillTileKeys();

/**
 * Быстрый детерминированный хэш по координатам тайла → [0, 1).
 * Без Math.random — чтобы лес за картой не "мерцал" перерисовкой каждый кадр.
 *
 * @param {number} tx
 * @param {number} ty
 * @returns {number}
 */
function hashTile(tx, ty) {
  let h = Math.imul(tx, 374761393) ^ Math.imul(ty, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Тот же алгоритм выбора, что и {@link TreesGenerator.pickRandomForestSpawnTileKey},
 * но детерминированный по координатам тайла (вместо Math.random).
 *
 * @param {number} tx
 * @param {number} ty
 * @returns {string}
 */
function pickExteriorTileKey(tx, ty) {
  const rareRoll = Math.floor(hashTile(tx, ty) * FOREST_SPAWN_RARE_ROLL_MAX);
  if (rareRoll < FOREST_SPAWN_RARE_THRESHOLD) {
    const i = Math.floor(hashTile(tx + 1, ty - 1) * FOREST_SPAWN_RARE_TILE_KEYS.length);
    return FOREST_SPAWN_RARE_TILE_KEYS[i % FOREST_SPAWN_RARE_TILE_KEYS.length];
  }
  const j = Math.floor(hashTile(tx - 1, ty + 1) * COMMON_TREE_KEYS.length);
  return COMMON_TREE_KEYS[j % COMMON_TREE_KEYS.length];
}

/**
 * Рисует лес за пределами карты (видимую часть) с той же плотностью и тем же
 * пулом тайлов, что и обычная генерация леса в игре, чтобы скролл "за край"
 * выглядел продолжением того же мира. Только визуал, без состояния.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} tileMap
 * @param {{
 *   offsetX: number; offsetY: number;
 *   canvasWidth: number; canvasHeight: number;
 *   worldWidthPx: number; worldHeightPx: number;
 * }} param
 */
export function drawExteriorForest(
  ctx,
  tileMap,
  { offsetX, offsetY, canvasWidth, canvasHeight, worldWidthPx, worldHeightPx }
) {
  const startTx = Math.floor((-offsetX) / TILE_SIZE) * TILE_SIZE - TILE_SIZE;
  const endTx = Math.ceil((canvasWidth - offsetX) / TILE_SIZE) * TILE_SIZE + TILE_SIZE;
  const startTy = Math.floor((-offsetY) / TILE_SIZE) * TILE_SIZE - TILE_SIZE;
  const endTy = Math.ceil((canvasHeight - offsetY) / TILE_SIZE) * TILE_SIZE + TILE_SIZE;

  for (let tx = startTx; tx <= endTx; tx += TILE_SIZE) {
    const insideX = tx >= 0 && tx < worldWidthPx;
    for (let ty = startTy; ty <= endTy; ty += TILE_SIZE) {
      if (insideX && ty >= 0 && ty < worldHeightPx) {
        continue; // внутри карты — отрисуется обычным слоем мира
      }
      const tileKey = pickExteriorTileKey(tx, ty);
      const tileData = tiles[tileKey];
      ctx.drawImage(
        tileMap,
        tileData.mapX,
        tileData.mapY,
        tileData.width,
        tileData.height,
        tx + offsetX,
        ty + offsetY,
        tileData.width,
        tileData.height
      );
    }
  }
}
