window.DD = window.DD || {};

DD.Utils = {
  // Screen shake state
  shake: { intensity: 0, duration: 0, x: 0, y: 0 },

  triggerShake(intensity, duration) {
    this.shake.intensity = Math.max(this.shake.intensity, intensity);
    this.shake.duration = Math.max(this.shake.duration, duration);
  },

  updateShake() {
    if (this.shake.duration > 0) {
      this.shake.x = (Math.random() - 0.5) * this.shake.intensity;
      this.shake.y = (Math.random() - 0.5) * this.shake.intensity;
      this.shake.duration--;
      if (this.shake.duration <= 0) {
        this.shake.intensity = 0;
      }
    } else {
      this.shake.x = 0;
      this.shake.y = 0;
    }
  },

  // Math
  dist(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  },

  angle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  },

  // Check if angle `a` is within an arc centered on `center` with half-width `half`
  angleInArc(a, center, half) {
    let diff = a - center;
    // Normalize to [-PI, PI]
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) <= half;
  },

  // Circle vs circle collision
  circleCollide(x1, y1, r1, x2, y2, r2) {
    const d = this.dist(x1, y1, x2, y2);
    return d < r1 + r2;
  },

  // Keep entity within platform bounds
  clampToPlatform(x, y, radius) {
    const C = DD.Config;
    return {
      x: this.clamp(x, C.PLATFORM_X + radius, C.PLATFORM_X + C.PLATFORM_W - radius),
      y: this.clamp(y, C.PLATFORM_Y + radius, C.PLATFORM_Y + C.PLATFORM_H - radius),
    };
  },

  // Random int in range [min, max]
  randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // Random float in range [min, max)
  randFloat(min, max) {
    return Math.random() * (max - min) + min;
  },

  // Pick random element from array
  randPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  },

  // Get a spawn position on the edge of the platform
  getEdgeSpawnPos(edge) {
    const C = DD.Config;
    const px = C.PLATFORM_X;
    const py = C.PLATFORM_Y;
    const pw = C.PLATFORM_W;
    const ph = C.PLATFORM_H;
    const margin = 20;

    if (edge === 'random') {
      edge = this.randPick(['top', 'bottom', 'left', 'right']);
    }

    switch (edge) {
      case 'top':
        return { x: this.randFloat(px, px + pw), y: py - margin };
      case 'bottom':
        return { x: this.randFloat(px, px + pw), y: py + ph + margin };
      case 'left':
        return { x: px - margin, y: this.randFloat(py, py + ph) };
      case 'right':
        return { x: px + pw + margin, y: this.randFloat(py, py + ph) };
      default:
        return { x: px + pw / 2, y: py - margin };
    }
  },

  // Draw a regular polygon (hexagon, triangle, etc.)
  drawPolygon(ctx, x, y, radius, sides, rotation) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = rotation + (Math.PI * 2 * i) / sides;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  },

  // Draw an arc shield
  drawArc(ctx, x, y, radius, centerAngle, halfArc, lineWidth) {
    ctx.beginPath();
    ctx.arc(x, y, radius, centerAngle - halfArc, centerAngle + halfArc);
    ctx.lineWidth = lineWidth || 4;
    ctx.stroke();
  },

  // Simple unique ID generator
  _nextId: 1,
  uid() {
    return this._nextId++;
  },
};
