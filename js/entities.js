window.DD = window.DD || {};

DD.Entities = {
  players: {},
  enemies: [],
  bullets: [],
  ammoCrates: [],        // pickups on the platform
  _enemyIdCounter: 0,
  _bulletIdCounter: 0,
  _crateIdCounter: 0,
  _crateSpawnTimer: 0,

  // Repair terminal (fixed position)
  repairTerminal: null,

  init() {
    const C = DD.Config;
    this.players = {
      guardian:   this._createPlayer('guardian',   C.PLATFORM_X + C.PLATFORM_W * 0.3, C.PLATFORM_Y + C.PLATFORM_H * 0.5),
      technician: this._createPlayer('technician', C.PLATFORM_X + C.PLATFORM_W * 0.5, C.PLATFORM_Y + C.PLATFORM_H * 0.5),
      gunner:     this._createPlayer('gunner',     C.PLATFORM_X + C.PLATFORM_W * 0.7, C.PLATFORM_Y + C.PLATFORM_H * 0.5),
    };
    this.enemies = [];
    this.bullets = [];
    this.ammoCrates = [];
    this._enemyIdCounter = 0;
    this._bulletIdCounter = 0;
    this._crateIdCounter = 0;
    this._crateSpawnTimer = 0;

    const cx = C.PLATFORM_X + C.PLATFORM_W / 2 + C.REPAIR_TERMINAL_OFFSET_X;
    const cy = C.PLATFORM_Y + C.PLATFORM_H / 2 + C.REPAIR_TERMINAL_OFFSET_Y;
    this.repairTerminal = { x: cx, y: cy, radius: 20, repairing: false };
  },

  _createPlayer(role, x, y) {
    const C = DD.Config;
    const p = {
      role: role,
      x: x,
      y: y,
      hp: C[role === 'guardian' ? 'GUARDIAN_HP' : role === 'technician' ? 'TECH_HP' : 'GUNNER_HP'],
      hpMax: C[role === 'guardian' ? 'GUARDIAN_HP' : role === 'technician' ? 'TECH_HP' : 'GUNNER_HP'],
      alive: true,
      downed: false,        // KO but revivable
      downedTimer: 0,       // unused (no timer, KO is permanent until revived)
      reviveProgress: 0,    // 0-1, fills up when someone revives
      radius: C.PLAYER_RADIUS,
      invulnFrames: 0,
    };

    if (role === 'guardian') {
      p.shieldAngle = 0;
      p.shieldActive = false;
      p.shieldEnergy = C.GUARDIAN_SHIELD_ENERGY_MAX;
    }
    if (role === 'technician') {
      p.recharging = false;
    }
    if (role === 'gunner') {
      p.ammo = C.GUNNER_AMMO_MAX;
      p.aimAngle = -Math.PI / 2;  // Up
      p.fireTimer = 0;
    }
    return p;
  },

  // --- Player movement & actions ---

  updatePlayer(role, input, state) {
    const C = DD.Config;
    const p = this.players[role];
    if (!p || !p.alive) return;

    // Movement
    p.x += input.moveX * C.PLAYER_SPEED;
    p.y += input.moveY * C.PLAYER_SPEED;

    // Clamp to platform
    const clamped = DD.Utils.clampToPlatform(p.x, p.y, p.radius);
    p.x = clamped.x;
    p.y = clamped.y;

    // Invulnerability countdown
    if (p.invulnFrames > 0) p.invulnFrames--;

    // Role-specific logic
    if (role === 'guardian') {
      p.shieldAngle = input.aimAngle;
      p.shieldActive = input.action1 && p.shieldEnergy > 0;
      if (p.shieldActive) {
        p.shieldEnergy = Math.max(0, p.shieldEnergy - C.GUARDIAN_SHIELD_DRAIN);
      } else {
        p.shieldEnergy = Math.min(C.GUARDIAN_SHIELD_ENERGY_MAX, p.shieldEnergy + C.GUARDIAN_SHIELD_REGEN);
      }
    }

    if (role === 'technician') {
      const gunner = this.players.gunner;
      p.recharging = false;
      p.repairing = false;

      if (input.action2) {
        // E = repair terminal (priority over recharge)
        const term = this.repairTerminal;
        if (term && DD.Utils.dist(p.x, p.y, term.x, term.y) < C.TECH_REPAIR_RANGE + p.radius) {
          const canRepair = state.platform.energy < C.PLATFORM_ENERGY_MAX;
          if (canRepair) {
            p.repairing = true;
            state.platform.energy = Math.min(C.PLATFORM_ENERGY_MAX, state.platform.energy + C.TECH_REPAIR_RATE);
            // Spark effects on terminal
            if (Math.random() < 0.3) DD.Particles.sparks(term.x + (Math.random()-0.5)*20, term.y + (Math.random()-0.5)*10, 2);
          }
        }
      } else if (input.action1) {
        // Space/click = recharge gunner ammo
        if (gunner && gunner.alive) {
          const d = DD.Utils.dist(p.x, p.y, gunner.x, gunner.y);
          if (d < C.TECH_RECHARGE_RANGE && state.sharedPool.ammo > 0 && gunner.ammo < C.GUNNER_AMMO_MAX) {
            p.recharging = true;
            const amount = Math.min(C.TECH_RECHARGE_RATE, state.sharedPool.ammo, C.GUNNER_AMMO_MAX - gunner.ammo);
            gunner.ammo = Math.min(C.GUNNER_AMMO_MAX, gunner.ammo + amount);
            state.sharedPool.ammo = Math.max(0, state.sharedPool.ammo - amount);
            DD.Particles.rechargeBeam(p.x, p.y, gunner.x, gunner.y);
          }
        }
      }
    }

    if (role === 'gunner') {
      p.aimAngle = input.aimAngle;
      if (p.fireTimer > 0) p.fireTimer--;
      if (input.action1 && p.fireTimer <= 0 && p.ammo >= 1) {
        this.fireBullet(p.x, p.y, p.aimAngle);
        p.ammo = Math.max(0, p.ammo - 1);
        p.fireTimer = C.GUNNER_FIRE_COOLDOWN;
      }
    }
  },

  // Called every frame on the host to tick downed timers and handle revives
  updateDownedPlayers(inputs) {
    const C = DD.Config;
    const REVIVE_RANGE = 40;
    const REVIVE_SPEED = 1 / (60 * 4);  // 4 seconds to fully revive

    for (const role of ['guardian', 'technician', 'gunner']) {
      const p = this.players[role];
      if (!p || !p.downed) continue;

      // Check if any alive player is nearby holding E (action2)
      let beingRevived = false;
      for (const rescuerRole of ['guardian', 'technician', 'gunner']) {
        if (rescuerRole === role) continue;
        const r = this.players[rescuerRole];
        if (!r || !r.alive) continue;
        const inp = inputs ? inputs[rescuerRole] : null;
        if (!inp || !inp.action2) continue;
        if (DD.Utils.dist(r.x, r.y, p.x, p.y) < REVIVE_RANGE + p.radius) {
          beingRevived = true;
          p.reviveProgress += REVIVE_SPEED;
          // Particle feedback
          if (Math.random() < 0.3) DD.Particles.rechargeBeam(r.x, r.y, p.x, p.y);
          break;
        }
      }

      if (!beingRevived) {
        // Decay slowly if no one is reviving
        p.reviveProgress = Math.max(0, p.reviveProgress - REVIVE_SPEED * 0.3);
      }

      if (p.reviveProgress >= 1) {
        // Revived!
        p.downed = false;
        p.alive = true;
        p.hp = Math.ceil(p.hpMax / 2);
        p.reviveProgress = 0;
        p.invulnFrames = 120;
        DD.Particles.explosion(p.x, p.y, C.COLOR.HP_BAR, 15);
        DD.Utils.triggerShake(3, 6);
        console.log(`[Entities] ${role} revived!`);
      }
    }
  },

  fireBullet(x, y, angle) {
    const C = DD.Config;
    this.bullets.push({
      id: ++this._bulletIdCounter,
      x: x + Math.cos(angle) * 20,
      y: y + Math.sin(angle) * 20,
      dx: Math.cos(angle) * C.GUNNER_BULLET_SPEED,
      dy: Math.sin(angle) * C.GUNNER_BULLET_SPEED,
      radius: C.GUNNER_BULLET_RADIUS,
      damage: C.GUNNER_BULLET_DAMAGE,
      ttl: 120,
    });
  },

  // --- Ammo Crates ---

  spawnAmmoCrate(x, y) {
    const C = DD.Config;
    if (!x || !y) {
      // Random position on platform, away from edges
      const margin = 50;
      x = DD.Utils.randFloat(C.PLATFORM_X + margin, C.PLATFORM_X + C.PLATFORM_W - margin);
      y = DD.Utils.randFloat(C.PLATFORM_Y + margin, C.PLATFORM_Y + C.PLATFORM_H - margin);
    }
    this.ammoCrates.push({
      id: ++this._crateIdCounter,
      x, y,
      radius: C.AMMO_CRATE_RADIUS,
      value: C.AMMO_CRATE_VALUE,
      pulse: Math.random() * Math.PI * 2,  // random phase for animation
    });
    console.log('[Entities] Ammo crate spawned at', Math.round(x), Math.round(y));
  },

  updateAmmoCrates(state) {
    const C = DD.Config;

    // Auto-spawn crates over time
    this._crateSpawnTimer++;
    if (this._crateSpawnTimer >= C.AMMO_CRATE_SPAWN_INTERVAL && this.ammoCrates.length < 3) {
      this._crateSpawnTimer = 0;
      this.spawnAmmoCrate();
    }

    // Check pickup by any player
    for (let ci = this.ammoCrates.length - 1; ci >= 0; ci--) {
      const crate = this.ammoCrates[ci];
      for (const role of ['guardian', 'technician', 'gunner']) {
        const p = this.players[role];
        if (!p || !p.alive) continue;
        if (DD.Utils.circleCollide(p.x, p.y, p.radius, crate.x, crate.y, crate.radius)) {
          state.sharedPool.ammo += crate.value;
          DD.Particles.corePickup(crate.x, crate.y);
          this.ammoCrates.splice(ci, 1);
          console.log('[Entities] Ammo crate picked up, pool:', state.sharedPool.ammo);
          break;
        }
      }
    }
  },

  // --- Enemies ---

  spawnEnemy(type, x, y) {
    const C = DD.Config;
    if (this.enemies.length >= C.ENEMY_MAX) return;

    const defs = {
      drone:   { hp: C.DRONE_HP,   radius: C.DRONE_RADIUS,   speed: C.DRONE_SPEED,   color: C.COLOR.DRONE,   damage: C.DRONE_DAMAGE },
      charger: { hp: C.CHARGER_HP, radius: C.CHARGER_RADIUS, speed: C.CHARGER_SPEED, color: C.COLOR.CHARGER, damage: C.CHARGER_DAMAGE },
      orb:     { hp: C.ORB_HP,     radius: C.ORB_RADIUS,     speed: C.ORB_SPEED,     color: C.COLOR.ORB,     damage: 1 },
      swarm:   { hp: C.SWARM_HP,   radius: C.SWARM_RADIUS,   speed: C.SWARM_SPEED,   color: C.COLOR.SWARM,   damage: 1 },
      tank:    { hp: C.TANK_HP,    radius: C.TANK_RADIUS,     speed: C.TANK_SPEED,    color: C.COLOR.TANK,    damage: C.TANK_DAMAGE },
    };

    const def = defs[type];
    if (!def) { console.warn('[Entities] Unknown enemy type:', type); return; }

    this.enemies.push({
      id: ++this._enemyIdCounter,
      type: type,
      x: x,
      y: y,
      hp: def.hp,
      hpMax: def.hp,
      radius: def.radius,
      speed: def.speed,
      color: def.color,
      damage: def.damage,
      // AI state
      state: 'approach',  // 'approach' | 'dash' | 'orbit' | 'dead'
      timer: 0,
      dashAngle: 0,
    });
  },

  updateEnemies() {
    const C = DD.Config;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      // Find nearest alive player
      let target = this._nearestPlayer(e.x, e.y);
      if (!target) continue;

      switch (e.type) {
        case 'drone':
        case 'swarm': {
          // Move toward target
          const a = DD.Utils.angle(e.x, e.y, target.x, target.y);
          e.x += Math.cos(a) * e.speed;
          e.y += Math.sin(a) * e.speed;
          break;
        }
        case 'charger': {
          e.timer++;
          if (e.state === 'approach') {
            // Slow approach, then dash
            const a = DD.Utils.angle(e.x, e.y, target.x, target.y);
            e.x += Math.cos(a) * e.speed;
            e.y += Math.sin(a) * e.speed;
            if (e.timer > 90) {
              e.state = 'dash';
              e.dashAngle = DD.Utils.angle(e.x, e.y, target.x, target.y);
              e.timer = 0;
            }
          } else if (e.state === 'dash') {
            e.x += Math.cos(e.dashAngle) * C.CHARGER_DASH_SPEED;
            e.y += Math.sin(e.dashAngle) * C.CHARGER_DASH_SPEED;
            if (e.timer > 30) {
              e.state = 'approach';
              e.timer = 0;
            }
          }
          break;
        }
        case 'orb': {
          // Orbit around platform center
          e.timer++;
          const cx = C.PLATFORM_X + C.PLATFORM_W / 2;
          const cy = C.PLATFORM_Y + C.PLATFORM_H / 2;
          const orbitAngle = e.timer * 0.015 + e.id * 1.5;
          const orbitRadius = 180;
          e.x = cx + Math.cos(orbitAngle) * orbitRadius;
          e.y = cy + Math.sin(orbitAngle) * orbitRadius;
          break;
        }
        case 'tank': {
          const a = DD.Utils.angle(e.x, e.y, target.x, target.y);
          e.x += Math.cos(a) * e.speed;
          e.y += Math.sin(a) * e.speed;
          break;
        }
      }
    }
  },

  _nearestPlayer(x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const role of ['guardian', 'technician', 'gunner']) {
      const p = this.players[role];
      if (!p || !p.alive) continue;
      const d = DD.Utils.dist(x, y, p.x, p.y);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  },

  // --- Bullets ---

  updateBullets() {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.dx;
      b.y += b.dy;
      b.ttl--;
      if (b.ttl <= 0 || b.x < 0 || b.x > DD.Config.CANVAS_W || b.y < 0 || b.y > DD.Config.CANVAS_H) {
        this.bullets.splice(i, 1);
      }
    }
  },

  // --- Collisions ---

  checkCollisions(state) {
    const C = DD.Config;

    // Bullets vs Enemies
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
        const e = this.enemies[ei];
        if (DD.Utils.circleCollide(b.x, b.y, b.radius, e.x, e.y, e.radius)) {
          e.hp -= b.damage;
          DD.Particles.sparks(b.x, b.y, 4);
          this.bullets.splice(bi, 1);
          if (e.hp <= 0) {
            DD.Particles.enemyDeath(e.x, e.y, e.color);
            DD.Utils.triggerShake(3, 5);
            state.sharedPool.cores += 1;
            if (DD.Game) DD.Game.killCount++;
            // Tank and orb drop ammo crates
            if ((e.type === 'tank' || e.type === 'orb') && this.ammoCrates.length < 4) {
              this.spawnAmmoCrate(e.x, e.y);
            }
            this.enemies.splice(ei, 1);
          }
          break;
        }
      }
    }

    // Enemies vs Players
    for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
      const e = this.enemies[ei];

      // Check shield first
      const g = this.players.guardian;
      if (g && g.alive && g.shieldActive) {
        if (DD.Utils.circleCollide(e.x, e.y, e.radius, g.x, g.y, C.GUARDIAN_SHIELD_RADIUS)) {
          const angleToEnemy = DD.Utils.angle(g.x, g.y, e.x, e.y);
          if (DD.Utils.angleInArc(angleToEnemy, g.shieldAngle, C.GUARDIAN_SHIELD_ARC / 2)) {
            // Deflect enemy
            const pushAngle = angleToEnemy;
            e.x += Math.cos(pushAngle) * 8;
            e.y += Math.sin(pushAngle) * 8;
            DD.Particles.shieldHit(
              g.x + Math.cos(angleToEnemy) * C.GUARDIAN_SHIELD_RADIUS,
              g.y + Math.sin(angleToEnemy) * C.GUARDIAN_SHIELD_RADIUS,
              angleToEnemy
            );
            g.shieldEnergy = Math.max(0, g.shieldEnergy - 5);
            continue;
          }
        }
      }

      // Enemies vs each player
      for (const role of ['guardian', 'technician', 'gunner']) {
        const p = this.players[role];
        if (!p || p.invulnFrames > 0) continue;
        // Downed players can still be hit (finisher) but alive=false so skip
        if (!p.alive) continue;
        if (DD.Utils.circleCollide(e.x, e.y, e.radius, p.x, p.y, p.radius)) {
          p.hp -= e.damage;
          p.invulnFrames = 60;
          DD.Particles.playerHit(p.x, p.y);

          // Push enemy back
          const pushAngle = DD.Utils.angle(p.x, p.y, e.x, e.y);
          e.x += Math.cos(pushAngle) * 15;
          e.y += Math.sin(pushAngle) * 15;

          if (p.hp <= 0) {
            // Go downed instead of instantly dead
            p.alive = false;
            p.downed = true;

            p.reviveProgress = 0;
            p.hp = 0;
            DD.Particles.explosion(p.x, p.y, '#ffaa00', 10);
            DD.Utils.triggerShake(6, 10);
            console.log(`[Entities] ${role} is downed!`);
          }
        }
      }

      // Enemies vs platform (damage platform energy if enemy is on platform)
      if (e.x > C.PLATFORM_X && e.x < C.PLATFORM_X + C.PLATFORM_W &&
          e.y > C.PLATFORM_Y && e.y < C.PLATFORM_Y + C.PLATFORM_H) {
        state.platform.energy -= 0.01 * e.damage;
      }
    }
  },

  // --- Rendering ---

  renderPlayers(ctx) {
    const C = DD.Config;
    const roleColors = { guardian: C.COLOR.GUARDIAN, technician: C.COLOR.TECHNICIAN, gunner: C.COLOR.GUNNER };

    // Render downed players first (below alive players)
    for (const role of ['guardian', 'technician', 'gunner']) {
      const p = this.players[role];
      if (!p || !p.downed) continue;

      ctx.save();
      ctx.translate(p.x, p.y);

      // Downed: draw as X / faded shape
      const pulse = Math.sin(Date.now() * 0.006) * 0.3 + 0.4;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = roleColors[role];
      ctx.beginPath();
      ctx.arc(0, 0, p.radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // X symbol
      ctx.strokeStyle = C.COLOR.DANGER;
      ctx.lineWidth = 3;
      const s = 8;
      ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(s, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s, -s); ctx.lineTo(-s, s); ctx.stroke();

      // Revive progress bar (green arc)
      if (p.reviveProgress > 0) {
        ctx.strokeStyle = C.COLOR.HP_BAR;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.reviveProgress);
        ctx.stroke();
      }

      // "HOLD E" hint
      ctx.fillStyle = C.COLOR.INTERACTIVE;
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('HOLD E', 0, p.radius + 22);

      ctx.restore();
    }

    // Render alive players
    for (const role of ['guardian', 'technician', 'gunner']) {
      const p = this.players[role];
      if (!p || !p.alive) continue;

      // Flash when invulnerable
      if (p.invulnFrames > 0 && Math.floor(p.invulnFrames / 4) % 2 === 0) continue;

      ctx.save();
      ctx.translate(p.x, p.y);

      if (role === 'guardian') {
        // Blue hexagon
        ctx.fillStyle = C.COLOR.GUARDIAN;
        DD.Utils.drawPolygon(ctx, 0, 0, p.radius, 6, -Math.PI / 6);
        ctx.fill();

        // Shield arc
        if (p.shieldActive || p.shieldEnergy > C.GUARDIAN_SHIELD_ENERGY_MAX * 0.2) {
          ctx.strokeStyle = p.shieldActive ? C.COLOR.GUARDIAN_SHIELD : 'rgba(102,204,255,0.3)';
          ctx.lineWidth = p.shieldActive ? 5 : 2;
          ctx.shadowColor = p.shieldActive ? C.COLOR.GUARDIAN_SHIELD : 'transparent';
          ctx.shadowBlur = p.shieldActive ? 10 : 0;
          DD.Utils.drawArc(ctx, 0, 0, C.GUARDIAN_SHIELD_RADIUS, p.shieldAngle, C.GUARDIAN_SHIELD_ARC / 2, ctx.lineWidth);
          ctx.shadowBlur = 0;
        }
      }

      if (role === 'technician') {
        // Green diamond
        ctx.fillStyle = C.COLOR.TECHNICIAN;
        DD.Utils.drawPolygon(ctx, 0, 0, p.radius, 4, 0);
        ctx.fill();

        // Scan ring
        const pulse = Math.sin(Date.now() * 0.005) * 0.3 + 0.4;
        ctx.strokeStyle = C.COLOR.TECHNICIAN;
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius + 8 + Math.sin(Date.now() * 0.003) * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Recharge indicator
        if (p.recharging) {
          ctx.fillStyle = C.COLOR.TECH_BEAM;
          ctx.beginPath();
          ctx.arc(0, -p.radius - 6, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (role === 'gunner') {
        // Red triangle pointing up
        ctx.fillStyle = C.COLOR.GUNNER;
        DD.Utils.drawPolygon(ctx, 0, 0, p.radius, 3, -Math.PI / 2);
        ctx.fill();

        // Aim line
        ctx.strokeStyle = C.COLOR.GUNNER_AIM;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(p.aimAngle) * 30, Math.sin(p.aimAngle) * 30);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }
  },

  renderEnemies(ctx) {
    for (const e of this.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);

      ctx.fillStyle = e.color;
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 6;

      switch (e.type) {
        case 'drone':
          ctx.beginPath();
          ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'charger':
          DD.Utils.drawPolygon(ctx, 0, 0, e.radius, 3, e.dashAngle || 0);
          ctx.fill();
          break;
        case 'orb':
          const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.2;
          ctx.beginPath();
          ctx.arc(0, 0, e.radius * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.arc(0, 0, e.radius * pulse * 1.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        case 'swarm':
          ctx.beginPath();
          ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'tank':
          ctx.fillRect(-e.radius, -e.radius, e.radius * 2, e.radius * 2);
          break;
      }

      // HP bar for enemies with more than 1 hp
      if (e.hpMax > 1) {
        ctx.shadowBlur = 0;
        const barW = e.radius * 2;
        const barH = 3;
        const barY = -e.radius - 8;
        ctx.fillStyle = DD.Config.COLOR.HP_BAR_BG;
        ctx.fillRect(-barW / 2, barY, barW, barH);
        ctx.fillStyle = DD.Config.COLOR.DANGER;
        ctx.fillRect(-barW / 2, barY, barW * (e.hp / e.hpMax), barH);
      }

      ctx.shadowBlur = 0;
      ctx.restore();
    }
  },

  renderRepairTerminal(ctx, techRepairing) {
    const C = DD.Config;
    const term = this.repairTerminal;
    if (!term) return;

    ctx.save();
    ctx.translate(term.x, term.y);

    // Base circle
    const glowing = techRepairing;
    ctx.strokeStyle = glowing ? C.COLOR.TECHNICIAN : C.COLOR.INTERACTIVE;
    ctx.lineWidth = glowing ? 3 : 2;
    ctx.shadowColor = glowing ? C.COLOR.TECHNICIAN : C.COLOR.INTERACTIVE;
    ctx.shadowBlur = glowing ? 15 : 5;
    ctx.beginPath();
    ctx.arc(0, 0, term.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Wrench icon (simple lines)
    ctx.strokeStyle = glowing ? C.COLOR.TECHNICIAN : C.COLOR.INTERACTIVE;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
    // Vertical bar
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
    // Horizontal bar
    ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(6, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(6, 4); ctx.stroke();

    // Label
    ctx.fillStyle = glowing ? C.COLOR.TECHNICIAN : C.COLOR.INTERACTIVE;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('REPAIR [E]', 0, term.radius + 12);

    ctx.shadowBlur = 0;
    ctx.restore();
  },

  renderAmmoCrates(ctx) {
    const C = DD.Config;
    for (const crate of this.ammoCrates) {
      const pulse = Math.sin(Date.now() * 0.004 + crate.pulse) * 0.3 + 0.7;
      ctx.save();
      ctx.translate(crate.x, crate.y);
      ctx.globalAlpha = pulse;

      // Crate box
      ctx.fillStyle = C.COLOR.AMMO_BAR;
      ctx.shadowColor = C.COLOR.AMMO_BAR;
      ctx.shadowBlur = 8;
      const s = crate.radius * 0.7;
      ctx.fillRect(-s, -s, s * 2, s * 2);

      // Bullet icon inside
      ctx.fillStyle = '#000';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = C.COLOR.AMMO_BAR;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`+${crate.value}`, 0, crate.radius + 12);

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  },

  renderBullets(ctx) {
    ctx.fillStyle = DD.Config.COLOR.AMMO_BAR;
    ctx.shadowColor = DD.Config.COLOR.AMMO_BAR;
    ctx.shadowBlur = 8;
    for (const b of this.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  },

  // --- State serialization (for networking) ---

  getState() {
    return {
      players: {
        guardian: { ...this.players.guardian },
        technician: { ...this.players.technician },
        gunner: { ...this.players.gunner },
      },
      enemies: this.enemies.map(e => ({
        id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp, hpMax: e.hpMax,
        radius: e.radius, speed: e.speed, color: e.color, damage: e.damage,
        state: e.state, timer: e.timer, dashAngle: e.dashAngle,
      })),
      bullets: this.bullets.map(b => ({
        id: b.id, x: b.x, y: b.y, dx: b.dx, dy: b.dy,
        radius: b.radius, damage: b.damage, ttl: b.ttl,
      })),
    };
  },

  applyState(s) {
    // Apply remote state (for peers)
    for (const role of ['guardian', 'technician', 'gunner']) {
      if (s.players && s.players[role]) {
        Object.assign(this.players[role], s.players[role]);
      }
    }
    if (s.enemies) this.enemies = s.enemies;
    if (s.bullets) this.bullets = s.bullets;
  },
};
