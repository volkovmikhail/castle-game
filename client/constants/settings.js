/**
 * Пользовательские настройки, сохраняемые в localStorage. Значения по умолчанию
 * берутся отсюда — на них можно «сбросить» настройку из UI.
 */

/** Скорость прокрутки камеры колесом/трекпадом по умолчанию (множитель). */
export const DEFAULT_SCROLL_SENSITIVITY = 0.4;

/** Границы, чтобы нельзя было выставить неюзабельное значение. */
export const SCROLL_SENSITIVITY_MIN = 0.05;
export const SCROLL_SENSITIVITY_MAX = 5;

/** Ключ в localStorage. */
export const SCROLL_SENSITIVITY_STORAGE_KEY = 'castle-game:scroll-sensitivity';
