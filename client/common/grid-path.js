import { TILE_SIZE } from '../constants/sizes.js';

/**
 * @param {string} spriteType
 * @returns {boolean}
 */
export function isTreeSpriteType(spriteType) {
  const type = spriteType.toLowerCase();
  return type.includes('tree') || type.includes('spruce');
}

/**
 * Клетка проходима: нет занятой клетки в state (пустой мир / фон).
 * Деревья и здания блокируют.
 *
 * @param {import('../engine/state/cell.js').Cell | undefined} cell
 * @returns {boolean}
 */
export function isWalkableCell(cell) {
  if (!cell) {
    return true;
  }
  if (isTreeSpriteType(cell.spriteType)) {
    return false;
  }
  return false;
}

/**
 * @param {Map<string, import('../engine/state/cell.js').Cell>} stateMap
 * @param {number} px
 * @param {number} py
 * @param {number} worldWidthPx
 * @param {number} worldHeightPx
 * @returns {boolean}
 */
export function isWalkableTile(stateMap, px, py, worldWidthPx, worldHeightPx) {
  if (px < 0 || py < 0 || px >= worldWidthPx || py >= worldHeightPx) {
    return false;
  }
  if (px % TILE_SIZE !== 0 || py % TILE_SIZE !== 0) {
    return false;
  }
  const cell = stateMap.get(`${px}:${py}`);
  return isWalkableCell(cell);
}

/**
 * Проходима ли клетка под произвольной точкой мира (по полу тайла).
 *
 * @param {Map<string, import('../engine/state/cell.js').Cell>} stateMap
 * @param {number} wx
 * @param {number} wy
 * @param {number} worldWidthPx
 * @param {number} worldHeightPx
 * @returns {boolean}
 */
export function isWalkableAtWorldPx(stateMap, wx, wy, worldWidthPx, worldHeightPx) {
  if (wx < 0 || wy < 0 || wx >= worldWidthPx || wy >= worldHeightPx) {
    return false;
  }
  const tx = Math.floor(wx / TILE_SIZE) * TILE_SIZE;
  const ty = Math.floor(wy / TILE_SIZE) * TILE_SIZE;
  return isWalkableTile(stateMap, tx, ty, worldWidthPx, worldHeightPx);
}

const STRAIGHT_WALK_SAMPLE_PX = 4;

/**
 * Прямой отрезок между двумя точками проходит только по проходимым тайлам (сэмплы по линии).
 *
 * @param {Map<string, import('../engine/state/cell.js').Cell>} stateMap
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @param {number} worldWidthPx
 * @param {number} worldHeightPx
 * @returns {boolean}
 */
export function hasStraightWalk(stateMap, ax, ay, bx, by, worldWidthPx, worldHeightPx) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return isWalkableAtWorldPx(stateMap, ax, ay, worldWidthPx, worldHeightPx);
  }
  const n = Math.max(1, Math.ceil(len / STRAIGHT_WALK_SAMPLE_PX));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + dx * t;
    const y = ay + dy * t;
    if (!isWalkableAtWorldPx(stateMap, x, y, worldWidthPx, worldHeightPx)) {
      return false;
    }
  }
  return true;
}

/**
 * A* (4-соседи), координаты — левый верх тайла в пикселях мира.
 *
 * @param {Map<string, import('../engine/state/cell.js').Cell>} stateMap
 * @param {{ x: number; y: number }} startWorld
 * @param {{ x: number; y: number }} goalWorld
 * @param {number} worldWidthPx
 * @param {number} worldHeightPx
 * @returns {{ x: number; y: number }[] | null} шаги без стартовой клетки; [] если цель = старт; null если нет пути
 */
