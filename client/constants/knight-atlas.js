/**
 * Кадры из `client/assets/knight.png` (как в Aseprite JSON: run / beat / default).
 * Исходник описания — `arts/knight.json` (в репозитории не импортируется).
 */
export const KNIGHT_SPRITE_SIZE = 8;

/** Радиус тела для столкновений рыцарь–рыцарь (центр спрайта). */
export const KNIGHT_COLLISION_RADIUS = KNIGHT_SPRITE_SIZE * 0.42;

/** @type {{ sx: number; sy: number; sw: number; sh: number }[]} */
export const KNIGHT_FRAMES_RUN = [
  { sx: 0, sy: 0, sw: 8, sh: 8 },
  { sx: 8, sy: 0, sw: 8, sh: 8 },
  { sx: 16, sy: 0, sw: 8, sh: 8 },
  { sx: 24, sy: 0, sw: 8, sh: 8 },
];

/** @type {{ sx: number; sy: number; sw: number; sh: number }[]} */
export const KNIGHT_FRAMES_CHOP = [
  { sx: 0, sy: 8, sw: 8, sh: 8 },
  { sx: 8, sy: 8, sw: 8, sh: 8 },
  { sx: 16, sy: 8, sw: 8, sh: 8 },
  { sx: 24, sy: 8, sw: 8, sh: 8 },
];

export const KNIGHT_FRAME_IDLE = { sx: 0, sy: 16, sw: 8, sh: 8 };

export const KNIGHT_RUN_FRAME_MS = 100;
export const KNIGHT_CHOP_FRAME_MS = 100;
