/**
 * Кнопка настроек (рядом с «?») и модалка настроек. Доступна на всех экранах.
 * Пока одна настройка — скорость прокрутки камеры (сохраняется в localStorage).
 */
import { DEFAULT_SCROLL_SENSITIVITY } from '../constants/settings.js';
import {
  getScrollSensitivity,
  resetScrollSensitivity,
  setScrollSensitivity,
} from './settings-store.js';

export function setupSettingsModal() {
  const fab = document.getElementById('settings-fab');
  const modal = document.getElementById('settings-modal');
  const input = /** @type {HTMLInputElement | null} */ (
    document.getElementById('settings-scroll-input')
  );
  const resetBtn = document.getElementById('settings-scroll-reset');
  const defaultEl = document.getElementById('settings-scroll-default');
  if (!fab || !modal || !input) {
    return;
  }

  if (defaultEl) {
    defaultEl.textContent = String(DEFAULT_SCROLL_SENSITIVITY);
  }

  const open = () => {
    input.value = String(getScrollSensitivity());
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  };

  const close = () => {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  };

  // Применяем сразу — controls читает значение из store при каждом скролле.
  const apply = () => {
    const clamped = setScrollSensitivity(Number(input.value));
    input.value = String(clamped);
  };

  fab.addEventListener('click', open);
  input.addEventListener('change', apply);
  resetBtn?.addEventListener('click', () => {
    input.value = String(resetScrollSensitivity());
  });

  for (const el of modal.querySelectorAll('[data-settings-close]')) {
    el.addEventListener('click', close);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
  });
}