export function findPathTiles(stateMap, startWorld, goalWorld, worldWidthPx, worldHeightPx) {
  const sx = Math.floor(startWorld.x / TILE_SIZE) * TILE_SIZE;
  const sy = Math.floor(startWorld.y / TILE_SIZE) * TILE_SIZE;
  const gx = Math.floor(goalWorld.x / TILE_SIZE) * TILE_SIZE;
  const gy = Math.floor(goalWorld.y / TILE_SIZE) * TILE_SIZE;

  if (!isWalkableTile(stateMap, gx, gy, worldWidthPx, worldHeightPx)) {
    return null;
  }

  if (sx === gx && sy === gy) {
    return [];
  }

  if (!isWalkableTile(stateMap, sx, sy, worldWidthPx, worldHeightPx)) {
    return null;
  }

  const key = (x, y) => `${x}:${y}`;
  const heuristic = (x, y) => (Math.abs(x - gx) + Math.abs(y - gy)) / TILE_SIZE;

  /** @type {Map<string, { x: number; y: number; g: number; f: number }>} */
  const open = new Map();
  /** @type {Map<string, string | null>} */
  const cameFrom = new Map();
  /** @type {Set<string>} */
  const closed = new Set();

  const startKey = key(sx, sy);
  open.set(startKey, { x: sx, y: sy, g: 0, f: heuristic(sx, sy) });
  cameFrom.set(startKey, null);

  const dirs = [
    { dx: TILE_SIZE, dy: 0 },
    { dx: -TILE_SIZE, dy: 0 },
    { dx: 0, dy: TILE_SIZE },
    { dx: 0, dy: -TILE_SIZE },
  ];

  let expanded = 0;
  const maxExpand = 5000;

  while (open.size > 0 && expanded < maxExpand) {
    let bestKey = null;
    let bestF = Infinity;
    for (const [k, node] of open.entries()) {
      if (node.f < bestF) {
        bestF = node.f;
        bestKey = k;
      }
    }
    if (bestKey === null) {
      break;
    }

    const current = open.get(bestKey);
    open.delete(bestKey);
    if (!current) {
      break;
    }
    closed.add(bestKey);
    expanded++;

    if (current.x === gx && current.y === gy) {
      return buildPathFrom(bestKey, cameFrom, startKey);
    }

    for (const { dx, dy } of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nk = key(nx, ny);
      if (closed.has(nk)) {
        continue;
      }
      if (!isWalkableTile(stateMap, nx, ny, worldWidthPx, worldHeightPx)) {
        continue;
      }

      const tentativeG = current.g + 1;
      const existing = open.get(nk);
      if (!existing || tentativeG < existing.g) {
        cameFrom.set(nk, bestKey);
        open.set(nk, {
          x: nx,
          y: ny,
          g: tentativeG,
          f: tentativeG + heuristic(nx, ny),
        });
      }
    }
  }

  return null;
}

/**
 * @param {string} goalKey
 * @param {Map<string, string | null>} cameFrom
 * @param {string} startKey
 * @returns {{ x: number; y: number }[]}
 */
function buildPathFrom(goalKey, cameFrom, startKey) {
  /** @type {{ x: number; y: number }[]} */
  const rev = [];
  let cur = goalKey;
  let guard = 0;
  while (cur !== startKey && guard < 512) {
    const [x, y] = cur.split(':').map(Number);
    rev.push({ x, y });
    const parent = cameFrom.get(cur);
    if (parent === undefined || parent === null) {
      break;
    }
    cur = parent;
    guard++;
  }
  rev.reverse();
  return rev;
}

/**
 * Соседние клетки (левый верх тайла), граничащие с клеткой дерева.
 *
 * @param {number} treePx
 * @param {number} treePy
 * @returns {{ x: number; y: number }[]}
 */
export function neighborStandTilesForTree(treePx, treePy) {
  return [
    { x: treePx - TILE_SIZE, y: treePy },
    { x: treePx + TILE_SIZE, y: treePy },
    { x: treePx, y: treePy - TILE_SIZE },
    { x: treePx, y: treePy + TILE_SIZE },
  ];
}
