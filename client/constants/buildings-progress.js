/**
 * Полное время постройки магазина до готового тайла `market` (мс).
 * Две смены спрайта: marketStage1 → marketStage2 → market.
 */
export const MARKET_CONSTRUCTION_TOTAL_MS = 15_000;

/**
 * Длительность каждого этапа постройки магазина (между сменами спрайта).
 */
export function getMarketConstructionStageDurationMs() {
  return MARKET_CONSTRUCTION_TOTAL_MS / 2;
}

/**
 * Пауза между стадиями роста урожая (farmStage1 → … → farmStage4).
 */
export const FARM_GROWTH_STAGE_MS = 4000;

/** Пшеница за сбор с созревшей фермы (клик по farmStage4). */
export const WHEAT_PER_FARM_HARVEST = 15;

/** Порядок стадий роста фермы (индекс = стадия). */
export const FARM_GROWTH_STAGES = ['farmStage1', 'farmStage2', 'farmStage3', 'farmStage4'];

/** Магазин в процессе постройки — «заблокирован» до перехода в `market`. */
export const MARKET_CONSTRUCTION_SPRITE_TYPES = ['marketStage1', 'marketStage2'];
