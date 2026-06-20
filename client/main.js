import { CanvasRenderer } from './engine/canvas-renderer.js';
import { Controls } from './engine/controls.js';
import { GameLoop } from './engine/game-loop.js';
import { StateManager } from './engine/state/state-manager.js';
import { Game } from './game/game.js';
import { attachCanvasResize, syncCanvasSize } from './ui/canvas-resize.js';
import { UI } from './ui/ui.js';
import { Network } from './net/network.js';
import { Lobby } from './ui/lobby.js';
import { PLAYER_PROFILES } from './constants/players.js';

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

/**
 * Слот, назначенный сервером, -> профиль игрока (по userId). Идентичности
 * совпадают со server/constants/slots.js, поэтому рендер/команды работают.
 *
 * @param {{ userId: string }} you
 */
function resolveLocalPlayer(you) {
  return PLAYER_PROFILES.find((p) => p.userId === you.userId) ?? PLAYER_PROFILES[0];
}

async function boot() {
  const [tileMap, knightImage] = await Promise.all([
    loadImage('assets/tilemap.png'),
    loadImage('assets/knight-colored.png'),
  ]);

  const network = new Network();
  const lobby = new Lobby({ network });

  // Ждём, пока хост стартует партию; сервер пришлёт наш слот.
  const startPayload = await lobby.waitForGameStart();
  const localPlayer = resolveLocalPlayer(startPayload.you);

  setupGameOverOverlay(network);
  startGame({ tileMap, knightImage, localPlayer, network });
}

/**
 * @param {{
 *   tileMap: HTMLImageElement,
 *   knightImage: HTMLImageElement,
 *   localPlayer: typeof PLAYER_PROFILES[number],
 *   network: Network,
 * }} opts
 */
function startGame({ tileMap, knightImage, localPlayer, network }) {
  if (canvasStage) {
    syncCanvasSize({ canvas, stage: canvasStage });
  }

  const renderer = new CanvasRenderer({ canvas, tileMap });
  const controls = new Controls({ canvas });
  const stateManager = new StateManager();
  const ui = new UI();

  controls.init();

  const game = new Game({ renderer, controls, stateManager, ui, knightImage, localPlayer, network });

  game.init();

  // Сервер авторитетен: его снапшоты — единственный источник мира. Клиент рендерит
  // их, а ввод уходит намерениями (см. Game.#handleNetworkedInput).
  network.onSnapshot((snap) => game.pushSnapshot(snap));

  if (canvasStage) {
    attachCanvasResize({ canvas, stage: canvasStage, game });
  }

  const gameLoop = new GameLoop({ game });
  gameLoop.start();
}

/** @param {Network} network */
function setupGameOverOverlay(network) {
  const overlay = document.getElementById('game-over');
  const text = document.getElementById('game-over-text');
  const back = document.getElementById('game-over-back');
  if (!overlay || !text || !back) {
    return;
  }
  network.onGameOver((data) => {
    text.textContent = data?.winner
      ? `Winner: ${data.winner.name}`
      : 'No winner.';
    overlay.hidden = false;
  });
  back.addEventListener('click', () => window.location.reload());
}

boot().catch((err) => {
  console.error(err);
});
