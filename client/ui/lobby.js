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
    this.viewRoom = document.getElementById('lobby-view-room');

    this.nameInput = /** @type {HTMLInputElement} */ (document.getElementById('lobby-name'));
    this.codeInput = /** @type {HTMLInputElement} */ (document.getElementById('lobby-code'));
    this.createBtn = document.getElementById('lobby-create');
    this.joinBtn = document.getElementById('lobby-join');
    this.errorEl = document.getElementById('lobby-error');

    this.roomCodeEl = document.getElementById('lobby-room-code');
    this.playersEl = document.getElementById('lobby-players');
    this.roomHintEl = document.getElementById('lobby-room-hint');
    this.readyBtn = document.getElementById('lobby-ready');
    this.startBtn = /** @type {HTMLButtonElement} */ (document.getElementById('lobby-start'));
    this.leaveBtn = document.getElementById('lobby-leave');

    /** @type {any | null} последнее состояние комнаты. */
    this.lastState = null;
    /** @type {((payload: any) => void) | null} */
    this.resolveStart = null;
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
    this.network.onGameStart((payload) => {
      this.#hide();
      this.resolveStart?.(payload);
      this.resolveStart = null;
    });
    this.network.onError((e) => this.#setError(e?.message ?? 'Server error.'));
    this.network.onDisconnect(() => this.#setStatus('Disconnected from server.'));
  }

  #bindDom() {
    this.createBtn.addEventListener('click', () => this.#onCreate());
    this.joinBtn.addEventListener('click', () => this.#onJoin());
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = this.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    this.readyBtn.addEventListener('click', () => this.#onToggleReady());
    this.startBtn.addEventListener('click', () => this.#onStart());
    this.leaveBtn.addEventListener('click', () => this.#onLeave());
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
