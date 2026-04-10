window.DD = window.DD || {};

DD.Audio = {
  _pools: {},       // { name: [HTMLAudioElement, ...] }
  _musicEl: null,
  _musicStarted: false,
  _alertEl: null,   // looping low energy alert
  _alertPlaying: false,
  _triggerCooldown: 0,  // frames before energylowtrigger can play again
  _repairEl: null,  // looping repair sound
  _repairPlaying: false,
  _muted: false,
  _POOL_SIZE: 6,    // concurrent instances per SFX

  _SFX: {
    gunshot: { src: 'assets/sounds/gunshot.mp3', volume: 0.7, pitchRange: 0.10 },
    shield:     { src: 'assets/sounds/shield.mp3',     volume: 0.5, pitchRange: 0.08 },
    lowshield:  { src: 'assets/sounds/lowshield.mp3',  volume: 0.7, pitchRange: 0.03 },
    repair:  { src: 'assets/sounds/repair.mp3',  volume: 0.4, pitchRange: 0.05 },
    pickup:  { src: 'assets/sounds/pickup.mp3',  volume: 0.6, pitchRange: 0.08 },
    reload:     { src: 'assets/sounds/reload.mp3',     volume: 0.5, pitchRange: 0.06 },
    nextlevel:  { src: 'assets/sounds/nextlevel.mp3',  volume: 0.8, pitchRange: 0.0  },
    getready:   { src: 'assets/sounds/getready.mp3',   volume: 0.8, pitchRange: 0.0  },
    gameover:         { src: 'assets/sounds/gameover.mp3',         volume: 0.9, pitchRange: 0.0 },
    lowenergyalert:   { src: 'assets/sounds/lowenergyalert.mp3',   volume: 0.5, pitchRange: 0.0 },
    energylowtrigger: { src: 'assets/sounds/energylowtrigger.mp3', volume: 0.8, pitchRange: 0.0 },

  },

  // Call once after first user interaction
  init() {
    if (this._musicEl) return;

    // Music: single element, never destroyed
    this._musicEl = new Audio('assets/music/game.mp3');
    this._musicEl.loop = true;
    this._musicEl.volume = 0.35;

    // Low energy alert loop element
    this._alertEl = new Audio('assets/sounds/lowenergyalert.mp3');
    this._alertEl.loop = true;
    this._alertEl.volume = 0.5;

    // Repair loop element
    this._repairEl = new Audio('assets/sounds/repair.mp3');
    this._repairEl.loop = true;
    this._repairEl.volume = 0.4;

    // SFX pools: pre-create N clones per sound so rapid fire doesn't cut out
    for (const [name, cfg] of Object.entries(this._SFX)) {
      this._pools[name] = [];
      for (let i = 0; i < this._POOL_SIZE; i++) {
        const el = new Audio(cfg.src);
        el.volume = cfg.volume;
        el.preload = 'auto';
        this._pools[name].push(el);
      }
      console.log('[Audio] Pool created:', name);
    }
  },

  startMusic() {
    if (this._musicStarted || !this._musicEl) return;
    this._musicEl.play()
      .then(() => { this._musicStarted = true; })
      .catch(e => console.warn('[Audio] Music blocked:', e));
  },

  // Play SFX — picks a pool slot that's done playing, varies pitch via playbackRate
  play(name) {
    if (this._muted) return;
    const pool = this._pools[name];
    if (!pool) return;
    const cfg = this._SFX[name];

    // Find a free element (currentTime === 0 or ended)
    let el = pool.find(e => e.paused || e.ended);
    if (!el) {
      // All busy — steal the furthest along
      el = pool.reduce((a, b) => (a.currentTime > b.currentTime ? a : b));
      el.pause();
    }

    el.currentTime = 0;
    // pitch variation: ±pitchRange around 1.0
    el.playbackRate = 1.0 + (Math.random() * 2 - 1) * cfg.pitchRange;
    el.play().catch(() => {});
  },

  // Start/stop the repair loop — call each frame with whether technician is actively repairing
  updateRepair(isRepairing) {
    if (isRepairing && !this._repairPlaying && !this._muted) {
      this._repairEl && this._repairEl.play().catch(() => {});
      this._repairPlaying = true;
    } else if (!isRepairing && this._repairPlaying) {
      this._repairEl && this._repairEl.pause();
      this._repairEl && (this._repairEl.currentTime = 0);
      this._repairPlaying = false;
    }
  },

  stopAllLoops() {
    if (this._alertEl) { this._alertEl.pause(); this._alertEl.currentTime = 0; }
    if (this._repairEl) { this._repairEl.pause(); this._repairEl.currentTime = 0; }
    this._alertPlaying = false;
    this._repairPlaying = false;
    this._triggerCooldown = 0;
  },

  // Called each frame with current platform energy (0-100)
  updateEnergyAlert(energy, threshold = 30) {
    if (this._triggerCooldown > 0) this._triggerCooldown--;

    const low = energy > 0 && energy <= threshold;

    // Loop alert
    if (low && !this._alertPlaying && !this._muted) {
      this._alertEl && this._alertEl.play().catch(() => {});
      this._alertPlaying = true;
    } else if ((!low || this._muted) && this._alertPlaying) {
      this._alertEl && this._alertEl.pause();
      this._alertEl && (this._alertEl.currentTime = 0);
      this._alertPlaying = false;
    }

    // One-shot trigger with cooldown (600 frames = ~10s)
    if (low && this._triggerCooldown === 0) {
      this.play('energylowtrigger');
      this._triggerCooldown = 600;
    }
  },

  toggleMute() {
    this._muted = !this._muted;
    if (this._musicEl) this._musicEl.muted = this._muted;
    if (this._alertEl) this._alertEl.muted = this._muted;
    if (this._repairEl) this._repairEl.muted = this._muted;
    // Stop loops immediately when muting
    if (this._muted) this.stopAllLoops();
    return this._muted;
  },
};
