/**
 * Постройки в панели выбора: ключ в `tiles`, кроме записей с `externalSprite` (превью из отдельного файла).
 */
export const BUILDINGS_TOOLBAR = [
  { key: 'axe', spriteW: 0, spriteH: 0 },
  { key: 'knight', spriteW: 8, spriteH: 8, externalSprite: true },
  { key: 'house', spriteW: 16, spriteH: 16 },
  { key: 'houseSide', spriteW: 16, spriteH: 16 },
  { key: 'houseDouble', spriteW: 16, spriteH: 16 },
  { key: 'houseBlacksmith', spriteW: 16, spriteH: 16 },
  { key: 'houseFarm', spriteW: 16, spriteH: 16 },
  { key: 'houseBarn', spriteW: 16, spriteH: 16 },
  { key: 'houseBarnSide', spriteW: 16, spriteH: 16 },
  { key: 'market', spriteW: 16, spriteH: 16 },
  { key: 'castle', spriteW: 32, spriteH: 32 },
];

export const DEFAULT_BUILDING_KEY = 'houseBlacksmith';
