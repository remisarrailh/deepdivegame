window.DD = window.DD || {};

DD.Game = {
  ctx: null,
  canvas: null,
  loop: null,

  // Mode flags
  testMode: false,
  activeRole: 'guardian',  // in test mode: which role we're currently controlling
  localRole: 'guardian',
  debugMode: false,

  // Game state
  state: null,

  // Kill counter for stats
  killCount: 0,

  // FPS tracking
  _lastFrameTime: 0,
  _frameCount: 0,
  _fps: 60,
  _fpsTimer: 0,

  // Descent animation
  _descentOffset: 0,

  init() {
    // Setup canvas
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());

    // Init subsystems
    DD.Input.init(this.canvas);
    DD.Progression.load();
    DD.Particles.init();

    // Handle mouse/touch clicks for scenes
    // Listen on window so clicks on the black border area still work
    window.addEventListener('click', (e) => {
      DD.Input._updateCanvasRect();  // always fresh
      const pos = DD.Input.screenToCanvas(e.clientX, e.clientY);
      // Only handle if click is within canvas bounds
      if (pos.x >= 0 && pos.x <= DD.Config.CANVAS_W && pos.y >= 0 && pos.y <= DD.Config.CANVAS_H) {
        DD.Scenes.handleClick(pos.x, pos.y);
      }
    });
    window.addEventListener('touchend', (e) => {
      if (e.changedTouches.length > 0) {
        DD.Input._updateCanvasRect();
        const t = e.changedTouches[0];
        const pos = DD.Input.screenToCanvas(t.clientX, t.clientY);
        if (pos.x >= 0 && pos.x <= DD.Config.CANVAS_W && pos.y >= 0 && pos.y <= DD.Config.CANVAS_H) {
          DD.Scenes.handleClick(pos.x, pos.y);
        }
      }
    }, { passive: false });

    // Keyboard for scenes
    window.addEventListener('keydown', (e) => {
      // Tab = toggle debug
      if (e.code === 'Tab') {
        e.preventDefault();
        this.debugMode = !this.debugMode;
        return;
      }
      DD.Scenes.handleKeyDown(e.code);

      // Test mode role switching
      if (this.testMode && DD.Scenes.current === 'GAME') {
        if (e.code === 'Digit1') this.activeRole = 'guardian';
        if (e.code === 'Digit2') this.activeRole = 'technician';
        if (e.code === 'Digit3') this.activeRole = 'gunner';
      }
    });

    // Network message handler
    DD.Network.onMessage = (type, data) => this._handleNetMessage(type, data);

    // Start the render loop
    this._startLoop();
  },

  _resizeCanvas() {
    const C = DD.Config;
    const wrap = document.getElementById('wrap');
    const ww = wrap.clientWidth;
    const wh = wrap.clientHeight;
    const scale = Math.min(ww / C.CANVAS_W, wh / C.CANVAS_H);
    this.canvas.width = C.CANVAS_W;
    this.canvas.height = C.CANVAS_H;
    this.canvas.style.width = Math.floor(C.CANVAS_W * scale) + 'px';
    this.canvas.style.height = Math.floor(C.CANVAS_H * scale) + 'px';
    DD.Input._updateCanvasRect && DD.Input._updateCanvasRect();
  },

  _startLoop() {
    const gameLoop = (timestamp) => {
      const dt = timestamp - this._lastFrameTime;
      this._lastFrameTime = timestamp;

      // FPS counter
      this._frameCount++;
      this._fpsTimer += dt;
      if (this._fpsTimer >= 1000) {
        this._fps = this._frameCount;
        this._frameCount = 0;
        this._fpsTimer = 0;
      }

      this._tick(dt);
      requestAnimationFrame(gameLoop);
    };
    requestAnimationFrame(gameLoop);
  },

  _tick(dt) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, DD.Config.CANVAS_W, DD.Config.CANVAS_H);

    if (DD.Scenes.current !== 'GAME') {
      // Scene UI rendering
      DD.Scenes.render(ctx);
      DD.Scenes.renderJoinInput(ctx);
      return;
    }

    // ---- GAME ACTIVE ----
    const state = this.state;
    if (!state) return;

    state.tick++;

    if (this.testMode || DD.Network.isHostFlag) {
      this._updateGame(state);
    } else {
      // Peer: poll local input then send to host
      const peerPlayer = DD.Entities.players[DD.Network.localRole];
      DD.Input.poll(peerPlayer ? peerPlayer.x : DD.Config.CANVAS_W / 2, peerPlayer ? peerPlayer.y : DD.Config.CANVAS_H / 2);
      DD.Network.sendInput(DD.Input.getState(), DD.Network.localRole);
    }

    DD.Utils.updateShake();
    DD.Particles.update();
    if (state.phaseBannerTimer > 0) state.phaseBannerTimer--;

    // Render
    this._render(ctx, state);
  },

  _updateGame(state) {
    // Poll local input
    const activeRole = this.testMode ? this.activeRole : (this.localRole || 'guardian');
    const p = DD.Entities.players[activeRole];
    DD.Input.poll(p ? p.x : DD.Config.CANVAS_W / 2, p ? p.y : DD.Config.CANVAS_H / 2);

    // Build inputs for all roles
    const inputs = {};

    if (this.testMode) {
      // In test mode: local input goes to active role, others get basic AI (dodge enemies)
      for (const role of ['guardian', 'technician', 'gunner']) {
        if (role === this.activeRole) {
          inputs[role] = DD.Input.getState();
        } else {
          inputs[role] = this._aiInput(role);
        }
      }
    } else {
      // Host: local is guardian, remotes are tech/gunner
      inputs['guardian'] = DD.Input.getState();
      for (const role of ['technician', 'gunner']) {
        inputs[role] = DD.Network.remoteInputs[role] || { moveX: 0, moveY: 0, aimAngle: 0, action1: false, action2: false };
      }
    }

    // Update players
    for (const role of ['guardian', 'technician', 'gunner']) {
      DD.Entities.updatePlayer(role, inputs[role], state);
    }

    // Update entities (enemies freeze during puzzles)
    DD.Entities.updateBullets();
    DD.Entities.updateAmmoCrates(state);
    DD.Entities.updateDownedPlayers(inputs);
    if (state.phase !== 'PUZZLE') {
      DD.Entities.updateEnemies();
      DD.Entities.checkCollisions(state);
    }

    // Drain platform energy
    const drainMap = {
      WAVE: DD.Config.PLATFORM_ENERGY_DRAIN,
      DESCENDING: DD.Config.PLATFORM_ENERGY_DRAIN_FAST,
      PUZZLE: DD.Config.PLATFORM_ENERGY_DRAIN_PUZZLE,
      PREP: 0,
    };
    const drain = drainMap[state.phase] || 0;
    state.platform.energy = Math.max(0, state.platform.energy - drain);

    // Phase state machine
    switch (state.phase) {
      case 'PREP':
        state.phaseTimer++;
        if (state.phaseTimer >= DD.Config.WAVE_PREP_TIME) {
          this._startWave(state);
        }
        break;

      case 'WAVE': {
        const result = DD.Waves.update(state);
        if (result === 'clear' || result === 'timeout') {
          const reward = DD.Waves.getCurrentReward();
          state.sharedPool.cores += reward;

          if (DD.Waves.shouldPuzzleAfter()) {
            this._startPuzzle(state);
          } else {
            this._startDescent(state);
          }
        }
        break;
      }

      case 'PUZZLE': {
        const localRoleForPuzzle = this.testMode ? this.activeRole : this.localRole;
        const result = DD.Puzzles.update(localRoleForPuzzle);
        if (result === 'solved') {
          state.sharedPool.cores += 2;
          // Reward: restore 15 energy
          state.platform.energy = Math.min(DD.Config.PLATFORM_ENERGY_MAX, state.platform.energy + 15);
          this._startDescent(state);
        } else if (result === 'timeout') {
          // Penalty: lose 15 energy
          state.platform.energy = Math.max(5, state.platform.energy - 15);
          this._startDescent(state);
        }
        break;
      }

      case 'DESCENDING':
        state.phaseTimer++;
        this._descentOffset = (state.phaseTimer / DD.Config.DESCENT_DURATION) * 30;
        state.depth += DD.Config.DEPTH_PER_DESCENT / DD.Config.DESCENT_DURATION;
        if (state.phaseTimer >= DD.Config.DESCENT_DURATION) {
          state.waveNum++;
          this._startWave(state);
        }
        break;
    }

    // Check game over conditions
    // Game over only when all are dead AND not downed (downed = still revivable)
    const allDead = ['guardian', 'technician', 'gunner'].every(r => {
      const p = DD.Entities.players[r];
      return !p || (!p.alive && !p.downed);
    });
    if (state.platform.energy <= 0 || allDead) {
      this._gameOver(state, false);
      return;
    }

    // Broadcast state to peers (host only)
    if (!this.testMode) {
      state.players = {
        guardian: DD.Entities.players.guardian,
        technician: DD.Entities.players.technician,
        gunner: DD.Entities.players.gunner,
      };
      state.enemies = DD.Entities.enemies;
      state.bullets = DD.Entities.bullets;
      DD.Network.broadcastGameState(state);
    }
  },

  // Simple AI: dodge nearest enemy, auto-act
  _aiInput(role) {
    const p = DD.Entities.players[role];
    if (!p || !p.alive) return { moveX: 0, moveY: 0, aimAngle: 0, action1: false, action2: false };

    // Find nearest enemy
    let nearestEnemy = null;
    let nearestDist = Infinity;
    for (const e of DD.Entities.enemies) {
      const d = DD.Utils.dist(p.x, p.y, e.x, e.y);
      if (d < nearestDist) { nearestDist = d; nearestEnemy = e; }
    }

    let moveX = 0, moveY = 0, aimAngle = p.aimAngle || 0, action1 = false, action2 = false;

    // Priority: revive downed teammate
    let nearestDowned = null, nearestDownedDist = Infinity;
    for (const r of ['guardian', 'technician', 'gunner']) {
      if (r === role) continue;
      const t = DD.Entities.players[r];
      if (!t || !t.downed) continue;
      const d = DD.Utils.dist(p.x, p.y, t.x, t.y);
      if (d < nearestDownedDist) { nearestDownedDist = d; nearestDowned = t; }
    }
    if (nearestDowned) {
      if (nearestDownedDist > DD.Config.PLAYER_RADIUS * 2 + 10) {
        const a = DD.Utils.angle(p.x, p.y, nearestDowned.x, nearestDowned.y);
        moveX = Math.cos(a); moveY = Math.sin(a);
      } else {
        action2 = true;  // Hold E to revive
      }
    }

    if (nearestEnemy) {
      // Flee if too close
      if (nearestDist < 80) {
        const fleeAngle = DD.Utils.angle(nearestEnemy.x, nearestEnemy.y, p.x, p.y);
        moveX = Math.cos(fleeAngle) * 0.8;
        moveY = Math.sin(fleeAngle) * 0.8;
      }
      aimAngle = DD.Utils.angle(p.x, p.y, nearestEnemy.x, nearestEnemy.y);

      // Role-specific actions
      if (role === 'guardian') {
        // Auto-shield toward nearest enemy
        action1 = nearestDist < 120;
      } else if (role === 'gunner') {
        // Auto-fire when enemy is in range
        action1 = nearestDist < 200;
      } else if (role === 'technician') {
        const term = DD.Entities.repairTerminal;
        const gunner = DD.Entities.players.gunner;
        const energyLow = this.state && this.state.platform.energy < 40;

        if (energyLow && term) {
          // Move to terminal and repair
          const dt = DD.Utils.dist(p.x, p.y, term.x, term.y);
          if (dt > DD.Config.TECH_REPAIR_RANGE) {
            const a = DD.Utils.angle(p.x, p.y, term.x, term.y);
            moveX = Math.cos(a); moveY = Math.sin(a);
          } else {
            action2 = true;
          }
        } else if (gunner && gunner.alive) {
          const dg = DD.Utils.dist(p.x, p.y, gunner.x, gunner.y);
          action1 = dg < DD.Config.TECH_RECHARGE_RANGE;
          if (!action1 && dg > 60) {
            const a = DD.Utils.angle(p.x, p.y, gunner.x, gunner.y);
            moveX = Math.cos(a) * 0.5;
            moveY = Math.sin(a) * 0.5;
          }
        }
      }
    }

    return { moveX, moveY, aimAngle, action1, action2 };
  },

  _startWave(state) {
    state.phase = 'WAVE';
    state.phaseTimer = 0;
    this._descentOffset = 0;
    DD.Waves.startWave(state.waveNum);
    this._showBanner(state, `WAVE ${state.waveNum}`);
    console.log('[Game] Wave', state.waveNum, 'started');
  },

  _startPuzzle(state) {
    state.phase = 'PUZZLE';
    state.phaseTimer = 0;
    DD.Puzzles.start();
    this._showBanner(state, 'PUZZLE!');
    console.log('[Game] Puzzle started');
  },

  _startDescent(state) {
    state.phase = 'DESCENDING';
    state.phaseTimer = 0;
    this._showBanner(state, 'DESCENDING...');
    console.log('[Game] Descending to wave', state.waveNum + 1);
  },

  _showBanner(state, text) {
    state.phaseBanner = text;
    state.phaseBannerTimer = 120;
  },

  _gameOver(state, victory) {
    DD.Scenes.gameOver.stats = {
      depth: state.depth,
      waveNum: state.waveNum,
      cores: state.sharedPool.cores,
      kills: this.killCount,
      victory: victory,
    };

    DD.Progression.recordRun(state.depth, state.sharedPool.cores, this.killCount, victory);

    if (!this.testMode) {
      DD.Network.sendGameOver(DD.Scenes.gameOver.stats);
    }

    DD.Scenes.switch('GAMEOVER');
    console.log('[Game] Game over. Victory:', victory, 'Depth:', state.depth);
  },

  _render(ctx, state) {
    const C = DD.Config;
    const shake = DD.Utils.shake;

    ctx.save();
    ctx.translate(shake.x, shake.y);

    // Background
    this._renderBackground(ctx, state);

    // Platform
    this._renderPlatform(ctx, state);

    // Entities
    if (state.phase === 'PUZZLE') {
      // Render puzzle overlay on platform
      const localRole = this.testMode ? this.activeRole : this.localRole;
      DD.Puzzles.render(ctx, localRole);
    }

    const techRepairing = DD.Entities.players.technician && DD.Entities.players.technician.repairing;
    DD.Entities.renderRepairTerminal(ctx, techRepairing);
    DD.Entities.renderAmmoCrates(ctx);
    DD.Entities.renderBullets(ctx);
    DD.Entities.renderEnemies(ctx);
    DD.Entities.renderPlayers(ctx);

    ctx.restore();

    // Particles (on top, no shake)
    DD.Particles.render(ctx);

    // HUD (no shake)
    const localRole = this.testMode ? this.activeRole : this.localRole;
    DD.HUD.render(ctx, state, localRole);
    DD.HUD.renderCores(ctx, state);
    DD.HUD.renderDebug(ctx, state, this._fps);

    // Mobile controls
    DD.Input.renderTouch(ctx);

    // Test mode indicator
    if (this.testMode) {
      ctx.fillStyle = C.COLOR.INTERACTIVE;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      const roleAbbr = { guardian: 'GD', technician: 'TC', gunner: 'GN' };
      ctx.fillText(`TEST [${roleAbbr[this.activeRole]}] 1/2/3`, C.CANVAS_W - 6, C.CANVAS_H - 48);
      ctx.textAlign = 'left';
    }
  },

  _renderBackground(ctx, state) {
    const C = DD.Config;

    // Deep black background
    ctx.fillStyle = C.COLOR.BG;
    ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);

    // Scrolling cave wall texture (simple lines)
    const scrollY = (state.depth * 0.5 + this._descentOffset * 20) % 80;
    ctx.strokeStyle = 'rgba(40, 40, 80, 0.4)';
    ctx.lineWidth = 1;
    for (let y = -scrollY; y < C.CANVAS_H; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(C.CANVAS_W, y + 15);
      ctx.stroke();
    }

    // Side walls (dark)
    ctx.fillStyle = 'rgba(10, 10, 20, 0.8)';
    ctx.fillRect(0, 0, C.PLATFORM_X - 2, C.CANVAS_H);
    ctx.fillRect(C.PLATFORM_X + C.PLATFORM_W + 2, 0, C.CANVAS_W - (C.PLATFORM_X + C.PLATFORM_W + 2), C.CANVAS_H);

    // Depth particles (floating dust)
    const t = state.tick * 0.5 + this._descentOffset * 10;
    for (let i = 0; i < 12; i++) {
      const x = ((Math.sin(i * 2.3 + t * 0.02) * 0.5 + 0.5) * C.PLATFORM_W) + C.PLATFORM_X;
      const y = ((i / 12 + t * 0.003) % 1) * C.CANVAS_H;
      ctx.fillStyle = 'rgba(80, 100, 180, 0.15)';
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  },

  _renderPlatform(ctx, state) {
    const C = DD.Config;
    const px = C.PLATFORM_X;
    const py = C.PLATFORM_Y + this._descentOffset;
    const pw = C.PLATFORM_W;
    const ph = C.PLATFORM_H;

    // Platform floor and walls
    ctx.fillStyle = C.COLOR.PLATFORM;
    ctx.fillRect(px, py, pw, ph);

    // Edge highlight
    ctx.strokeStyle = C.COLOR.PLATFORM_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);

    // Ambient light gradient from center
    const gx = px + pw / 2;
    const gy = py + ph / 2;
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, pw * 0.7);
    grad.addColorStop(0, 'rgba(255, 255, 200, 0.06)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, pw, ph);

    // Energy warning glow on edges when low
    const energyRatio = state.platform.energy / C.PLATFORM_ENERGY_MAX;
    if (energyRatio < 0.3) {
      const pulseAlpha = (Math.sin(state.tick * 0.1) * 0.5 + 0.5) * 0.3;
      ctx.strokeStyle = `rgba(255, 50, 50, ${pulseAlpha * (1 - energyRatio / 0.3)})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(px + 3, py + 3, pw - 6, ph - 6);
    }

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let gx = px + 40; gx < px + pw; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, py);
      ctx.lineTo(gx, py + ph);
      ctx.stroke();
    }
    for (let gy = py + 40; gy < py + ph; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(px, gy);
      ctx.lineTo(px + pw, gy);
      ctx.stroke();
    }
  },

  // ---- Public API ----

  startTestMode() {
    console.log('[Game] Starting test mode');
    this.testMode = true;
    this.activeRole = 'guardian';
    this.localRole = 'guardian';
    DD.Progression.applyToConfig();
    this.startGame();
  },

  startGame() {
    console.log('[Game] Starting game');
    DD.Progression.applyToConfig();
    DD.Entities.init();
    DD.Waves.init();
    DD.Puzzles.init();
    DD.Particles.clear();
    this.killCount = 0;
    this._descentOffset = 0;

    this.state = {
      tick: 0,
      depth: 0,
      phase: 'PREP',
      phaseTimer: 0,
      waveNum: 1,
      platform: {
        energy: DD.Config.PLATFORM_ENERGY_MAX,
      },
      players: {},  // references to DD.Entities.players
      enemies: [],  // references to DD.Entities.enemies
      bullets: [],
      sharedPool: {
        ammo: DD.Progression.getInitialAmmoPool(),
        cores: 0,
      },
      puzzle: null,
      phaseBanner: '',
      phaseBannerTimer: 0,
    };

    // Point state refs to entity arrays
    this.state.players.guardian = DD.Entities.players.guardian;
    this.state.players.technician = DD.Entities.players.technician;
    this.state.players.gunner = DD.Entities.players.gunner;
    this.state.enemies = DD.Entities.enemies;
    this.state.bullets = DD.Entities.bullets;

    // Spawn one starting ammo crate
    DD.Entities.spawnAmmoCrate();

    this._showBanner(this.state, 'GET READY!');
    DD.Scenes.switch('GAME');
  },

  // ---- Network message handling (peer side) ----

  _handleNetMessage(type, data) {
    switch (type) {
      case 'LOBBY_UPDATE':
        DD.Scenes.lobby.players = data.players || [];
        // If we're a peer, update our assigned role
        if (!DD.Network.isHostFlag && data.players) {
          const me = data.players.find(p => p.peerId !== 'host' &&
            DD.Network.peer && p.peerId === DD.Network.peer.id);
          if (me && me.role) DD.Network.localRole = me.role;
        }
        break;

      case 'GAME_START':
        this.localRole = DD.Network.localRole;
        this.testMode = false;
        this.startGame();
        break;

      case 'STATE':
        if (this.state) {
          // Apply remote state
          DD.Entities.applyState(data);
          this.state.phase = data.phase;
          this.state.depth = data.depth;
          this.state.waveNum = data.waveNum;
          if (data.platform) this.state.platform.energy = data.platform.energy;
          if (data.sharedPool) Object.assign(this.state.sharedPool, data.sharedPool);
          if (data.puzzle !== undefined) {
            DD.Puzzles.active = data.puzzle;
          }
          if (data.phaseBanner) {
            this.state.phaseBanner = data.phaseBanner;
            this.state.phaseBannerTimer = data.phaseBannerTimer;
          }
        }
        break;

      case 'GAME_OVER':
        DD.Scenes.gameOver.stats = data.stats;
        DD.Scenes.switch('GAMEOVER');
        break;

      case 'PLAY_AGAIN':
        // Host is restarting the game
        this.startGame();
        break;

      case 'REQUEST_PLAY_AGAIN':
        // A peer wants to restart — host triggers it for everyone
        if (DD.Network.isHostFlag) {
          DD.Network.broadcast({ type: 'PLAY_AGAIN' });
          this.startGame();
        }
        break;
    }
  },
};

// Boot on load
window.addEventListener('load', () => {
  console.log('[Deep Dive] Booting...');
  DD.Game.init();
});
