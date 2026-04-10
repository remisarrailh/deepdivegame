window.DD = window.DD || {};

DD.Audio = {
  _pools: {},       // { name: [HTMLAudioElement, ...] }
  _musicEl: null,
  _musicStarted: false,
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

  },

  // Call once after first user interaction
  init() {
    if (this._musicEl) return;

    // Music: single element, never destroyed
    this._musicEl = new Audio('assets/music/game.mp3');
    this._musicEl.loop = true;
    this._musicEl.volume = 0.35;

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

  toggleMute() {
    this._muted = !this._muted;
    if (this._musicEl) this._musicEl.muted = this._muted;
    return this._muted;
  },
};
