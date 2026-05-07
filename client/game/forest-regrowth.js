import { Random } from '../common/random.js';
import { isTreeSpriteType } from '../common/grid-path.js';
import { TREE_REGROW_BUILDING_BUFFER_TILES } from '../constants/forest-regrowth.js';
import { TILE_SIZE } from '../constants/sizes.js';
import { tiles } from '../constants/tiles.js';
import { Tree } from './entities/tree.js';
import { isInsideCastleNoTreeMargin } from './generators/castle-tree-margins.js';
import { TreesGenerator } from './generators/trees-generator.js';

/** Макс. сторона отпечатка дерева в тайлах (16×16 или 32×32 → 1 или 2). */
function maxTreeFootprintTiles() {
  let m = 1;
  for (const key of TreesGenerator.getTreeTileKeys()) {
    const td = tiles[key];
    if (!td) {
      continue;
    }
    m = Math.max(m, td.width / TILE_SIZE, td.height / TILE_SIZE);
  }
  return m;
}

/**
 * Все клетки леса в координатах тайлов (каждая ячейка state с деревом), не только якорь.
 *
 * @param {Map<string, import('../engine/state/cell.js').Cell>} state
 * @returns {{ ti: number; tj: number }[]}
 */
function collectAllTreeTileIndices(state) {
  /** @type {{ ti: number; tj: number }[]} */
  const out = [];
  for (const [key, cell] of state.entries()) {
    if (!isTreeSpriteType(cell.spriteType)) {
      continue;
    }
    const [bx, by] = key.split(':').map(Number);
    out.push({
      ti: Math.floor(bx / TILE_SIZE),
      tj: Math.floor(by / TILE_SIZE),
    });
  }
  return out;
}

/**
 * @param {number} nx
 * @param {number} ny
 * @param {{ width: number; height: number }} tileData
 * @returns {{ ti: number; tj: number }[]}
 */
function footprintTileIndices(nx, ny, tileData) {
  const cellsWide = tileData.width / TILE_SIZE;
  const cellsHigh = tileData.height / TILE_SIZE;
  /** @type {{ ti: number; tj: number }[]} */
  const out = [];
  for (let ix = 0; ix < cellsWide; ix++) {
    for (let iy = 0; iy < cellsHigh; iy++) {
      const cx = nx + ix * TILE_SIZE;
      const cy = ny + iy * TILE_SIZE;
      out.push({
        ti: Math.floor(cx / TILE_SIZE),
        tj: Math.floor(cy / TILE_SIZE),
      });
    }
  }
  return out;
}

/**
 * Мин. расстояние Чебышёва между любой клеткой нового отпечатка и любой клеткой существующего леса.
 * Нужно ровно 1 — лес расширяется только «вплотную» (8-соседство по тайлам).
 *
 * @param {{ ti: number; tj: number }[]} newTiles
 * @param {{ ti: number; tj: number }[]} forestTiles
 */
function minChebyshevToForest(newTiles, forestTiles) {
  let minD = Infinity;
  for (const nt of newTiles) {
    for (const ft of forestTiles) {
      const d = Math.max(Math.abs(nt.ti - ft.ti), Math.abs(nt.tj - ft.tj));
      if (d < minD) {
        minD = d;
      }
    }
  }
  return minD;
}

/**
 * Только здания и прочие занятости — не деревья. По ним буфер «не ближе 1 клетки».
 *
 * @param {Map<string, import('../engine/state/cell.js').Cell>} state
 * @returns {{ ti: number; tj: number }[]}
 */
function collectBuildingTileCoords(state) {
  /** @type {{ ti: number; tj: number }[]} */
  const out = [];
  for (const [key, cell] of state.entries()) {
    if (isTreeSpriteType(cell.spriteType)) {
      continue;
    }
    const [bx, by] = key.split(':').map(Number);
    out.push({
      ti: Math.floor(bx / TILE_SIZE),
      tj: Math.floor(by / TILE_SIZE),
    });
  }
  return out;
}

/**
 * @param {number} ti
 * @param {number} tj
 * @param {{ ti: number; tj: number }[]} buildingTiles
 */
