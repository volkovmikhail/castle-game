/**
 * Кадры из `client/assets/knight-colored.png` (36×24, сетка 4×3 по 9×8).
 * Как в экспорте Aseprite: ряд y=0 — run, y=8 — beat, y=16 — idle (2 кадра).
 */
export const KNIGHT_SPRITE_WIDTH = 9;
export const KNIGHT_SPRITE_HEIGHT = 8;

/** Основной (тёмно-зелёный) цвет тела рыцаря из атласа — им же красим снаряд пушки. */
export const KNIGHT_BODY_COLOR = '#405028';
// Совместимость со старым кодом (где ожидается одно число размера).
export const KNIGHT_SPRITE_SIZE = KNIGHT_SPRITE_WIDTH;

/** Радиус тела для столкновений рыцарь–рыцарь (центр спрайта). */
export const KNIGHT_COLLISION_RADIUS = Math.min(KNIGHT_SPRITE_WIDTH, KNIGHT_SPRITE_HEIGHT) * 0.42;

/** @type {{ sx: number; sy: number; sw: number; sh: number }[]} */
export const KNIGHT_FRAMES_RUN = [
  { sx: 0, sy: 0, sw: 9, sh: 8 },
  { sx: 9, sy: 0, sw: 9, sh: 8 },
  { sx: 18, sy: 0, sw: 9, sh: 8 },
  { sx: 27, sy: 0, sw: 9, sh: 8 },
];

/** @type {{ sx: number; sy: number; sw: number; sh: number }[]} */
export const KNIGHT_FRAMES_CHOP = [
  { sx: 0, sy: 8, sw: 9, sh: 8 },
  { sx: 9, sy: 8, sw: 9, sh: 8 },
  { sx: 18, sy: 8, sw: 9, sh: 8 },
  { sx: 27, sy: 8, sw: 9, sh: 8 },
];

/** Основной кадр idle — нижний ряд атласа. */
export const KNIGHT_FRAME_IDLE = { sx: 0, sy: 16, sw: 9, sh: 8 };

/** Второй кадр idle (короткий показ в цикле). */
export const KNIGHT_FRAME_IDLE_ALT = { sx: 9, sy: 16, sw: 9, sh: 8 };

/** Длительность показа второго кадра idle (мс). */
export const KNIGHT_IDLE_ALT_DURATION_MS = 500;

/** Пауза до следующего показа 2-го кадра — случайная в диапазоне [min, max] (мс). */
export const KNIGHT_IDLE_GAP_MIN_MS = 1500;
export const KNIGHT_IDLE_GAP_MAX_MS = 4000;

export const KNIGHT_RUN_FRAME_MS = 100;
export const KNIGHT_CHOP_FRAME_MS = 100;
