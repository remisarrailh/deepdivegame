window.DD = window.DD || {};

DD.Input = {
  // Normalized output (same format for keyboard and touch)
  moveX: 0,
  moveY: 0,
  aimAngle: 0,
  aimX: 0,
  aimY: 0,
  action1: false,
  action2: false,
  action1Pressed: false,  // true only on the frame it was pressed
  action2Pressed: false,

  // Internal
  isMobile: false,
  _prevAction1: false,
  _prevAction2: false,
  _keys: {},
  _mouseX: 0,
  _mouseY: 0,
  _mouseDown: false,
  _canvas: null,
  _canvasRect: null,

  // Touch joystick
  _touchJoy: { active: false, id: null, startX: 0, startY: 0, curX: 0, curY: 0 },
  _touchAction: { active: false, id: null },
  _touchAction2: { active: false, id: null },
  JOY_RADIUS: 50,
  JOY_DEAD: 8,

  init(canvas) {
    this._canvas = canvas;
    // Only treat as mobile if it's a real touch device without a mouse/keyboard
    // navigator.maxTouchPoints > 0 is true on Windows touchscreen PCs - check pointer type instead
    this.isMobile = ('ontouchstart' in window) && !window.matchMedia('(pointer: fine)').matches;
    this._updateCanvasRect();

    // Keyboard
    window.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      // Prevent scrolling with game keys
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this._keys[e.code] = false;
    });

    // Mouse
    window.addEventListener('mousemove', (e) => {
      this._mouseX = e.clientX;
      this._mouseY = e.clientY;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this._mouseDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._mouseDown = false;
    });

    // Touch
    if (this.isMobile) {
      canvas.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
      canvas.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
      canvas.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: false });
      canvas.addEventListener('touchcancel', (e) => this._onTouchEnd(e), { passive: false });
    }

    // Recalc rect on resize
    window.addEventListener('resize', () => this._updateCanvasRect());
  },

  _updateCanvasRect() {
    if (this._canvas) {
      this._canvasRect = this._canvas.getBoundingClientRect();
    }
  },

  // Convert screen coords to canvas coords
  screenToCanvas(sx, sy) {
    const r = this._canvasRect;
    if (!r) return { x: 0, y: 0 };
    return {
      x: (sx - r.left) / r.width * DD.Config.CANVAS_W,
      y: (sy - r.top) / r.height * DD.Config.CANVAS_H,
    };
  },

  key(code) {
    return !!this._keys[code];
  },

  poll(playerX, playerY) {
    this._prevAction1 = this.action1;
    this._prevAction2 = this.action2;

    // --- Always poll keyboard + mouse ---
    let kbMoveX = 0, kbMoveY = 0;
    if (this.key('KeyA') || this.key('ArrowLeft'))  kbMoveX -= 1;
    if (this.key('KeyD') || this.key('ArrowRight')) kbMoveX += 1;
    if (this.key('KeyW') || this.key('ArrowUp'))    kbMoveY -= 1;
    if (this.key('KeyS') || this.key('ArrowDown'))  kbMoveY += 1;

    if (kbMoveX !== 0 && kbMoveY !== 0) {
      const inv = 1 / Math.SQRT2;
      kbMoveX *= inv;
      kbMoveY *= inv;
    }

    const mp = this.screenToCanvas(this._mouseX, this._mouseY);
    this.aimX = mp.x;
    this.aimY = mp.y;
    if (playerX !== undefined) {
      this.aimAngle = DD.Utils.angle(playerX, playerY, mp.x, mp.y);
    }

    const kbAction1 = this._mouseDown || this.key('Space');
    const kbAction2 = this.key('KeyE');

    // --- Touch joystick (additive / override when active) ---
    let touchMoveX = 0, touchMoveY = 0;
    let touchAction1 = false, touchAction2 = false;

    if (this._touchJoy.active) {
      const dx = this._touchJoy.curX - this._touchJoy.startX;
      const dy = this._touchJoy.curY - this._touchJoy.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > this.JOY_DEAD) {
        const clamped = Math.min(dist, this.JOY_RADIUS);
        touchMoveX = (dx / dist) * (clamped / this.JOY_RADIUS);
        touchMoveY = (dy / dist) * (clamped / this.JOY_RADIUS);
      }
    }

    touchAction1 = this._touchAction.active;
    touchAction2 = this._touchAction2.active;

    // Touch aim
    if (playerX !== undefined && touchAction1) {
      this.aimAngle = DD.Utils.angle(playerX, playerY, DD.Config.CANVAS_W / 2, DD.Config.PLATFORM_Y);
    }

    // Merge: touch overrides keyboard movement if joystick is active
    if (this._touchJoy.active) {
      this.moveX = touchMoveX;
      this.moveY = touchMoveY;
    } else {
      this.moveX = kbMoveX;
      this.moveY = kbMoveY;
    }

    this.action1 = kbAction1 || touchAction1;
    this.action2 = kbAction2 || touchAction2;

    this.action1Pressed = this.action1 && !this._prevAction1;
    this.action2Pressed = this.action2 && !this._prevAction2;
  },

  // Touch handlers
  _onTouchStart(e) {
    e.preventDefault();
    const C = DD.Config;
    for (const touch of e.changedTouches) {
      const p = this.screenToCanvas(touch.clientX, touch.clientY);

      // Left half = joystick
      if (p.x < C.CANVAS_W * 0.5 && p.y > C.CANVAS_H * 0.5) {
        if (!this._touchJoy.active) {
          this._touchJoy.active = true;
          this._touchJoy.id = touch.identifier;
          this._touchJoy.startX = p.x;
          this._touchJoy.startY = p.y;
          this._touchJoy.curX = p.x;
          this._touchJoy.curY = p.y;
        }
      }
      // Right half bottom = action buttons
      else if (p.x >= C.CANVAS_W * 0.5 && p.y > C.CANVAS_H * 0.5) {
        // Top-right quadrant of bottom = action2, bottom-right = action1
        if (p.y < C.CANVAS_H * 0.75) {
          this._touchAction2.active = true;
          this._touchAction2.id = touch.identifier;
        } else {
          this._touchAction.active = true;
          this._touchAction.id = touch.identifier;
        }
      }
      // Top half = aim
      else {
        this.aimX = p.x;
        this.aimY = p.y;
      }
    }
  },

  _onTouchMove(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const p = this.screenToCanvas(touch.clientX, touch.clientY);
      if (touch.identifier === this._touchJoy.id) {
        this._touchJoy.curX = p.x;
        this._touchJoy.curY = p.y;
      }
    }
  },

  _onTouchEnd(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (touch.identifier === this._touchJoy.id) {
        this._touchJoy.active = false;
        this._touchJoy.id = null;
      }
      if (touch.identifier === this._touchAction.id) {
        this._touchAction.active = false;
        this._touchAction.id = null;
      }
      if (touch.identifier === this._touchAction2.id) {
        this._touchAction2.active = false;
        this._touchAction2.id = null;
      }
    }
  },

  // Render mobile controls overlay
  renderTouch(ctx) {
    if (!this.isMobile) return;
    const C = DD.Config;

    ctx.globalAlpha = 0.3;

    // Joystick base
    if (this._touchJoy.active) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this._touchJoy.startX, this._touchJoy.startY, this.JOY_RADIUS, 0, Math.PI * 2);
      ctx.stroke();

      // Joystick knob
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(this._touchJoy.curX, this._touchJoy.curY, 15, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Hint area
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(C.CANVAS_W * 0.25, C.CANVAS_H * 0.8, this.JOY_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Action buttons
    const btnRadius = 28;
    // Action 1 (primary)
    ctx.fillStyle = this._touchAction.active ? '#ff4444' : '#442222';
    ctx.beginPath();
    ctx.arc(C.CANVAS_W * 0.82, C.CANVAS_H * 0.88, btnRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Action 2 (secondary)
    ctx.fillStyle = this._touchAction2.active ? '#44ff44' : '#224422';
    ctx.beginPath();
    ctx.arc(C.CANVAS_W * 0.65, C.CANVAS_H * 0.7, btnRadius * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#44ff44';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.globalAlpha = 1;
  },

  getState() {
    return {
      moveX: this.moveX,
      moveY: this.moveY,
      aimAngle: this.aimAngle,
      action1: this.action1,
      action2: this.action2,
    };
  },
};
