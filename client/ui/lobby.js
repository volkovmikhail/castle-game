/**
 * Экран лобби: подключение, создание/вход по коду, живой список игроков,
 * готовность и старт. `waitForGameStart()` резолвится, когда сервер прислал
 * game:start — с назначенным слотом текущего игрока.
 */
export class Lobby {
  /**
   * @param {{ network: import('../net/network.js').Network }} opts
   */
  constructor({ network }) {
    this.network = network;

    this.root = document.getElementById('lobby');
    this.statusEl = document.getElementById('lobby-status');
    this.viewMenu = document.getElementById('lobby-view-menu');
    this.viewSearch = document.getElementById('lobby-view-search');
    this.viewRoom = document.getElementById('lobby-view-room');

    this.nameInput = /** @type {HTMLInputElement} */ (document.getElementById('lobby-name'));
    this.codeInput = /** @type {HTMLInputElement} */ (document.getElementById('lobby-code'));
    this.createBtn = document.getElementById('lobby-create');
    this.findBtn = document.getElementById('lobby-find');
    this.onlineEl = document.getElementById('lobby-online');
    this.joinBtn = document.getElementById('lobby-join');
    this.errorEl = document.getElementById('lobby-error');

    // Быстрый матч (search view).
    this.searchCountEl = document.getElementById('lobby-search-count');
    this.searchTimerEl = document.getElementById('lobby-search-timer');
    this.searchHintEl = document.getElementById('lobby-search-hint');
    this.searchCancelBtn = document.getElementById('lobby-search-cancel');

    this.roomCodeEl = document.getElementById('lobby-room-code');
    this.copyBtn = document.getElementById('lobby-copy-code');
    this.playersEl = document.getElementById('lobby-players');
    this.roomHintEl = document.getElementById('lobby-room-hint');
    this.readyBtn = document.getElementById('lobby-ready');
    this.startBtn = /** @type {HTMLButtonElement} */ (document.getElementById('lobby-start'));
    this.leaveBtn = document.getElementById('lobby-leave');

    /** @type {any | null} последнее состояние комнаты. */
    this.lastState = null;
    /** @type {((payload: any) => void) | null} */
    this.resolveStart = null;

    /** Локальный отсчёт таймера матча: остаток (мс) и момент его получения. */
    this.matchRemainingMs = null;
    this.matchStampAt = 0;
    this.matchCounting = false;
    /** @type {ReturnType<typeof setInterval> | null} */
    this.searchTicker = null;
  }

  /** @returns {Promise<any>} payload game:start ({ you, players, world, seed }). */
  async waitForGameStart() {
    this.#show();
    this.#bindDom();

    this.#setStatus('Connecting…');
    try {
      await this.network.connect();
    } catch (err) {
      this.#setStatus('Connection failed. Is the server running?');
      throw err;
    }
    // Подписки навешиваем только после connect() — сокет создаётся внутри него.
    this.#bindNetwork();
    this.#setStatus('Connected');
    this.#showView('menu');

    const saved = localStorage.getItem('castle.playerName');
    if (saved) {
      this.nameInput.value = saved;
    }

    return new Promise((resolve) => {
      this.resolveStart = resolve;
    });
  }

