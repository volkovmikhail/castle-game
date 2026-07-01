/**
 * Кнопка «?» (слева снизу) и модалка с правилами игры. Не зависит от состояния
 * игры, поэтому доступна на всех экранах — в лобби, в бою и на экране финала.
 */
export function setupHelpModal() {
  const fab = document.getElementById('help-fab');
  const modal = document.getElementById('rules-modal');
  if (!fab || !modal) {
    return;
  }

  const open = () => {
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  };

  const close = () => {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  };

  fab.addEventListener('click', open);

  for (const el of modal.querySelectorAll('[data-rules-close]')) {
    el.addEventListener('click', close);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      event.preventDefault();
      // Не даём тому же Esc заодно отменить постройку/закрыть игровую модалку.
      event.stopImmediatePropagation();
      close();
    }
  });
}
