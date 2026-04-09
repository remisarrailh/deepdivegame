window.DD = window.DD || {};

DD.Particles = {
  _particles: [],
  _maxParticles: DD.Config.PARTICLE_MAX,

  init() {
    this._maxParticles = DD.Input.isMobile ? DD.Config.PARTICLE_MAX_MOBILE : DD.Config.PARTICLE_MAX;
    this._particles = [];
  },

  _spawn(opts) {
    if (this._particles.length >= this._maxParticles) return;
    this._particles.push({
      x: opts.x || 0,
      y: opts.y || 0,
      dx: opts.dx || 0,
      dy: opts.dy || 0,
      ddy: opts.ddy || 0,  // gravity
      ddx: opts.ddx || 0,
      size: opts.size || 3,
      color: opts.color || '#fff',
      ttl: opts.ttl || 30,
      maxTtl: opts.ttl || 30,
      shape: opts.shape || 'circle',  // 'circle' | 'square' | 'line'
      shrink: opts.shrink !== undefined ? opts.shrink : true,
    });
  },

  explosion(x, y, color, count) {
    count = DD.Input.isMobile ? Math.ceil(count / 2) : count;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      this._spawn({
        x, y,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        ddy: 0.05,
        size: 2 + Math.random() * 3,
        color: color,
        ttl: 15 + Math.random() * 20,
      });
    }
  },

  sparks(x, y, count) {
    count = count || 5;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 2;
      this._spawn({
        x, y,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        size: 1.5,
        color: DD.Config.COLOR.SPARK,
        ttl: 8 + Math.random() * 10,
        shape: 'line',
      });
    }
  },

  shieldHit(x, y, angle) {
    for (let i = 0; i < 8; i++) {
      const spread = (Math.random() - 0.5) * 1.2;
      const a = angle + spread;
      const speed = 1 + Math.random() * 2;
      this._spawn({
        x, y,
        dx: Math.cos(a) * speed,
        dy: Math.sin(a) * speed,
        size: 2 + Math.random() * 2,
        color: DD.Config.COLOR.GUARDIAN_SHIELD,
        ttl: 10 + Math.random() * 10,
      });
    }
  },

  rechargeBeam(fromX, fromY, toX, toY) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    for (let i = 0; i < 3; i++) {
      const t = Math.random();
      this._spawn({
        x: fromX + dx * t + (Math.random() - 0.5) * 6,
        y: fromY + dy * t + (Math.random() - 0.5) * 6,
        dx: (Math.random() - 0.5) * 0.5,
        dy: -0.5 - Math.random() * 0.5,
        size: 2 + Math.random() * 2,
        color: DD.Config.COLOR.TECH_BEAM,
        ttl: 8 + Math.random() * 8,
      });
    }
  },

  corePickup(x, y) {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2;
      this._spawn({
        x, y,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed - 1,
        size: 2 + Math.random() * 3,
        color: DD.Config.COLOR.CORE,
        ttl: 20 + Math.random() * 15,
      });
    }
  },

  enemyDeath(x, y, color) {
    this.explosion(x, y, color, 10);
    this.sparks(x, y, 3);
  },

  playerHit(x, y) {
    this.explosion(x, y, '#fff', 6);
    DD.Utils.triggerShake(6, 8);
  },

  update() {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.dx += p.ddx;
      p.dy += p.ddy;
      p.x += p.dx;
      p.y += p.dy;
      p.ttl--;
      if (p.ttl <= 0) {
        this._particles.splice(i, 1);
      }
    }
  },

  render(ctx) {
    for (const p of this._particles) {
      const alpha = p.ttl / p.maxTtl;
      const size = p.shrink ? p.size * alpha : p.size;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'square') {
        ctx.fillRect(p.x - size, p.y - size, size * 2, size * 2);
      } else if (p.shape === 'line') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.dx * 3, p.y - p.dy * 3);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  },

  clear() {
    this._particles = [];
  },
};
