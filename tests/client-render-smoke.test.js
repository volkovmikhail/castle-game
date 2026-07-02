/**
 * Headless smoke-тест клиентского рендера в сетевом режиме: настоящий снапшот из
 * WorldSim скармливаем клиентскому Game (mock canvas/controls/ui) и зовём render().
 * Ловит падения рендер-пути на «зеркальных» данных (например u.center у юнитов),
 * которые сетевые/протокольные тесты не видят. `node tests/client-render-smoke.test.js`.
 */

import assert from 'assert';
import { WorldSim } from '../server/game/world-sim.js';
import { PLAYER_SLOTS } from '../server/constants/slots.js';
import { CanvasRenderer } from '../client/engine/canvas-renderer.js';
import { StateManager } from '../client/engine/state/state-manager.js';
import { Game } from '../client/game/game.js';
import { PLAYER_PROFILES } from '../client/constants/players.js';

/** ctx-заглушка: любое свойство — вызываемый chainable-прокси, числа коэрсятся в 0. */
function makeCtx() {
  return new Proxy(function () {}, {
    get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : makeCtx()),
    apply: () => makeCtx(),
    set: () => true,
  });
}

function mockCanvas() {
  return {
    width: 800,
    height: 600,
    getContext: () => makeCtx(),
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
}

function mockControls() {
  return {
    init: () => {},
    setViewportSize: () => {},
    centerOn: () => {},
    updateKeyboardPan: () => {},
    getScrollOffset: () => ({ offsetX: 0, offsetY: 0 }),
    getSelectedCoords: () => ({ tx: 0, ty: 0, x: 0, y: 0 }),
    getHoveredStateCoords: () => null,
    isSpacePressed: () => false,
    isMovePressed: () => false,
    isDemolishPressed: () => false,
    setDemolishHover: () => {},
    getMarqueeDraftWorldRect: () => null,
    consumeRightClickWorld: () => null,
    consumeMarqueeSelectionWorldRect: () => null,
    consumeSelectAllKnightsRequest: () => false,
    consumeOpenShopRequest: () => false,
    consumeOpenForgeRequest: () => false,
    consumeOpenCastleRequest: () => false,
    consumeToggleTrainRequest: () => false,
    consumeToggleBuildRequest: () => false,
    consumeClearSelectionRequest: () => false,
    consumeJumpToCastleRequest: () => false,
    getClickedCoords: () => null,
  };
}

function mockUi() {
  return {
    setPlayerBadge: () => {},
    setResources: () => {},
    setStorageCaps: () => {},
    setKnightSlots: () => {},
    setKnightArmyLevels: () => {},
    getSelectedBuilding: () => null,
    showToast: () => {},
    exitBuildMode: () => {},
    openMarketShop: () => {},
    openKnightUpgrade: () => {},
  };
}

function run() {
  // Браузерные глобалы, которых нет в Node (оффскрин-канвас для тинта флагов).
  globalThis.document = { createElement: () => mockCanvas() };

  // 1. Реальный снапшот сервера: мир + замки + здание + рыцари.
  const slots = [PLAYER_SLOTS[0], PLAYER_SLOTS[1]];
  const world = new WorldSim({ seed: 5, slots });
  const yellow = PLAYER_SLOTS[0].userId;
  world.applyIntent(0, { type: 'placeBuilding', payload: { toolKey: 'market', tx: 96, ty: 80 } });
  world.knightSystem.spawn({ x: 96, y: 64, ownerUserId: yellow, healthLevel: 1, attackLevel: 1 });
  world.knightSystem.spawn({ x: 112, y: 64, ownerUserId: PLAYER_SLOTS[1].userId });
  const snap = world.collectSnapshot(0);
  assert.ok(snap.cells && snap.knights.length === 2, 'snapshot has cells and knights');
  // Покрываем кадры бега и удара + интерполяцию (второй снапшот со сдвигом).
  snap.knights[0].m = 'move';
  snap.knights[1].m = 'chop';

  // 2. Клиентский Game в сетевом режиме с заглушками окружения.
  const canvas = mockCanvas();
  const renderer = new CanvasRenderer({ canvas, tileMap: {} });
  const controls = mockControls();
  const stateManager = new StateManager();
  const ui = mockUi();
  const network = { onSnapshot: () => {}, sendIntent: () => Promise.resolve({ ok: true }) };
  const localPlayer = PLAYER_PROFILES.find((p) => p.userId === yellow);

  const game = new Game({ renderer, controls, stateManager, ui, knightImage: {}, localPlayer, network });
  game.init();

  // 3. Применяем снапшот и рендерим несколько кадров — не должно падать.
  game.pushSnapshot(snap);
  for (let i = 0; i < 3; i++) {
    game.update(16);
    game.render();
  }

  // 3b. Второй снапшот со сдвигом позиций — проверяем интерполяцию.
  const snap2 = world.collectSnapshot(world.stateVersion);
  for (const k of snap2.knights) {
    k.x += 30;
  }
  game.pushSnapshot(snap2);
  for (let i = 0; i < 5; i++) {
    game.update(16);
    game.render();
  }

  // 4. Зеркала наполнились из снапшота.
  assert.ok(stateManager.getState().size > 100, 'client state mirror populated');
  const castle = [...stateManager.getState().values()].some((c) => c.spriteType === 'castle');
  assert.ok(castle, 'castle present in client mirror');

  console.log('  ✓ networked client renders server snapshot without crashing');
  console.log('  ✓ all client-render-smoke assertions passed');
}

try {
  run();
  console.log('\nPASS\n');
  process.exit(0);
} catch (err) {
  console.error('\nFAIL:', err.stack || err.message);
  process.exit(1);
}
