import { isTreeSpriteType } from '../common/grid-path.js';
import { drawStructureHpBar } from '../common/structure-hp-bar.js';
import { drawCastleFlagsFromTilemap } from '../game/atmosphere/castle-flags.js';
import { drawExteriorForest } from '../game/atmosphere/exterior-forest.js';
import { BACKGROUND_COLOR, SELECTOR_COLOR } from '../constants/colors.js';
import {
  PLAYER_BUILDING_TRIANGLE_GAP_PX,
  PLAYER_BUILDING_TRIANGLE_HALF_BASE_PX,
  PLAYER_BUILDING_TRIANGLE_HEIGHT_PX,
  PLAYER_INDICATOR_COLOR,
  SHOW_PLAYER_COLOR_TRIANGLE_ABOVE_OWNED_BUILDINGS,
} from '../constants/player-building-indicator.js';
import { SELECTOR_LINE_WIDTH, TILE_SIZE } from '../constants/sizes.js';
import {
  KNIGHT_FRAME_IDLE,
  KNIGHT_SPRITE_HEIGHT,
  KNIGHT_SPRITE_WIDTH,
} from '../constants/knight-atlas.js';
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
   * Декоративный лес за пределами карты (видимая часть), чтобы скролл "за край"
   * не выглядел пустым. Чисто визуально, в состояние мира не пишет.
   *
   * @param {{
   *   scrollOffset: { offsetX: number; offsetY: number };
   *   worldWidthPx: number;
   *   worldHeightPx: number;
   * }} param
   */
  drawExteriorForest({ scrollOffset: { offsetX, offsetY }, worldWidthPx, worldHeightPx }) {
    drawExteriorForest(this.ctx, this.tileMap, {
      offsetX,
      offsetY,
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      worldWidthPx,
      worldHeightPx,
    });
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
   * @param {{ tx: number; ty: number; width?: number; height?: number; color?: string }} param
   */
  drawSelector({ tx, ty, width = TILE_SIZE, height = TILE_SIZE, color = SELECTOR_COLOR }) {
    this.ctx.lineWidth = SELECTOR_LINE_WIDTH;
    this.ctx.strokeStyle = color;

    this.ctx.strokeRect(tx, ty, width, height);
  }

  /**
   * Полупрозрачная проекция под курсором — показывает, куда встанет объект.
   * Здание привязано к клетке (`tx`/`ty` — левый верхний угол клетки, экранные координаты).
   * Рыцарь не привязан к клетке и рисуется по центру курсора (`x`/`y` — экранные координаты курсора).
   *
   * @param {{
   *   tx?: number;
   *   ty?: number;
   *   x?: number;
   *   y?: number;
   *   tile?: { mapX: number; mapY: number; width: number; height: number } | null;
   *   knightImage?: CanvasImageSource | null;
   * }} param
   */
  drawPlacementGhost({ tx = 0, ty = 0, x = 0, y = 0, tile = null, knightImage = null }) {
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.6;

    if (knightImage) {
      const gx = Math.round(x - KNIGHT_SPRITE_WIDTH / 2);
      const gy = Math.round(y - KNIGHT_SPRITE_HEIGHT / 2);
      ctx.drawImage(
        knightImage,
        KNIGHT_FRAME_IDLE.sx,
        KNIGHT_FRAME_IDLE.sy,
        KNIGHT_FRAME_IDLE.sw,
        KNIGHT_FRAME_IDLE.sh,
        gx,
        gy,
        KNIGHT_SPRITE_WIDTH,
        KNIGHT_SPRITE_HEIGHT,
      );
    } else if (tile) {
      ctx.drawImage(
        this.tileMap,
        tile.mapX,
        tile.mapY,
        tile.width,
        tile.height,
        tx,
        ty,
        tile.width,
        tile.height,
      );
    }

    ctx.restore();
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

    if (cell.spriteType !== 'castle') {
      sprite.drawPostEffects(this.ctx, this.tileMap, performance.now(), cell);
    }

    const ent = cell.entity;
    if (cell.isRenderable && ent && typeof ent.hp === 'number' && typeof ent.maxHp === 'number') {
      drawStructureHpBar(this.ctx, {
        spriteLeft: x,
        spriteTop: y,
        spriteWidth: tileData.width,
        hp: ent.hp,
        maxHp: ent.maxHp,
        lastDamagedAtMs: typeof ent.lastDamagedAtMs === 'number' ? ent.lastDamagedAtMs : 0,
      });
    }

  }

  /**
   * Перерисовывает деревья над клетками, занятыми рыцарями, чтобы рыцарь визуально проходил позади дерева.
   *
   * @param {{
   *   state: Map<string, Cell>;
   *   scrollOffset: { offsetX: number; offsetY: number };
   *   occupiedTileKeys: Set<string>;
   * }}
   */
  drawTreesAboveKnights({ state, scrollOffset: { offsetX, offsetY }, occupiedTileKeys }) {
    if (!occupiedTileKeys || occupiedTileKeys.size === 0) return;
    for (const key of occupiedTileKeys) {
      const cell = state.get(key);
      if (!cell || !cell.isRenderable || !isTreeSpriteType(cell.spriteType)) continue;
      const [tx, ty] = key.split(':');
      this.drawCell({
        x: Number(tx) + offsetX,
        y: Number(ty) + offsetY,
        cell,
        showPlayerIndicators: false,
        localPlayerUserId: null,
      });
    }
  }

  /**
   * Флаги замков — поверх всего мира (после снега и рыцарей).
   *
   * @param {{
   *   state: Map<string, Cell>;
   *   scrollOffset: { offsetX: number; offsetY: number };
   *   timeMs?: number;
   * }}
   */
  drawCastleFlagsOnTop({ state, scrollOffset: { offsetX, offsetY }, timeMs = performance.now() }) {
    for (const [cords, cell] of state.entries()) {
      if (!cell.isRenderable || cell.spriteType !== 'castle') {
        continue;
      }
      const [wx, wy] = cords.split(':').map(Number);
      drawCastleFlagsFromTilemap(
        this.ctx,
        this.tileMap,
        wx + offsetX,
        wy + offsetY,
        timeMs,
        cell.ownerUserId,
      );
    }
  }

  /**
   * Треугольники над своими зданиями — самый верхний слой (после флагов).
   *
   * @param {{
   *   state: Map<string, Cell>;
   *   scrollOffset: { offsetX: number; offsetY: number };
   *   showPlayerIndicators: boolean;
   *   localPlayerUserId: string | null;
   * }}
   */
  drawPlayerBuildingTrianglesOnTop({
    state,
    scrollOffset: { offsetX, offsetY },
    showPlayerIndicators,
    localPlayerUserId,
  }) {
    if (!showPlayerIndicators || !SHOW_PLAYER_COLOR_TRIANGLE_ABOVE_OWNED_BUILDINGS || !localPlayerUserId) {
      return;
    }

    for (const [cords, cell] of state.entries()) {
      if (!cell.isRenderable) {
        continue;
      }
      if (
        !cell.ownerUserId ||
        cell.ownerUserId !== localPlayerUserId ||
        isTreeSpriteType(cell.spriteType) ||
        cell.spriteType === 'knight'
      ) {
        continue;
      }

      const tileData = tiles[cell.spriteType];
      if (!tileData) {
        continue;
      }

      const [wx, wy] = cords.split(':').map(Number);
      this.#drawPlayerColorTriangleAboveBuilding({
        x: wx + offsetX,
        y: wy + offsetY,
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
