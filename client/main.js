import { CanvasRenderer } from './engine/canvas-renderer.js';
import { Controls } from './engine/controls.js';
import { GameLoop } from './engine/game-loop.js';
import { StateManager } from './engine/state/state-manager.js';
import { Game } from './game/game.js';
import { attachCanvasResize, syncCanvasSize } from './ui/canvas-resize.js';
import { UI } from './ui/ui.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
const canvasStage = document.querySelector('.canvas-stage');

//Load tile map then start game init
const tileMap = new Image();
tileMap.src = 'assets/tilemap.png';
tileMap.onload = main;

function main() {
  if (canvasStage) {
    syncCanvasSize({ canvas, stage: canvasStage });
  }

  const renderer = new CanvasRenderer({ canvas, tileMap });
  const controls = new Controls({ canvas });
  const stateManager = new StateManager();
  const ui = new UI();

  controls.init();

  const game = new Game({ renderer, controls, stateManager, ui });

  game.init();

  if (canvasStage) {
    attachCanvasResize({ canvas, stage: canvasStage, game });
  }

  const gameLoop = new GameLoop({ game });

  gameLoop.start();
}
