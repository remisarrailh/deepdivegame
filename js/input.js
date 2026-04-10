window.DD = window.DD || {};

DD.Input = {
  // Normalized output (same format for keyboard and touch)
  moveX: 0,
  moveY: 0,
  aimAngle: -Math.PI / 2,  // default: up
  aimX: 240,               // canvas center-top (default aim target)
  aimY: 60,
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
  _touchAim: { active: false, id: null },  // finger dragging in upper area to aim
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

    // Touch aim — only used as fallback; gunner auto-aim is handled in game.js
    if (playerX !== undefined && this.isMobile && this._touchAim.active) {
      this.aimAngle = DD.Utils.angle(playerX, playerY, this.aimX, this.aimY);
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

      // Bottom strip (y > 72%): joystick left / action buttons right
      if (p.y > C.CANVAS_H * 0.72) {
        if (p.x < C.CANVAS_W * 0.45) {
          // Left side = joystick
          if (!this._touchJoy.active) {
            this._touchJoy.active = true;
            this._touchJoy.id = touch.identifier;
            this._touchJoy.startX = p.x;
            this._touchJoy.startY = p.y;
            this._touchJoy.curX = p.x;
            this._touchJoy.curY = p.y;
          }
        } else if (p.x < C.CANVAS_W * 0.72) {
          // Middle-right = action2 [E]
          this._touchAction2.active = true;
          this._touchAction2.id = touch.identifier;
        } else {
          // Far-right = action1
          this._touchAction.active = true;
          this._touchAction.id = touch.identifier;
        }
      } else {
        // Upper area = aim direction
        this.aimX = p.x;
        this.aimY = p.y;
        if (!this._touchAim.active) {
          this._touchAim.active = true;
          this._touchAim.id = touch.identifier;
        }
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
      if (touch.identifier === this._touchAim.id) {
        this.aimX = p.x;
        this.aimY = p.y;
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
      if (touch.identifier === this._touchAim.id) {
        this._touchAim.active = false;
        this._touchAim.id = null;
      }
    }
  },

  // Render mobile controls overlay
  renderTouch(ctx) {
    if (!this.isMobile) return;
    const C = DD.Config;
    // Control strip: from 72% height down to HUD panels
    const stripY = C.CANVAS_H * 0.86; // vertical center of button area

    // --- Joystick ---
    if (this._touchJoy.active) {
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this._touchJoy.startX, this._touchJoy.startY, this.JOY_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff55';
      ctx.beginPath();
      ctx.arc(this._touchJoy.curX, this._touchJoy.curY, 14, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Hint circle
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(C.CANVAS_W * 0.22, stripY, this.JOY_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#aaa';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MOVE', C.CANVAS_W * 0.22, stripY + 4);
    }

    // --- Action buttons (side by side, bottom-right) ---
    const btnR = 30;
    const a2x = C.CANVAS_W * 0.62;
    const a1x = C.CANVAS_W * 0.84;

    // Action 2 [E]
    ctx.globalAlpha = this._touchAction2.active ? 0.85 : 0.45;
    ctx.fillStyle = this._touchAction2.active ? '#33cc66' : '#0d2218';
    ctx.beginPath();
    ctx.arc(a2x, stripY, btnR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#44ff88';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#44ff88';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[E]', a2x, stripY + 4);

    // Action 1
    ctx.globalAlpha = this._touchAction.active ? 0.85 : 0.45;
    ctx.fillStyle = this._touchAction.active ? '#cc3333' : '#220d0d';
    ctx.beginPath();
    ctx.arc(a1x, stripY, btnR * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ACT', a1x, stripY + 4);

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
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
