import { TILE_SIZE } from './sizes.js';

export const WORLD_WIDTH_TILES = 64;
export const WORLD_HEIGHT_TILES = 64;

export const WORLD_WIDTH_PX = WORLD_WIDTH_TILES * TILE_SIZE;
export const WORLD_HEIGHT_PX = WORLD_HEIGHT_TILES * TILE_SIZE;
export const WORLD_OUTER_RING_TILES = 1;

export const WORLD_BORDER_COLOR = '#707a3a';
export const WORLD_BORDER_INNER_WIDTH = 1;
export const WORLD_BORDER_OUTER_WIDTH = 2;

/**
 * Сколько пикселей мира минимум оставляем видимыми при прокрутке "за край",
 * чтобы игрок всегда видел границу и не терялся в пустоте.
 */
export const WORLD_MIN_VISIBLE_EDGE_PX = TILE_SIZE;
