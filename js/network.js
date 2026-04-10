window.DD = window.DD || {};

DD.Network = {
  peer: null,
  connections: [],    // Host: array of DataConnections
  hostConn: null,     // Peer: connection to host
  isHostFlag: false,
  roomCode: '',
  localRole: 'guardian',
  roles: {},          // { peerId: 'technician', ... }
  remoteInputs: {},   // { 'technician': {moveX,...}, 'gunner': {...} }

  _broadcastTick: 0,
  onMessage: null,    // callback(type, data)

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  },

  hostGame(onReady) {
    this.roomCode = this.generateRoomCode();
    this.isHostFlag = true;
    this.localRole = 'guardian';

    console.log('[Net] Creating peer for room:', this.roomCode);
    this.peer = new Peer(DD.Config.PEER_PREFIX + this.roomCode, {
      debug: 1,
    });

    this.peer.on('open', (id) => {
      console.log('[Net] Host peer open:', id, '| Room:', this.roomCode);
      if (onReady) onReady(this.roomCode);
    });

    this.peer.on('connection', (conn) => {
      console.log('[Net] New peer connection from:', conn.peer);
      this.connections.push(conn);

      conn.on('open', () => {
        // Start unassigned, peer will pick their role
        this.roles[conn.peer] = null;
        console.log('[Net] Peer connected:', conn.peer, '- awaiting role selection');

        // Send current lobby state so peer can see who's there
        this._sendLobbyState(conn);
      });

      conn.on('data', (data) => {
        if (data.type === 'INPUT') {
          this.remoteInputs[data.role] = data;
        } else if (data.type === 'PICK_ROLE') {
          // Peer chose a role - validate it's not taken
          const taken = Object.entries(this.roles)
            .filter(([pid]) => pid !== conn.peer)
            .map(([, r]) => r);
          if (!data.role || !taken.includes(data.role)) {
            this.roles[conn.peer] = data.role;
            console.log('[Net] Peer', conn.peer, 'picked role:', data.role);
            this._broadcastAndUpdateLobby();
          } else {
            conn.send({ type: 'ROLE_TAKEN', role: data.role });
          }
        } else if (this.onMessage) {
          this.onMessage(data.type, data);
        }
      });

      conn.on('close', () => {
        console.log('[Net] Peer disconnected:', conn.peer);
        // Clear their remote input so their role falls back to AI
        const role = this.roles[conn.peer];
        if (role) delete this.remoteInputs[role];
        delete this.roles[conn.peer];
        this.connections = this.connections.filter(c => c !== conn);
        this._broadcastAndUpdateLobby();
      });

      conn.on('error', (err) => {
        console.error('[Net] Connection error:', err);
      });
    });

    this.peer.on('error', (err) => {
      console.error('[Net] Peer error:', err);
    });
  },

  joinGame(roomCode, onReady) {
    this.roomCode = roomCode.toUpperCase();
    this.isHostFlag = false;
    this.localRole = null;  // Start with no role, pick in lobby

    console.log('[Net] Joining room:', this.roomCode);
    this.peer = new Peer({ debug: 1 });

    this.peer.on('open', () => {
      console.log('[Net] Peer open, connecting to host...');
      this.hostConn = this.peer.connect(DD.Config.PEER_PREFIX + this.roomCode, {
        reliable: true,
      });

      this.hostConn.on('open', () => {
        console.log('[Net] Connected to host');
        // Init lobby with no players until LOBBY_UPDATE arrives
        DD.Scenes.lobby.players = [];
        if (onReady) onReady();
      });

      this.hostConn.on('data', (data) => {
        if (this.onMessage) {
          this.onMessage(data.type, data);
        }
      });

      this.hostConn.on('close', () => {
        console.warn('[Net] Disconnected from host');
      });

      this.hostConn.on('error', (err) => {
        console.error('[Net] Host conn error:', err);
      });
    });

    this.peer.on('error', (err) => {
      console.error('[Net] Peer error:', err);
    });
  },

  getLobbyInfo() {
    // Build the full player list: host + peers
    const players = [{ peerId: 'host', role: this.localRole }];
    for (const [peerId, role] of Object.entries(this.roles)) {
      players.push({ peerId, role });
    }
    return { type: 'LOBBY_UPDATE', players };
  },

  _sendLobbyState(conn) {
    if (conn.open) conn.send(this.getLobbyInfo());
  },

  _broadcastAndUpdateLobby() {
    const info = this.getLobbyInfo();
    // Broadcast to peers
    this.broadcast(info);
    // Also update host's own UI
    if (DD.Game && DD.Game._handleNetMessage) {
      DD.Game._handleNetMessage('LOBBY_UPDATE', info);
    }
  },

  pickRole(role) {
    if (this.isHostFlag) {
      // Host picks locally
      const taken = Object.values(this.roles);
      if (!role || !taken.includes(role)) {
        this.localRole = role;
        this._broadcastAndUpdateLobby();
      }
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send({ type: 'PICK_ROLE', role });
    }
  },

  broadcast(data) {
    for (const conn of this.connections) {
      if (conn.open) conn.send(data);
    }
  },

  // Send full game state to each peer (puzzle solution only to technician)
  broadcastGameState(state) {
    this._broadcastTick++;
    if (this._broadcastTick < DD.Config.STATE_BROADCAST_INTERVAL) return;
    this._broadcastTick = 0;

    for (const conn of this.connections) {
      if (!conn.open) continue;
      const role = this.roles[conn.peer];

      const snapshot = {
        type: 'STATE',
        tick: state.tick,
        players: {
          guardian: this._serializePlayer(state.players.guardian),
          technician: this._serializePlayer(state.players.technician),
          gunner: this._serializePlayer(state.players.gunner),
        },
        enemies: state.enemies.map(e => ({
          id: e.id, type: e.type, x: e.x, y: e.y,
          hp: e.hp, hpMax: e.hpMax, radius: e.radius,
          speed: e.speed, color: e.color, damage: e.damage,
          state: e.state, timer: e.timer, dashAngle: e.dashAngle,
        })),
        bullets: state.bullets.map(b => ({
          id: b.id, x: b.x, y: b.y, dx: b.dx, dy: b.dy,
          radius: b.radius, damage: b.damage, ttl: b.ttl,
        })),
        phase: state.phase,
        depth: state.depth,
        waveNum: state.waveNum,
        platform: { energy: state.platform.energy },
        sharedPool: { ...state.sharedPool },
        puzzle: DD.Puzzles.getStateForRole(role),
        phaseBanner: state.phaseBanner,
        phaseBannerTimer: state.phaseBannerTimer,
      };

      conn.send(snapshot);
    }
  },

  _serializePlayer(p) {
    if (!p) return null;
    return {
      x: p.x, y: p.y, hp: p.hp, hpMax: p.hpMax, alive: p.alive,
      invulnFrames: p.invulnFrames,
      shieldAngle: p.shieldAngle, shieldActive: p.shieldActive, shieldEnergy: p.shieldEnergy, shieldDepleted: p.shieldDepleted,
      recharging: p.recharging,
      ammo: p.ammo, aimAngle: p.aimAngle, fireTimer: p.fireTimer,
    };
  },

  sendInput(inputState, role) {
    if (this.isHostFlag || !this.hostConn || !this.hostConn.open) return;
    this.hostConn.send({
      type: 'INPUT',
      role: role || this.localRole,
      ...inputState,
    });
  },

  startGame() {
    // Host tells all peers to start
    this.broadcast({ type: 'GAME_START' });
  },

  sendGameOver(stats) {
    this.broadcast({ type: 'GAME_OVER', stats });
  },

  destroy() {
    for (const conn of this.connections) conn.close();
    if (this.hostConn) this.hostConn.close();
    if (this.peer) this.peer.destroy();
    this.peer = null;
    this.connections = [];
    this.hostConn = null;
    this.roles = {};
    this.remoteInputs = {};
    this.isHostFlag = false;
  },
};
