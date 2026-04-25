import { SNOW_COLOR } from '../../constants/colors.js';

/**
 * Декоративный снег в координатах мира (как клетки в StateManager), на экране — плюс scrollOffset.
 * Каждая снежинка — ровно 1 пиксель.
 */
export class SnowOverlay {
  /**
   * @param {{ width: number; height: number; flakeCount?: number }} opts
   */
  constructor({ width, height, flakeCount = 110 }) {
    this.w = width;
    this.h = height;
    this.flakes = [];
    const scroll0 = { offsetX: 0, offsetY: 0 };
    for (let i = 0; i < flakeCount; i++) {
      this.flakes.push(this.#spawn(true, scroll0));
    }
  }

  /**
   * Левый верхний угол мира, видимого в кадре (как у `drawState`: экран = мир + offset).
   *
   * @param {{ offsetX: number; offsetY: number }} scroll
   * @returns {{ left: number; top: number }}
   */
  #visibleOrigin(scroll) {
    return { left: -scroll.offsetX, top: -scroll.offsetY };
  }

  /**
   * @param {boolean} scatterY
   * @param {{ offsetX: number; offsetY: number }} scroll
   */
  #spawn(scatterY, scroll) {
    const { left, top } = this.#visibleOrigin(scroll);
    const groundY = top + Math.floor(Math.random() * this.h);
    return {
      x: left + Math.random() * this.w,
      y: scatterY ? top + Math.random() * this.h : top - 2 - Math.random() * 50,
      groundY,
      vy: 45 + Math.random() * 95,
      vx: (Math.random() - 0.5) * 28,
      phase: Math.random() * Math.PI * 2,
      mode: /** @type {'falling' | 'settled'} */ ('falling'),
      settleEndMs: 0,
    };
  }

  /**
   * @param {{ x: number; y: number }} f
   * @param {{ offsetX: number; offsetY: number }} scroll
   */
  #isOutsideCameraView(f, scroll) {
    const m = 120;
    const { left, top } = this.#visibleOrigin(scroll);
    const right = left + this.w;
    const bottom = top + this.h;
    return (
      f.x < left - m ||
      f.x > right + m ||
      f.y < top - m - 80 ||
      f.y > bottom + m
    );
  }

  /**
   * Падение ушло за пределы видимой области камеры — переспавн из неба в текущем кадре.
   *
   * @param {{ offsetX: number; offsetY: number }} scroll
   */
  #recenterIfOffCamera(f, scroll) {
    if (this.#isOutsideCameraView(f, scroll)) {
      Object.assign(f, this.#spawn(false, scroll));
    }
  }

  /**
   * @param {number} dtMs
   * @param {{ offsetX: number; offsetY: number }} scrollOffset
   */
  update(dtMs, scrollOffset) {
    const now = performance.now();
    const sec = dtMs / 1000;
    const { left } = this.#visibleOrigin(scrollOffset);
    const band = this.w + 6;

    for (const f of this.flakes) {
      if (f.mode === 'settled') {
        if (now >= f.settleEndMs || this.#isOutsideCameraView(f, scrollOffset)) {
          Object.assign(f, this.#spawn(false, scrollOffset));
        }
        continue;
      }

      f.phase += dtMs * 0.0018;
      f.x += (f.vx + Math.sin(f.phase) * 18) * sec;
      f.y += f.vy * sec;

      let rel = f.x - left;
      while (rel < -3) {
        f.x += band;
        rel = f.x - left;
      }
      while (rel > this.w + 3) {
        f.x -= band;
        rel = f.x - left;
      }

      this.#recenterIfOffCamera(f, scrollOffset);

      if (f.y >= f.groundY) {
        f.y = f.groundY;
        if (Math.random() < 0.32) {
          f.mode = 'settled';
          f.vy = 0;
          f.vx = 0;
          f.settleEndMs = now + 1800 + Math.random() * 4200;
        } else {
          Object.assign(f, this.#spawn(false, scrollOffset));
        }
      }
    }
  }

  /**
   * Те же смещения, что у `drawState`: мир + offset = экран.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ offsetX: number; offsetY: number }} scrollOffset
   */
  render(ctx, scrollOffset) {
    const now = performance.now();
    const { offsetX, offsetY } = scrollOffset;

    ctx.save();
    ctx.fillStyle = SNOW_COLOR;

    for (const f of this.flakes) {
      const x = Math.floor(f.x + offsetX);
      const y = Math.floor(f.y + offsetY);

      if (f.mode === 'settled') {
        const left = f.settleEndMs - now;
        ctx.globalAlpha = left < 550 ? Math.max(0, left / 550) : 1;
      } else {
        ctx.globalAlpha = 1;
      }

      ctx.fillRect(x, y, 1, 1);
    }

    ctx.restore();
  }
}
