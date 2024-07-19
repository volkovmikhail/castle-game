import { CanvasRenderer } from './classes/canvas-renderer.js';
import { GameLoop } from './classes/game-loop.js';
import { Game } from './classes/game.js';

const canvas = document.getElementById('c');

//Load tile map then start game init
const tileMap = new Image();
tileMap.src = 'assets/tilemap.png';
tileMap.onload = main;

function main() {
  const renderer = new CanvasRenderer({ canvas, tileMap });

  const game = new Game({ renderer });

  const gameLoop = new GameLoop({ game });

  gameLoop.start();
}
