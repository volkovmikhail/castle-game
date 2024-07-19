export class GameLoop {
  /**
   * Description placeholder
   * @typedef {import('./game.js').Game} Game
   * @param {{game: Game}} options
   */
  constructor({ game }) {
    this.lastFrameTime = 0;
    this.accumulatedTime = 0;
    this.timeStep = 1000 / 60; // 60 frames per second

    this.game = game;

    this.rafId = null;
    this.isRunning = false;
  }

  loop = (timestamp) => {
    if (!this.isRunning) return;

    let deltaTime = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;

    this.accumulatedTime += deltaTime;

    while (this.accumulatedTime >= this.timeStep) {
      this.game.update(this.timeStep);
      this.accumulatedTime -= this.timeStep;
    }

    this.game.render();

    this.rafId = requestAnimationFrame(this.loop);
  };

  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.rafId = requestAnimationFrame(this.loop);
    }
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    this.isRunning = false;
  }
}
