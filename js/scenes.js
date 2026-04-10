window.DD = window.DD || {};

DD.Scenes = {
  current: 'MENU',
  // Lobby state
  lobby: {
    connectedRoles: ['guardian'],
    errorMsg: '',
    joinInput: '',
    inputFocused: false,
  },
  // GameOver state
  gameOver: {
    stats: null,
  },
  // Upgrade screen scroll
  upgradeScroll: 0,

  switch(name) {
    console.log(`[Scene] ${this.current} -> ${name}`);
    this.current = name;
  },

  // ---- Rendering ----

  render(ctx) {
    switch (this.current) {
      case 'MENU':      this._renderMenu(ctx); break;
      case 'LOBBY':     this._renderLobby(ctx); break;
      case 'GAMEOVER':  this._renderGameOver(ctx); break;
      case 'UPGRADES':  this._renderUpgrades(ctx); break;
    }
  },

  // ---- MENU ----
  _menuButtons: [],

  _renderMenu(ctx) {
    const C = DD.Config;
    const W = C.CANVAS_W, H = C.CANVAS_H;

    // Background
    ctx.fillStyle = C.COLOR.BG;
    ctx.fillRect(0, 0, W, H);

    // Animated background particles
    const t = Date.now() * 0.001;
    for (let i = 0; i < 20; i++) {
      const x = (Math.sin(t * 0.3 + i * 1.7) * 0.5 + 0.5) * W;
      const y = ((t * 0.05 + i * 0.05) % 1) * H;
      ctx.fillStyle = 'rgba(100, 100, 200, 0.1)';
      ctx.fillRect(x, y, 2, 2);
    }

    // Title
    ctx.textAlign = 'center';
    ctx.shadowColor = '#4488ff';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px monospace';
    ctx.fillText('DEEP', W / 2, H * 0.22);
    ctx.fillStyle = C.COLOR.GUARDIAN;
    ctx.font = 'bold 42px monospace';
    ctx.fillText('DIVE', W / 2, H * 0.22 + 48);
    ctx.shadowBlur = 0;

    ctx.fillStyle = C.COLOR.TEXT_DIM;
    ctx.font = '12px monospace';
    ctx.fillText('3-PLAYER COOPERATIVE SURVIVAL', W / 2, H * 0.22 + 75);

    // Buttons
    this._menuButtons = [
      { label: 'HOST GAME',  action: 'host',     y: H * 0.48 },
      { label: 'JOIN GAME',  action: 'join',     y: H * 0.48 + 58 },
      { label: 'TEST MODE',  action: 'test',     y: H * 0.48 + 116 },
      { label: 'UPGRADES',   action: 'upgrades', y: H * 0.48 + 174 },
    ];

    for (const btn of this._menuButtons) {
      this._drawButton(ctx, W / 2, btn.y, 220, 42, btn.label, C.COLOR.GUARDIAN);
    }

    // Credits
    ctx.fillStyle = C.COLOR.TEXT_DIM;
    ctx.font = '10px monospace';
    ctx.fillText('TAB = debug | WASD = move | SPACE = action', W / 2, H - 12);
    ctx.textAlign = 'left';
  },

  // ---- LOBBY ----
  _lobbyRoleButtons: [],

  _renderLobby(ctx) {
    const C = DD.Config;
    const W = C.CANVAS_W, H = C.CANVAS_H;

    ctx.fillStyle = C.COLOR.BG;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    // Room code
    ctx.fillStyle = C.COLOR.INTERACTIVE;
    ctx.font = 'bold 16px monospace';
    ctx.fillText('LOBBY', W / 2, 36);

    ctx.fillStyle = C.COLOR.TEXT_DIM;
    ctx.font = '12px monospace';
    ctx.fillText('Room code:', W / 2, 62);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px monospace';
    ctx.shadowColor = C.COLOR.INTERACTIVE;
    ctx.shadowBlur = 12;
    ctx.fillText(DD.Network.roomCode, W / 2, 100);
    ctx.shadowBlur = 0;

    // Role selection section
    ctx.fillStyle = C.COLOR.TEXT_DIM;
    ctx.font = '12px monospace';
    ctx.fillText('Choose your role:', W / 2, 130);

    const roles = ['guardian', 'technician', 'gunner'];
    const roleColors = [C.COLOR.GUARDIAN, C.COLOR.TECHNICIAN, C.COLOR.GUNNER];
    const roleDesc = ['Shield & protect', 'Repair & recharge', 'Shoot enemies'];
    const players = this.lobby.players || [];
    const myRole = DD.Network.localRole;

    this._lobbyRoleButtons = [];

    for (let i = 0; i < 3; i++) {
      const role = roles[i];
      const takenBy = players.find(p => p.role === role);
      const isMe = role === myRole;
      const isTaken = takenBy && !isMe;
      const by = takenBy ? (takenBy.peerId === 'host' ? '(host)' : '(player ' + (players.indexOf(takenBy)) + ')') : '';

      const bx = W / 2;
      const by2 = 155 + i * 70;
      this._lobbyRoleButtons.push({ role, x: bx, y: by2, w: 280, h: 56 });

      // Button bg
      const borderColor = isMe ? roleColors[i] : isTaken ? '#444' : '#555';
      ctx.fillStyle = isMe ? 'rgba(30,30,60,0.9)' : 'rgba(15,15,25,0.8)';
      ctx.fillRect(bx - 140, by2 - 28, 280, 56);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = isMe ? 2 : 1;
      ctx.strokeRect(bx - 140, by2 - 28, 280, 56);

      // Role name
      ctx.fillStyle = isTaken ? '#555' : roleColors[i];
      ctx.font = `bold 14px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(role.toUpperCase(), bx - 130, by2 - 6);

      // Description
      ctx.fillStyle = isTaken ? '#444' : C.COLOR.TEXT_DIM;
      ctx.font = '10px monospace';
      ctx.fillText(roleDesc[i], bx - 130, by2 + 10);

      // Status right side
      ctx.textAlign = 'right';
      if (isMe) {
        ctx.fillStyle = roleColors[i];
        ctx.font = 'bold 11px monospace';
        ctx.fillText('< YOU >', bx + 130, by2 + 4);
      } else if (isTaken) {
        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.fillText('TAKEN ' + by, bx + 130, by2 + 4);
      } else {
        ctx.fillStyle = '#555';
        ctx.font = '11px monospace';
        ctx.fillText('PICK', bx + 130, by2 + 4);
      }
    }

    // "No role" option
    const noRoleY = 155 + 3 * 70;
    this._lobbyRoleButtons.push({ role: null, x: W / 2, y: noRoleY, w: 280, h: 40 });
    const isNoRole = !myRole;
    ctx.textAlign = 'center';
    ctx.fillStyle = isNoRole ? 'rgba(30,30,30,0.9)' : 'rgba(10,10,10,0.6)';
    ctx.fillRect(W / 2 - 140, noRoleY - 20, 280, 40);
    ctx.strokeStyle = isNoRole ? '#888' : '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(W / 2 - 140, noRoleY - 20, 280, 40);
    ctx.fillStyle = isNoRole ? '#aaa' : '#555';
    ctx.font = '12px monospace';
    ctx.fillText('Spectator / no role', W / 2, noRoleY + 4);

    // Error message
    if (this.lobby.errorMsg) {
      ctx.fillStyle = C.COLOR.DANGER;
      ctx.font = '11px monospace';
      ctx.fillText(this.lobby.errorMsg, W / 2, noRoleY + 32);
    }

    // Connected players count
    ctx.fillStyle = C.COLOR.TEXT_DIM;
    ctx.font = '11px monospace';
    ctx.fillText(`${players.length} player(s) connected`, W / 2, noRoleY + 48);

    // Start / wait
    if (DD.Network.isHostFlag) {
      this._drawButton(ctx, W / 2, H - 90, 200, 44, 'START GAME', C.COLOR.INTERACTIVE);
    } else {
      ctx.fillStyle = C.COLOR.TEXT_DIM;
      ctx.font = '12px monospace';
      ctx.fillText('Waiting for host to start...', W / 2, H - 72);
    }

    this._drawButton(ctx, W / 2, H - 36, 140, 30, 'BACK', '#555');
    ctx.textAlign = 'left';
  },

  // ---- JOIN INPUT (modal overlay) ----
  _joinInputValue: '',

  _renderJoinInput(ctx) {
    const C = DD.Config;
    const W = C.CANVAS_W, H = C.CANVAS_H;

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = C.COLOR.TEXT;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('ENTER ROOM CODE', W / 2, H / 2 - 80);

    // Input box
    ctx.strokeStyle = C.COLOR.INTERACTIVE;
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 100, H / 2 - 50, 200, 46);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(W / 2 - 100, H / 2 - 50, 200, 46);

    ctx.fillStyle = C.COLOR.INTERACTIVE;
    ctx.font = 'bold 28px monospace';
    ctx.fillText(this._joinInputValue + (Math.floor(Date.now() / 500) % 2 ? '|' : ''), W / 2, H / 2 - 14);

    ctx.fillStyle = C.COLOR.TEXT_DIM;
    ctx.font = '12px monospace';
    ctx.fillText('Type 4-letter code, press ENTER', W / 2, H / 2 + 20);
    ctx.fillText('ESC to cancel', W / 2, H / 2 + 40);
    ctx.textAlign = 'left';
  },

  // ---- GAME OVER ----

  _renderGameOver(ctx) {
    const C = DD.Config;
    const W = C.CANVAS_W, H = C.CANVAS_H;
    const stats = this.gameOver.stats;

    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';

    const victory = stats && stats.victory;
    ctx.fillStyle = victory ? C.COLOR.INTERACTIVE : C.COLOR.DANGER;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 20;
    ctx.font = 'bold 32px monospace';
    ctx.fillText(victory ? 'MISSION COMPLETE' : 'PLATFORM LOST', W / 2, H * 0.2);
    ctx.shadowBlur = 0;

    if (stats) {
      ctx.fillStyle = C.COLOR.TEXT;
      ctx.font = '16px monospace';
      const lines = [
        `Depth reached: ${Math.floor(stats.depth)}m`,
        `Waves survived: ${stats.waveNum}`,
        `Cores earned: +${stats.cores}`,
        `Enemies killed: ${stats.kills}`,
      ];
      lines.forEach((line, i) => {
        ctx.fillText(line, W / 2, H * 0.35 + i * 30);
      });

      // Total cores
      ctx.fillStyle = C.COLOR.CORE;
      ctx.font = 'bold 15px monospace';
      ctx.fillText(`Total cores: ${DD.Progression.data.totalCores}`, W / 2, H * 0.35 + lines.length * 30 + 20);
    }

    const isMulti = !DD.Game.testMode && (DD.Network.isHostFlag || DD.Network.hostConn);
    const playLabel = isMulti && !DD.Network.isHostFlag ? 'REQUEST REPLAY' : 'PLAY AGAIN';
    this._drawButton(ctx, W / 2, H * 0.7, 200, 44, playLabel, C.COLOR.INTERACTIVE);
    this._drawButton(ctx, W / 2, H * 0.7 + 60, 200, 44, 'UPGRADES', C.COLOR.CORE);
    this._drawButton(ctx, W / 2, H * 0.7 + 120, 200, 44, 'MAIN MENU', '#666');

    ctx.textAlign = 'left';
  },

  // ---- UPGRADES ----

  _renderUpgrades(ctx) {
    const C = DD.Config;
    const W = C.CANVAS_W, H = C.CANVAS_H;

    ctx.fillStyle = C.COLOR.BG;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = C.COLOR.INTERACTIVE;
    ctx.font = 'bold 20px monospace';
    ctx.fillText('UPGRADES', W / 2, 36);

    ctx.fillStyle = C.COLOR.CORE;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`Cores: ${DD.Progression.data.totalCores}`, W / 2, 58);

    const keys = Object.keys(DD.Progression.MAX_LEVELS);
    const startY = 80;
    const itemH = 56;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const level = DD.Progression.data.upgrades[key];
      const maxLevel = DD.Progression.MAX_LEVELS[key];
      const cost = DD.Progression.getCost(key);
      const canAfford = DD.Progression.canAfford(key);
      const y = startY + i * itemH - this.upgradeScroll;

      if (y < 58 || y > H - 80) continue;  // Clipping

      // Item background
      ctx.fillStyle = 'rgba(30,30,50,0.8)';
      ctx.fillRect(10, y, W - 20, itemH - 4);
      ctx.strokeStyle = canAfford ? C.COLOR.INTERACTIVE : '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(10, y, W - 20, itemH - 4);

      // Label
      ctx.fillStyle = C.COLOR.TEXT;
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(DD.Progression.LABELS[key], 18, y + 16);

      // Level pips
      for (let l = 0; l < maxLevel; l++) {
        ctx.fillStyle = l < level ? C.COLOR.INTERACTIVE : '#333';
        ctx.fillRect(18 + l * 18, y + 22, 14, 8);
      }

      // Cost / max
      if (level >= maxLevel) {
        ctx.fillStyle = C.COLOR.HP_BAR;
        ctx.font = '11px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('MAX', W - 18, y + 30);
      } else {
        ctx.fillStyle = canAfford ? C.COLOR.INTERACTIVE : '#666';
        ctx.font = '11px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${cost} cores`, W - 18, y + 30);

        if (canAfford) {
          this._drawButton(ctx, W - 60, y + 40, 90, 20, 'UPGRADE', C.COLOR.INTERACTIVE, 'small');
        }
      }
    }

    ctx.textAlign = 'center';
    this._drawButton(ctx, W / 2, H - 36, 160, 36, 'BACK', '#666');
    ctx.textAlign = 'left';
  },

  // ---- Helper ----

  _drawButton(ctx, cx, cy, w, h, label, color, size) {
    const bx = cx - w / 2;
    const by = cy - h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx, by, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, w, h);
    ctx.fillStyle = color;
    ctx.font = size === 'small' ? '10px monospace' : 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + (size === 'small' ? 4 : 5));
  },

  // ---- Input handling ----

  _isJoining: false,

  handleClick(canvasX, canvasY) {
    const C = DD.Config;
    const W = C.CANVAS_W, H = C.CANVAS_H;

    if (this._isJoining) return;  // handled by keyboard

    switch (this.current) {
      case 'MENU':
        for (const btn of this._menuButtons) {
          if (this._hitButton(canvasX, canvasY, W / 2, btn.y, 220, 42)) {
            this._handleMenuAction(btn.action);
          }
        }
        break;

      case 'LOBBY':
        // Role selection buttons
        for (const btn of this._lobbyRoleButtons) {
          if (this._hitButton(canvasX, canvasY, btn.x, btn.y, btn.w, btn.h)) {
            DD.Network.pickRole(btn.role);
            this.lobby.errorMsg = '';
            break;
          }
        }
        // Start (host only)
        if (DD.Network.isHostFlag && this._hitButton(canvasX, canvasY, W / 2, H - 90, 200, 44)) {
          DD.Network.startGame();
          DD.Game.startGame();
        }
        // Back
        if (this._hitButton(canvasX, canvasY, W / 2, H - 36, 140, 30)) {
          DD.Network.destroy();
          this.switch('MENU');
        }
        break;

      case 'GAMEOVER':
        if (this._hitButton(canvasX, canvasY, W / 2, H * 0.7, 200, 44)) {
          if (DD.Game.testMode) {
            DD.Game.startGame();
          } else if (DD.Network.isHostFlag) {
            // Host: restart for everyone
            DD.Network.broadcast({ type: 'PLAY_AGAIN' });
            DD.Game.startGame();
          } else {
            // Peer: ask host to restart
            DD.Network.hostConn && DD.Network.hostConn.send({ type: 'REQUEST_PLAY_AGAIN' });
          }
        } else if (this._hitButton(canvasX, canvasY, W / 2, H * 0.7 + 60, 200, 44)) {
          this.switch('UPGRADES');
        } else if (this._hitButton(canvasX, canvasY, W / 2, H * 0.7 + 120, 200, 44)) {
          DD.Network.destroy();
          this.switch('MENU');
        }
        break;

      case 'UPGRADES': {
        const keys = Object.keys(DD.Progression.MAX_LEVELS);
        const startY = 80;
        const itemH = 56;
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const y = startY + i * itemH - this.upgradeScroll;
          if (this._hitButton(canvasX, canvasY, W - 60, y + 40, 90, 20)) {
            if (DD.Progression.purchase(key)) {
              console.log('[Progression] Purchased:', key);
            }
          }
        }
        if (this._hitButton(canvasX, canvasY, W / 2, H - 36, 160, 36)) {
          this.switch('MENU');
        }
        break;
      }
    }
  },

  _handleMenuAction(action) {
    switch (action) {
      case 'host':
        DD.Network.hostGame(() => {
          this.lobby.players = [{ peerId: 'host', role: 'guardian' }];
          this.lobby.errorMsg = '';
          this.switch('LOBBY');
        });
        break;

      case 'join':
        this._isJoining = true;
        this._joinInputValue = '';
        break;

      case 'test':
        DD.Game.startTestMode();
        break;

      case 'upgrades':
        this.upgradeScroll = 0;
        this.switch('UPGRADES');
        break;
    }
  },

  handleKeyDown(code) {
    if (this._isJoining) {
      if (code === 'Escape') {
        this._isJoining = false;
        return;
      }
      if (code === 'Enter') {
        const roomCode = this._joinInputValue.trim().toUpperCase();
        if (roomCode.length < 2) {
          this._isJoining = false;
          return;
        }
        this._isJoining = false;
        this.lobby.errorMsg = '';
        DD.Network.joinGame(roomCode, () => {
          this.switch('LOBBY');
        });
        return;
      }
      if (code === 'Backspace') {
        this._joinInputValue = this._joinInputValue.slice(0, -1);
        return;
      }
      if (this._joinInputValue.length < 4) {
        const char = code.replace('Key', '').replace('Digit', '');
        if (char.length === 1) {
          this._joinInputValue += char.toUpperCase();
        }
      }
      return;
    }

    if (this.current === 'UPGRADES') {
      if (code === 'ArrowDown') this.upgradeScroll += 30;
      if (code === 'ArrowUp') this.upgradeScroll = Math.max(0, this.upgradeScroll - 30);
    }
  },

  _hitButton(mx, my, cx, cy, w, h) {
    return mx >= cx - w / 2 && mx <= cx + w / 2 &&
           my >= cy - h / 2 && my <= cy + h / 2;
  },

  isJoining() {
    return this._isJoining;
  },

  renderJoinInput(ctx) {
    if (this._isJoining) this._renderJoinInput(ctx);
  },
};
