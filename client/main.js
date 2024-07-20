import { CanvasRenderer } from './engine/canvas-renderer.js';
import { Controls } from './engine/controls.js';
import { GameLoop } from './engine/game-loop.js';
import { Game } from './game/game.js';

const canvas = document.getElementById('c');

//Load tile map then start game init
const tileMap = new Image();
tileMap.src = 'assets/tilemap.png';
tileMap.onload = main;

function main() {
  const renderer = new CanvasRenderer({ canvas, tileMap });
  const controls = new Controls({ canvas });

  controls.init();

  const game = new Game({ renderer, controls });

  const gameLoop = new GameLoop({ game });

  gameLoop.start();
}
