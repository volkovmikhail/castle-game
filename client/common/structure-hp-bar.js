/** Полоска HP над объектом, пока объект повреждён (hp ниже maxHp). */
export const STRUCTURE_HP_BAR_HEIGHT_PX = 1;
export const STRUCTURE_HP_BAR_GAP_ABOVE_PX = 2;
/**
 * Отступ полоски HP от левого и правого края спрайта (пиксели с каждой стороны).
 * Полоска уже спрайта на `2 * STRUCTURE_HP_BAR_HORIZONTAL_INSET_PX`.
 */
export const STRUCTURE_HP_BAR_HORIZONTAL_INSET_PX = 2;
/** Скрыть полоску HP, если по объекту не били дольше этого времени (мс). */
export const STRUCTURE_HP_BAR_HIDE_AFTER_IDLE_MS = 5000;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   spriteLeft: number;
 *   spriteTop: number;
 *   spriteWidth: number;
 *   hp: number;
 *   maxHp: number;
 *   lastDamagedAtMs?: number;
 *   nowMs?: number;
 * }} p
 */
export function drawStructureHpBar(ctx, { spriteLeft, spriteTop, spriteWidth, hp, maxHp, lastDamagedAtMs = 0, nowMs = performance.now() }) {
  const hpBarRecentEnough =
    lastDamagedAtMs > 0 && nowMs - lastDamagedAtMs < STRUCTURE_HP_BAR_HIDE_AFTER_IDLE_MS;

  if (hp >= maxHp || !hpBarRecentEnough) {
    return;
  }

  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const inset = STRUCTURE_HP_BAR_HORIZONTAL_INSET_PX;
  const bw = Math.max(1, spriteWidth - inset * 2);
  const bx = spriteLeft + inset;
  const by = spriteTop - STRUCTURE_HP_BAR_GAP_ABOVE_PX - STRUCTURE_HP_BAR_HEIGHT_PX;

  ctx.save();
  ctx.fillStyle = 'rgb(0, 0, 0)';
  ctx.fillRect(bx, by, bw, STRUCTURE_HP_BAR_HEIGHT_PX);
  ctx.fillStyle = 'rgb(220, 45, 45)';
  ctx.fillRect(bx, by, Math.max(0, Math.round(bw * ratio)), STRUCTURE_HP_BAR_HEIGHT_PX);
  ctx.restore();
}
