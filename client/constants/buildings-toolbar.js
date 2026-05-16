/**
 * Постройки в панели выбора: ключ в `tiles`, кроме записей с `externalSprite` (превью из отдельного файла).
 * `previewTileKey` — другой тайл только для картинки в сайдбаре (на землю ставится `key`).
 */
export const BUILDINGS_TOOLBAR = [
  {
    key: 'farmStage1',
    previewTileKey: 'farmStage4',
    spriteW: 16,
    spriteH: 16,
    label: 'Ферма',
  },
  {
    key: 'houseFarm',
    previewTileKey: 'houseFarm',
    spriteW: 16,
    spriteH: 16,
    label: 'Дом фермера',
  },
  {
    key: 'barn',
    previewTileKey: 'houseBarn',
    spriteW: 16,
    spriteH: 16,
    label: 'Сарай',
  },
  { key: 'market', spriteW: 16, spriteH: 16, label: 'Магазин' },
  { key: 'knight', spriteW: 8, spriteH: 8, externalSprite: true, label: 'Рыцарь' },
];

export const DEFAULT_BUILDING_KEY = 'farmStage1';