  #bindNetwork() {
    this.network.onRoomState((state) => this.#renderRoom(state));
    this.network.onMatchState((state) => this.#renderSearch(state));
    this.network.onPresence((data) => this.#renderOnline(data));
    this.network.onGameStart((payload) => {
      this.#stopSearchTicker();
      this.#hide();
      this.resolveStart?.(payload);
      this.resolveStart = null;
    });
    this.network.onError((e) => this.#setError(e?.message ?? 'Server error.'));
    this.network.onDisconnect(() => this.#setStatus('Disconnected from server.'));
  }

  #bindDom() {
    this.createBtn.addEventListener('click', () => this.#onCreate());
    this.findBtn.addEventListener('click', () => this.#onFind());
    this.searchCancelBtn.addEventListener('click', () => this.#onCancelSearch());
    this.joinBtn.addEventListener('click', () => this.#onJoin());
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = this.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    this.readyBtn.addEventListener('click', () => this.#onToggleReady());
    this.startBtn.addEventListener('click', () => this.#onStart());
    this.leaveBtn.addEventListener('click', () => this.#onLeave());
    this.copyBtn.addEventListener('click', () => this.#onCopyCode());
  }

  async #onCopyCode() {
    const code = this.lastState?.code;
    if (!code) {
      return;
    }
    const ok = await copyToClipboard(code);
    const original = 'Copy';
    this.copyBtn.textContent = ok ? 'Copied!' : 'Failed';
    this.copyBtn.disabled = true;
    setTimeout(() => {
      this.copyBtn.textContent = original;
      this.copyBtn.disabled = false;
    }, 1200);
  }

  #saveName() {
    const name = this.nameInput.value.trim();
    if (name) {
      localStorage.setItem('castle.playerName', name);
    }
    return name;
  }

  async #onCreate() {
    this.#setError('');
    const res = await this.network.createRoom(this.#saveName());
    if (!res.ok) {
      this.#setError(res.error ?? 'Could not create room.');
      return;
    }
    this.#renderRoom(res.room);
    this.#showView('room');
  }

  async #onFind() {
    this.#setError('');
    // Нажал Find game — значит уже готов. Показываем счётчик + таймер, без лобби.
    // Готовим экран поиска ДО запроса: сервер шлёт match:state раньше ack, и если
    // сбросить состояние после await, у игрока, который своим входом и запустил
    // отсчёт, таймер бы затёрся. Поэтому сброс — здесь, до отправки match:find.
    this.matchRemainingMs = null;
    this.matchCounting = false;
    this.#renderSearch(null);
    this.#showView('search');
    this.#startSearchTicker();

    const res = await this.network.findMatch(this.#saveName());
    if (!res?.ok) {
      this.#stopSearchTicker();
      this.#showView('menu');
      this.#setError(res?.error ?? 'Could not start matchmaking.');
    }
  }

  async #onCancelSearch() {
    this.#stopSearchTicker();
    await this.network.cancelMatch();
    this.#showView('menu');
  }

  /** @param {{ online: number } | null} data */
  #renderOnline(data) {
    const n = Number(data?.online ?? 0);
    this.onlineEl.textContent = `· ${n} online`;
  }

  /** @param {any} state состояние очереди матча (или null — только что встали). */
  #renderSearch(state) {
    if (state) {
      const max = state.max ?? 4;
      this.searchCountEl.textContent = `${state.count} / ${max}`;
      this.matchCounting = Boolean(state.counting);
      this.matchRemainingMs = state.counting ? Number(state.remainingMs ?? 0) : null;
      this.matchStampAt = Date.now();
      this.searchHintEl.textContent = state.counting
        ? 'Enough players — starting soon. More can still join.'
        : `Waiting for at least ${state.min ?? 2} players to join…`;
    }
    this.#renderSearchTimer();
  }

  /** Пересчитать и отрисовать локальный обратный отсчёт таймера матча. */
  #renderSearchTimer() {
    if (!this.matchCounting || this.matchRemainingMs === null) {
      this.searchTimerEl.textContent = '';
      return;
    }
    const left = Math.max(0, this.matchRemainingMs - (Date.now() - this.matchStampAt));
    const secs = Math.ceil(left / 1000);
    const mm = Math.floor(secs / 60);
    const ss = String(secs % 60).padStart(2, '0');
    this.searchTimerEl.textContent = `Starting in ${mm}:${ss}`;
  }

  #startSearchTicker() {
    this.#stopSearchTicker();
    this.searchTicker = setInterval(() => this.#renderSearchTimer(), 250);
  }

  #stopSearchTicker() {
    if (this.searchTicker) {
      clearInterval(this.searchTicker);
      this.searchTicker = null;
    }
  }

  async #onJoin() {
    this.#setError('');
    const code = this.codeInput.value.trim().toUpperCase();
    if (code.length < 4) {
      this.#setError('Enter the 4-character room code.');
      return;
    }
    const res = await this.network.joinRoom(code, this.#saveName());
    if (!res.ok) {
      this.#setError(res.error ?? 'Could not join.');
      return;
    }
    this.#renderRoom(res.room);
    this.#showView('room');
  }

  #onToggleReady() {
    const me = this.#me();
    this.network.setReady(!(me?.ready ?? false));
  }

  async #onStart() {
    const res = await this.network.startGame();
    if (!res.ok) {
      this.#setError(res.error ?? 'Could not start.');
    }
  }

  async #onLeave() {
    await this.network.leaveRoom();
    this.lastState = null;
    this.#showView('menu');
  }

  #me() {
    if (!this.lastState) {
      return null;
    }
    return this.lastState.players.find((p) => p.id === this.network.id) ?? null;
  }

  /** @param {any} state */
  #renderRoom(state) {
    if (!state) {
      return;
    }
    this.lastState = state;
    this.roomCodeEl.textContent = state.code;

    this.playersEl.innerHTML = '';
    for (const p of state.players) {
      const li = document.createElement('li');
      li.className = 'lobby__player';

      const dot = document.createElement('span');
      dot.className = 'lobby__player-dot';
      dot.style.background = p.color;

      const name = document.createElement('span');
      name.className = 'lobby__player-name';
      name.textContent = p.name + (p.id === this.network.id ? ' (you)' : '');

      const tags = document.createElement('span');
      tags.className = 'lobby__player-tags';
      if (p.isHost) {
        tags.append(this.#tag('HOST', 'host'));
      }
      tags.append(this.#tag(p.ready ? 'READY' : 'WAIT', p.ready ? 'ready' : 'wait'));

      li.append(dot, name, tags);
      this.playersEl.append(li);
    }

    const me = this.#me();
    this.readyBtn.textContent = me?.ready ? 'Not ready' : 'Ready';
    this.readyBtn.classList.toggle('lobby__btn--primary', !me?.ready);

    const isHost = Boolean(me?.isHost);
    this.startBtn.hidden = !isHost;
    this.startBtn.disabled = !(isHost && state.canStart);

    const need = state.minPlayers;
    this.roomHintEl.textContent = state.canStart
      ? isHost
        ? 'Everyone is ready — press Start.'
        : 'Waiting for the host to start…'
      : `Need ${need}–${state.maxPlayers} players, all ready. Players: ${state.players.length}/${state.maxPlayers}.`;
  }

  /** @param {string} text @param {string} kind */
  #tag(text, kind) {
    const el = document.createElement('span');
    el.className = `lobby__tag lobby__tag--${kind}`;
    el.textContent = text;
    return el;
  }

  #showView(which) {
    this.viewMenu.hidden = which !== 'menu';
    this.viewSearch.hidden = which !== 'search';
    this.viewRoom.hidden = which !== 'room';
  }

  #setStatus(text) {
    this.statusEl.textContent = text;
  }

  #setError(text) {
    this.errorEl.textContent = text;
  }

  #show() {
    this.root.hidden = false;
  }

  #hide() {
    this.root.hidden = true;
  }
}

/**
 * Скопировать текст в буфер обмена. Clipboard API (secure context, в т.ч. localhost)
 * с откатом на скрытый textarea + execCommand для прочих случаев.
 *
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // упадём в фолбэк ниже
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
