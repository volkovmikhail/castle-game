import { CanvasRenderer } from './engine/canvas-renderer.js';
import { Controls } from './engine/controls.js';
import { GameLoop } from './engine/game-loop.js';
import { StateManager } from './engine/state/state-manager.js';
import { Game } from './game/game.js';
import { attachCanvasResize, syncCanvasSize } from './ui/canvas-resize.js';
import { UI } from './ui/ui.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
const canvasStage = document.querySelector('.canvas-stage');

/**
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

Promise.all([loadImage('assets/tilemap.png'), loadImage('assets/knight.png')])
  .then(([tileMap, knightImage]) => {
    startGame(tileMap, knightImage);
  })
  .catch((err) => {
    console.error(err);
  });

/**
 * @param {HTMLImageElement} tileMap
 * @param {HTMLImageElement} knightImage
 */
function startGame(tileMap, knightImage) {
  if (canvasStage) {
    syncCanvasSize({ canvas, stage: canvasStage });
  }

  const renderer = new CanvasRenderer({ canvas, tileMap });
  const controls = new Controls({ canvas });
  const stateManager = new StateManager();
  const ui = new UI();

  controls.init();

  const game = new Game({ renderer, controls, stateManager, ui, knightImage });

  game.init();

  if (canvasStage) {
    attachCanvasResize({ canvas, stage: canvasStage, game });
  }

  const gameLoop = new GameLoop({ game });

  gameLoop.start();
}
