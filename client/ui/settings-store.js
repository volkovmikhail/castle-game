/**
 * Чтение/запись пользовательских настроек в localStorage. Обёрнуто в try/catch,
 * чтобы приватный режим/недоступный storage не ломал игру.
 */
import {
  DEFAULT_SCROLL_SENSITIVITY,
  SCROLL_SENSITIVITY_MAX,
  SCROLL_SENSITIVITY_MIN,
  SCROLL_SENSITIVITY_STORAGE_KEY,
} from '../constants/settings.js';

/**
 * @param {number} value
 * @returns {number}
 */
export function clampScrollSensitivity(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SCROLL_SENSITIVITY;
  }
  return Math.min(SCROLL_SENSITIVITY_MAX, Math.max(SCROLL_SENSITIVITY_MIN, value));
}

/**
 * Текущая скорость прокрутки: из localStorage или значение по умолчанию.
 *
 * @returns {number}
 */
export function getScrollSensitivity() {
  try {
    const raw = window.localStorage.getItem(SCROLL_SENSITIVITY_STORAGE_KEY);
    if (raw == null) {
      return DEFAULT_SCROLL_SENSITIVITY;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_SCROLL_SENSITIVITY;
    }
    return clampScrollSensitivity(parsed);
  } catch {
    return DEFAULT_SCROLL_SENSITIVITY;
  }
}

/**
 * @param {number} value
 * @returns {number} фактически сохранённое (после клампа) значение
 */
export function setScrollSensitivity(value) {
  const clamped = clampScrollSensitivity(value);
  try {
    window.localStorage.setItem(SCROLL_SENSITIVITY_STORAGE_KEY, String(clamped));
  } catch {
    // storage недоступен — просто игнорируем, значение вернётся к дефолту.
  }
  return clamped;
}

/**
 * Сброс к значению по умолчанию из константы.
 *
 * @returns {number}
 */
export function resetScrollSensitivity() {
  try {
    window.localStorage.removeItem(SCROLL_SENSITIVITY_STORAGE_KEY);
  } catch {
    // игнорируем
  }
  return DEFAULT_SCROLL_SENSITIVITY;
}
