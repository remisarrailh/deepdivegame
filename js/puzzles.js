window.DD = window.DD || {};

DD.Puzzles = {
  active: null,   // current puzzle object or null
  timer: 0,

  init() {
    this.active = null;
    this.timer = 0;
  },

  // Generate a random puzzle
  generate() {
    const types = ['cables', 'plates'];
    const type = DD.Utils.randPick(types);

    if (type === 'cables') {
      return this._genCables();
    } else {
      return this._genPlates();
    }
  },

  _genCables() {
    const C = DD.Config;
    const colors = ['#ff4444', '#44ff44', '#4444ff'];
    const sockets = [0, 1, 2];
    // Shuffle sockets for the solution
    for (let i = sockets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sockets[i], sockets[j]] = [sockets[j], sockets[i]];
    }

    const cx = C.PLATFORM_X + C.PLATFORM_W / 2;
    const cy = C.PLATFORM_Y + C.PLATFORM_H / 2;

    return {
      type: 'cables',
      timeLimit: 30 * 60,  // 30 seconds in frames
      cables: [
        { color: colors[0], correctSocket: sockets[0], placed: -1, x: cx - 80, y: cy - 40, origX: cx - 80, origY: cy - 40 },
        { color: colors[1], correctSocket: sockets[1], placed: -1, x: cx,       y: cy - 40, origX: cx,       origY: cy - 40 },
        { color: colors[2], correctSocket: sockets[2], placed: -1, x: cx + 80,  y: cy - 40, origX: cx + 80,  origY: cy - 40 },
      ],
      sockets: [
        { x: cx - 80, y: cy + 60 },
        { x: cx, y: cy + 60 },
        { x: cx + 80, y: cy + 60 },
      ],
      // Guardian/Gunner drag state
      dragging: -1,  // index of cable being dragged, or -1
      solved: false,
    };
  },

  _genPlates() {
    const C = DD.Config;
    const cx = C.PLATFORM_X + C.PLATFORM_W / 2;
    const cy = C.PLATFORM_Y + C.PLATFORM_H / 2;
    const roles = ['guardian', 'technician', 'gunner'];
    // Shuffle roles
    const shuffled = [...roles];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return {
      type: 'plates',
      timeLimit: 20 * 60,
      plates: [
        { x: cx - 100, y: cy, correctRole: shuffled[0], activated: false, radius: 25 },
        { x: cx, y: cy - 60, correctRole: shuffled[1], activated: false, radius: 25 },
        { x: cx + 100, y: cy, correctRole: shuffled[2], activated: false, radius: 25 },
      ],
      solved: false,
    };
  },

  start() {
    this.active = this.generate();
    this.timer = 0;
    console.log('[Puzzles] Started:', this.active.type);
  },

  update(localRole) {
    if (!this.active || this.active.solved) return 'solved';

    this.timer++;
    if (this.timer >= this.active.timeLimit) {
      return 'timeout';
    }

    if (this.active.type === 'plates') {
      this._updatePlates();
    }

    if (this.active.type === 'cables') {
      this._updateCables(localRole);
    }

    return this.active.solved ? 'solved' : 'active';
  },

  _updatePlates() {
    const puzzle = this.active;
    let allActivated = true;

    for (const plate of puzzle.plates) {
      const p = DD.Entities.players[plate.correctRole];
      if (p && p.alive) {
        plate.activated = DD.Utils.dist(p.x, p.y, plate.x, plate.y) < plate.radius + p.radius;
      } else {
        plate.activated = false;
      }
      if (!plate.activated) allActivated = false;
    }

    if (allActivated) {
      puzzle.solved = true;
      DD.Particles.corePickup(DD.Config.CANVAS_W / 2, DD.Config.CANVAS_H / 2);
      DD.Utils.triggerShake(4, 10);
    }
  },

  _updateCables(localRole) {
    const puzzle = this.active;

    // In test mode or as non-technician: interact with cables
    // Cable dragging is simplified: action1 near a cable picks it up,
    // releasing near a socket places it
    if (DD.Game.testMode || localRole !== 'technician') {
      const activeRole = DD.Game.testMode ? DD.Game.activeRole : localRole;
      const p = DD.Entities.players[activeRole];
      if (!p || !p.alive) return;

      if (DD.Input.action1) {
        if (puzzle.dragging === -1) {
          // Try to pick up a cable
          for (let i = 0; i < puzzle.cables.length; i++) {
            const c = puzzle.cables[i];
            if (c.placed !== -1) continue;  // already placed
            if (DD.Utils.dist(p.x, p.y, c.x, c.y) < 40) {
              puzzle.dragging = i;
              break;
            }
          }
        } else {
          // Move cable with player
          puzzle.cables[puzzle.dragging].x = p.x;
          puzzle.cables[puzzle.dragging].y = p.y;
        }
      } else if (puzzle.dragging !== -1) {
        // Release: check if near a socket
        const cable = puzzle.cables[puzzle.dragging];
        let snapped = false;
        for (let si = 0; si < puzzle.sockets.length; si++) {
          const s = puzzle.sockets[si];
          // Skip socket already occupied by another cable
          const occupied = puzzle.cables.some((c, ci) => ci !== puzzle.dragging && c.placed === si);
          if (occupied) continue;
          if (DD.Utils.dist(cable.x, cable.y, s.x, s.y) < 35) {
            cable.placed = si;
            cable.x = s.x;
            cable.y = s.y;
            snapped = true;

            if (cable.placed !== cable.correctSocket) {
              // Wrong socket: 5-second penalty, reset cable to origin
              this.timer = Math.min(this.timer + 5 * 60, this.active.timeLimit - 30);
              cable.placed = -1;
              cable.x = cable.origX;
              cable.y = cable.origY;
              DD.Utils.triggerShake(3, 8);
            }
            break;
          }
        }
        if (!snapped) {
          // Dropped in empty space: return to origin
          cable.x = cable.origX;
          cable.y = cable.origY;
        }
        puzzle.dragging = -1;

        // Check if all placed correctly
        const allCorrect = puzzle.cables.every(c => c.placed === c.correctSocket);
        if (allCorrect) {
          puzzle.solved = true;
          DD.Particles.corePickup(DD.Config.CANVAS_W / 2, DD.Config.CANVAS_H / 2);
          DD.Utils.triggerShake(4, 10);
        }
      }
    }
  },

  render(ctx, localRole) {
    if (!this.active) return;
    const puzzle = this.active;
    const C = DD.Config;
    const isTech = localRole === 'technician' || DD.Game.testMode;

    // Dim overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(C.PLATFORM_X, C.PLATFORM_Y, C.PLATFORM_W, C.PLATFORM_H);

    // Title
    ctx.fillStyle = C.COLOR.INTERACTIVE;
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      puzzle.type === 'cables' ? '-- CONNECT CABLES --' : '-- STAND ON PLATES --',
      C.CANVAS_W / 2, C.PLATFORM_Y + 30
    );

    // Timer bar
    const timeRatio = 1 - this.timer / puzzle.timeLimit;
    const barW = 200;
    ctx.fillStyle = C.COLOR.HP_BAR_BG;
    ctx.fillRect(C.CANVAS_W / 2 - barW / 2, C.PLATFORM_Y + 40, barW, 6);
    ctx.fillStyle = timeRatio > 0.3 ? C.COLOR.ENERGY_BAR : C.COLOR.DANGER;
    ctx.fillRect(C.CANVAS_W / 2 - barW / 2, C.PLATFORM_Y + 40, barW * timeRatio, 6);

    if (puzzle.type === 'cables') {
      this._renderCables(ctx, isTech);
    } else if (puzzle.type === 'plates') {
      this._renderPlates(ctx, isTech);
    }

    ctx.textAlign = 'left';
  },

  _renderCables(ctx, isTech) {
    const puzzle = this.active;
    const C = DD.Config;

    // Draw sockets
    for (let i = 0; i < puzzle.sockets.length; i++) {
      const s = puzzle.sockets[i];
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 18, 0, Math.PI * 2);
      ctx.stroke();

      // Socket number
      ctx.fillStyle = C.COLOR.TEXT_DIM;
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText((i + 1).toString(), s.x, s.y + 5);

      // Technician sees which color goes where
      if (isTech) {
        const correctCable = puzzle.cables.find(c => c.correctSocket === i);
        if (correctCable) {
          ctx.fillStyle = correctCable.color;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    // Draw cables
    for (let i = 0; i < puzzle.cables.length; i++) {
      const c = puzzle.cables[i];
      ctx.fillStyle = c.color;
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 4;

      // Cable body
      ctx.shadowColor = c.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      ctx.fillStyle = '#000';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String.fromCharCode(65 + i), c.x, c.y + 4);  // A, B, C
    }
  },

  _renderPlates(ctx, isTech) {
    const puzzle = this.active;
    const C = DD.Config;
    const roleColors = {
      guardian: C.COLOR.GUARDIAN,
      technician: C.COLOR.TECHNICIAN,
      gunner: C.COLOR.GUNNER,
    };

    for (const plate of puzzle.plates) {
      // Plate circle
      ctx.strokeStyle = plate.activated ? '#44ff44' : '#666';
      ctx.lineWidth = plate.activated ? 4 : 2;
      ctx.beginPath();
      ctx.arc(plate.x, plate.y, plate.radius, 0, Math.PI * 2);
      ctx.stroke();

      if (plate.activated) {
        ctx.fillStyle = 'rgba(68, 255, 68, 0.2)';
        ctx.fill();
      }

      // Technician sees which role belongs where
      if (isTech) {
        ctx.fillStyle = roleColors[plate.correctRole] || '#fff';
        ctx.globalAlpha = 0.6;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(plate.correctRole.charAt(0).toUpperCase(), plate.x, plate.y + 4);
        ctx.globalAlpha = 1;
      }
    }
  },

  // Networking: get puzzle state stripped for non-technician
  getStateForRole(role) {
    if (!this.active) return null;
    if (role === 'technician') return this.active;

    // Strip solution info
    const puzzle = JSON.parse(JSON.stringify(this.active));
    if (puzzle.type === 'cables') {
      for (const c of puzzle.cables) {
        delete c.correctSocket;
      }
    } else if (puzzle.type === 'plates') {
      for (const p of puzzle.plates) {
        delete p.correctRole;
      }
    }
    return puzzle;
  },
};