function treeFootprintCellTooCloseToBuildings(ti, tj, buildingTiles) {
  for (const b of buildingTiles) {
    if (Math.max(Math.abs(ti - b.ti), Math.abs(tj - b.tj)) <= TREE_REGROW_BUILDING_BUFFER_TILES) {
      return true;
    }
  }
  return false;
}

/**
 * Все клетки отпечатка свободны, в мире, не в запретной зоне замка, не рядом с зданиями,
 * не под рыцарями.
 *
 * @param {Map<string, import('../engine/state/cell.js').Cell>} state
 * @param {{ ti: number; tj: number }[]} buildingTiles
 * @param {Set<string>} knightOccupiedTileKeys ключи `${cx}:${cy}` тайлов под рыцарями
 */
function canPlaceTreeFootprint(
  state,
  worldWidthPx,
  worldHeightPx,
  buildingTiles,
  knightOccupiedTileKeys,
  x,
  y,
  tileData
) {
  if (x < 0 || y < 0 || x + tileData.width > worldWidthPx || y + tileData.height > worldHeightPx) {
    return false;
  }

  const cellsWide = tileData.width / TILE_SIZE;
  const cellsHigh = tileData.height / TILE_SIZE;

  for (let ix = 0; ix < cellsWide; ix++) {
    for (let iy = 0; iy < cellsHigh; iy++) {
      const cx = x + ix * TILE_SIZE;
      const cy = y + iy * TILE_SIZE;
      if (isInsideCastleNoTreeMargin(cx, cy)) {
        return false;
      }
      if (state.has(`${cx}:${cy}`)) {
        return false;
      }
      if (knightOccupiedTileKeys.has(`${cx}:${cy}`)) {
        return false;
      }
      const ti = Math.floor(cx / TILE_SIZE);
      const tj = Math.floor(cy / TILE_SIZE);
      if (treeFootprintCellTooCloseToBuildings(ti, tj, buildingTiles)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Перемешать копию массива на месте (Fisher–Yates).
 *
 * @template T
 * @param {T[]} arr
 */
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Random.getRandomFromRange(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Одно новое дерево рядом с существующим; если не удалось — false.
 *
 * @param {import('../engine/state/state-manager.js').StateManager} stateManager
 * @param {number} worldWidthPx
 * @param {number} worldHeightPx
 * @param {Set<string>} knightOccupiedTileKeys тайлы под рыцарями — деревья там не появляются
 * @returns {boolean}
 */
export function tryRegrowOneTree(stateManager, worldWidthPx, worldHeightPx, knightOccupiedTileKeys) {
  const state = stateManager.getState();
  const buildingTiles = collectBuildingTileCoords(state);

  /** Все клетки леса — чтобы требовать соприкосновение по тайлу (Чебышёв = 1), а не «в двух шагах». */
  const forestTiles = collectAllTreeTileIndices(state);

  if (forestTiles.length === 0) {
    return false;
  }

  const ring = maxTreeFootprintTiles() + 1;

  const seen = new Set();
  /** @type {{ nx: number; ny: number }[]} */
  const candidates = [];

  for (const ft of forestTiles) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        const nti = ft.ti + dx;
        const ntj = ft.tj + dy;
        const nx = nti * TILE_SIZE;
        const ny = ntj * TILE_SIZE;
        const key = `${nx}:${ny}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        candidates.push({ nx, ny });
      }
    }
  }

  shuffleInPlace(candidates);

  const treeKeys = TreesGenerator.getTreeTileKeys();
  const keysShuffled = [...treeKeys];
  shuffleInPlace(keysShuffled);

  for (const { nx, ny } of candidates) {
    for (const tileKey of keysShuffled) {
      const tileData = tiles[tileKey];
      if (!tileData) {
        continue;
      }
      if (
        !canPlaceTreeFootprint(
          state,
          worldWidthPx,
          worldHeightPx,
          buildingTiles,
          knightOccupiedTileKeys,
          nx,
          ny,
          tileData
        )
      ) {
        continue;
      }
      const newTiles = footprintTileIndices(nx, ny, tileData);
      if (minChebyshevToForest(newTiles, forestTiles) !== 1) {
        continue;
      }
      const entity = new Tree({ treeType: tileData.type });
      stateManager.setCell({ x: nx, y: ny, tileData, entity });
      return true;
    }
  }

  return false;
}
