import { SNOW_COLOR } from '../../constants/colors.js';

/**
 * Декоративный снег в координатах канваса (вид сверху: «земля» — случайная Y на поле).
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
    for (let i = 0; i < flakeCount; i++) {
      this.flakes.push(this.#spawn(true));
    }
  }

  /**
   * Случайная «высота» снега на поле (координата Y в системе канваса).
   */
  #randomGroundY() {
    return Math.floor(Math.random() * this.h);
  }

  /**
   * @param {boolean} scatterY
   */
  #spawn(scatterY) {
    const groundY = this.#randomGroundY();
    return {
      x: Math.random() * this.w,
      y: scatterY ? Math.random() * this.h : -2 - Math.random() * 50,
      groundY,
      vy: 45 + Math.random() * 95,
      vx: (Math.random() - 0.5) * 28,
      phase: Math.random() * Math.PI * 2,
      mode: /** @type {'falling' | 'settled'} */ ('falling'),
      settleEndMs: 0,
    };
  }

  /**
   * @param {number} dtMs
   */
  update(dtMs) {
    const now = performance.now();
    const sec = dtMs / 1000;

    for (const f of this.flakes) {
      if (f.mode === 'settled') {
        if (now >= f.settleEndMs) {
          Object.assign(f, this.#spawn(false));
        }
        continue;
      }

      f.phase += dtMs * 0.0018;
      f.x += (f.vx + Math.sin(f.phase) * 18) * sec;
      f.y += f.vy * sec;

      if (f.x < -3) {
        f.x += this.w + 6;
      }
      if (f.x > this.w + 3) {
        f.x -= this.w + 6;
      }

      if (f.y >= f.groundY) {
        f.y = f.groundY;
        if (Math.random() < 0.32) {
          f.mode = 'settled';
          f.vy = 0;
          f.vx = 0;
          f.settleEndMs = now + 1800 + Math.random() * 4200;
        } else {
          Object.assign(f, this.#spawn(false));
        }
      }
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    const now = performance.now();

    ctx.save();
    ctx.fillStyle = SNOW_COLOR;

    for (const f of this.flakes) {
      const x = Math.floor(f.x);
      const y = Math.floor(f.y);

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
