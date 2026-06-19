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
    label: 'Farm',
  },
  {
    key: 'houseFarm',
    previewTileKey: 'houseFarm',
    spriteW: 16,
    spriteH: 16,
    label: 'Farmhouse',
  },
  {
    key: 'barn',
    previewTileKey: 'houseBarn',
    spriteW: 16,
    spriteH: 16,
    label: 'Barn',
  },
  {
    key: 'house',
    previewTileKey: 'house',
    spriteW: 16,
    spriteH: 16,
    label: 'House',
  },
  {
    key: 'blacksmith',
    previewTileKey: 'houseBlacksmith',
    spriteW: 16,
    spriteH: 16,
    label: 'Blacksmith',
  },
  { key: 'market', spriteW: 16, spriteH: 16, label: 'Market' },
];

export const DEFAULT_BUILDING_KEY = 'farmStage1';
