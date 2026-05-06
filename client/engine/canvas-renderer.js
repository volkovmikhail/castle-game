import { isTreeSpriteType } from '../common/grid-path.js';
import { BACKGROUND_COLOR, SELECTOR_COLOR } from '../constants/colors.js';
import {
  PLAYER_BUILDING_TRIANGLE_GAP_PX,
  PLAYER_BUILDING_TRIANGLE_HALF_BASE_PX,
  PLAYER_BUILDING_TRIANGLE_HEIGHT_PX,
  PLAYER_INDICATOR_COLOR,
  SHOW_PLAYER_COLOR_TRIANGLE_ABOVE_OWNED_BUILDINGS,
} from '../constants/player-building-indicator.js';
import { SELECTOR_LINE_WIDTH, TILE_SIZE } from '../constants/sizes.js';
import { tiles } from '../constants/tiles.js';
import {
  WORLD_BORDER_COLOR,
  WORLD_BORDER_INNER_WIDTH,
  WORLD_BORDER_OUTER_WIDTH,
} from '../constants/world.js';
import { Sprite } from './sprite.js';
import { Cell } from './state/cell.js';

export class CanvasRenderer {
  constructor({ canvas, tileMap }) {
    this.tileMap = tileMap;

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /**
   * @returns {{ width: number; height: number; }}
   */
  getRendererSize() {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }

  clear() {
    this.ctx.fillStyle = BACKGROUND_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Description placeholder
   * @typedef {import('./sprite.js').Sprite} Sprite
   * @param {Sprite[]} sprites
   */
  drawSprites(sprites) {
    for (const sprite of sprites) {
      drawSprite(sprite);
    }
  }

  /**
   * Description placeholder
   * @param {Sprite} sprite
   */
  drawSprite(sprite) {
    const tileData = sprite.getTileData();
    const spritePosition = sprite.getPos();

    this.ctx.drawImage(
      this.tileMap,
      tileData.mapX,
      tileData.mapY,
      tileData.width,
      tileData.height,
      spritePosition.x, //pos x
      spritePosition.y, //pos y
      tileData.width, //width on canvas
      tileData.height //height on canvas
    );
  }

  /**
   * @param {{ tx: number; ty: number; width?: number; height?: number }} param
   */
  drawSelector({ tx, ty, width = TILE_SIZE, height = TILE_SIZE }) {
    this.ctx.lineWidth = SELECTOR_LINE_WIDTH;
    this.ctx.strokeStyle = SELECTOR_COLOR;

    this.ctx.strokeRect(tx, ty, width, height);
  }

  /**
   * @param {{
   *   state: Map<string, Cell>;
   *   scrollOffset: {offsetX: number, offsetY: number};
   *   showPlayerIndicators?: boolean;
   *   localPlayerUserId?: string;
   * }}
   */
  drawState({ state, scrollOffset: { offsetX, offsetY }, showPlayerIndicators = false, localPlayerUserId = null }) {
    for (const [cords, cell] of state.entries()) {
      if (cell.isRenderable) {
        let [x, y] = cords.split(':');

        x = Number(x) + offsetX;
        y = Number(y) + offsetY;

        this.drawCell({ x, y, cell, showPlayerIndicators, localPlayerUserId });
      }
    }
  }

  /**
   * @param {{ x: number; y: number; cell: Cell; showPlayerIndicators: boolean; localPlayerUserId: string | null; }}
   */
  drawCell({ x, y, cell, showPlayerIndicators, localPlayerUserId }) {
    const tileData = tiles[cell.spriteType];

    const sprite = new Sprite(tileData);

    sprite.setPos({ x, y });

    this.drawSprite(sprite);

    sprite.drawPostEffects(this.ctx, this.tileMap, performance.now(), cell);

    if (
      showPlayerIndicators &&
      SHOW_PLAYER_COLOR_TRIANGLE_ABOVE_OWNED_BUILDINGS &&
      cell.ownerUserId &&
      cell.ownerUserId === localPlayerUserId &&
      !isTreeSpriteType(cell.spriteType) &&
      cell.spriteType !== 'knight'
    ) {
      this.#drawPlayerColorTriangleAboveBuilding({
        x,
        y,
        width: tileData.width,
        color: PLAYER_INDICATOR_COLOR,
      });
    }
  }

  /**
   * Остриё вниз к зданию, широкое основание выше.
   *
   * @param {{ x: number; y: number; width: number; color: string }} param0
   */
  #drawPlayerColorTriangleAboveBuilding({ x, y, width, color }) {
    const cx = Math.round(x + width / 2);
    const tipY = Math.round(y - PLAYER_BUILDING_TRIANGLE_GAP_PX);
    const topY = tipY - PLAYER_BUILDING_TRIANGLE_HEIGHT_PX;
    const hb = PLAYER_BUILDING_TRIANGLE_HALF_BASE_PX;

    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 1;

    // Draw by integer pixel rows to avoid anti-aliased edges.
    for (let row = 0; row <= PLAYER_BUILDING_TRIANGLE_HEIGHT_PX; row += 1) {
      const rowY = topY + row;
      const halfWidth = Math.floor((hb * (PLAYER_BUILDING_TRIANGLE_HEIGHT_PX - row)) / PLAYER_BUILDING_TRIANGLE_HEIGHT_PX);
      const rowX = cx - halfWidth;
      const rowWidth = halfWidth * 2 + 1;
      ctx.fillRect(rowX, rowY, rowWidth, 1);
    }

    ctx.restore();
  }

  /**
   * @param {{
   *   scrollOffset: { offsetX: number; offsetY: number };
   *   x: number;
   *   y: number;
   *   width: number;
   *   height: number;
   * }} param0
   */
  drawWorldBorder({ scrollOffset: { offsetX, offsetY }, x, y, width, height }) {
    const worldX = x + offsetX;
    const worldY = y + offsetY;
    const fenceThickness = Math.max(WORLD_BORDER_INNER_WIDTH, WORLD_BORDER_OUTER_WIDTH);

    this.ctx.save();
    this.ctx.fillStyle = WORLD_BORDER_COLOR;

    // Рисуем забор в "внешней" клетке: он примыкает к границе мира,
    // но не перекрывает последнюю игровую клетку.
    this.ctx.fillRect(worldX, worldY - fenceThickness, width, fenceThickness);
    this.ctx.fillRect(worldX, worldY + height, width, fenceThickness);
    this.ctx.fillRect(worldX - fenceThickness, worldY - fenceThickness, fenceThickness, height + fenceThickness * 2);
    this.ctx.fillRect(worldX + width, worldY - fenceThickness, fenceThickness, height + fenceThickness * 2);
    this.ctx.restore();
  }
}
