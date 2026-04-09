window.DD = window.DD || {};

DD.Waves = {
  // Predefined waves
  definitions: [
    {
      waveNum: 1,
      spawns: [
        { type: 'drone', count: 3, delay: 0, edge: 'random' },
      ],
      duration: 600,  // frames (10s)
      puzzleAfter: false,
      reward: 1,
    },
    {
      waveNum: 2,
      spawns: [
        { type: 'drone', count: 4, delay: 0, edge: 'left' },
        { type: 'drone', count: 4, delay: 120, edge: 'right' },
      ],
      duration: 900,
      puzzleAfter: false,
      reward: 1,
    },
    {
      waveNum: 3,
      spawns: [
        { type: 'charger', count: 2, delay: 0, edge: 'top' },
        { type: 'drone', count: 5, delay: 60, edge: 'random' },
      ],
      duration: 1200,
      puzzleAfter: true,
      reward: 2,
    },
    {
      waveNum: 4,
      spawns: [
        { type: 'drone', count: 6, delay: 0, edge: 'random' },
        { type: 'charger', count: 3, delay: 90, edge: 'random' },
      ],
      duration: 1200,
      puzzleAfter: false,
      reward: 2,
    },
    {
      waveNum: 5,
      spawns: [
        { type: 'tank', count: 1, delay: 0, edge: 'top' },
        { type: 'drone', count: 6, delay: 60, edge: 'random' },
        { type: 'charger', count: 2, delay: 120, edge: 'bottom' },
      ],
      duration: 1500,
      puzzleAfter: true,
      reward: 3,
    },
    {
      waveNum: 6,
      spawns: [
        { type: 'orb', count: 2, delay: 0, edge: 'random' },
        { type: 'drone', count: 8, delay: 60, edge: 'random' },
      ],
      duration: 1200,
      puzzleAfter: false,
      reward: 2,
    },
    {
      waveNum: 7,
      spawns: [
        { type: 'swarm', count: 10, delay: 0, edge: 'random' },
        { type: 'charger', count: 3, delay: 90, edge: 'random' },
      ],
      duration: 1200,
      puzzleAfter: true,
      reward: 3,
    },
    {
      waveNum: 8,
      spawns: [
        { type: 'tank', count: 2, delay: 0, edge: 'top' },
        { type: 'orb', count: 3, delay: 60, edge: 'random' },
        { type: 'drone', count: 8, delay: 30, edge: 'random' },
      ],
      duration: 1800,
      puzzleAfter: false,
      reward: 4,
    },
    {
      waveNum: 9,
      spawns: [
        { type: 'charger', count: 5, delay: 0, edge: 'random' },
        { type: 'tank', count: 2, delay: 120, edge: 'random' },
        { type: 'swarm', count: 8, delay: 60, edge: 'random' },
      ],
      duration: 1800,
      puzzleAfter: true,
      reward: 5,
    },
    {
      waveNum: 10,
      spawns: [
        { type: 'tank', count: 3, delay: 0, edge: 'random' },
        { type: 'orb', count: 4, delay: 60, edge: 'random' },
        { type: 'charger', count: 5, delay: 30, edge: 'random' },
        { type: 'drone', count: 10, delay: 90, edge: 'random' },
      ],
      duration: 2400,
      puzzleAfter: true,
      reward: 8,
    },
  ],

  // Wave runtime state
  currentWave: 0,
  waveTimer: 0,
  spawnQueue: [],    // { type, edge, spawnAt (frame) }
  waveClearTimer: 0, // countdown after all enemies dead

  init() {
    this.currentWave = 0;
    this.waveTimer = 0;
    this.spawnQueue = [];
    this.waveClearTimer = 0;
  },

  getWaveDef(num) {
    if (num <= this.definitions.length) {
      return this.definitions[num - 1];
    }
    // Procedural generation for waves beyond predefined
    return this._generateWave(num);
  },

  _generateWave(num) {
    const budget = Math.floor(5 + num * 2.5 + Math.pow(num, 1.3));
    const costs = { drone: 1, charger: 2, orb: 3, swarm: 1, tank: 5 };
    const types = ['drone', 'charger'];
    if (num > 5) types.push('orb');
    if (num > 3) types.push('swarm');
    if (num > 7) types.push('tank');

    const spawns = [];
    let remaining = budget;
    let delay = 0;

    while (remaining > 0) {
      const type = DD.Utils.randPick(types);
      const cost = costs[type];
      if (cost > remaining) continue;
      const maxCount = Math.floor(remaining / cost);
      const count = DD.Utils.randInt(1, Math.min(maxCount, 6));
      spawns.push({ type, count, delay, edge: 'random' });
      remaining -= count * cost;
      delay += DD.Utils.randInt(30, 90);
    }

    return {
      waveNum: num,
      spawns: spawns,
      duration: 1200 + num * 120,
      puzzleAfter: num % 3 === 0,
      reward: Math.floor(num * 0.8),
    };
  },

  startWave(num) {
    this.currentWave = num;
    this.waveTimer = 0;
    this.waveClearTimer = 0;
    this.spawnQueue = [];

    const def = this.getWaveDef(num);
    console.log(`[Waves] Starting wave ${num}`, def);

    // Build spawn queue
    for (const s of def.spawns) {
      for (let i = 0; i < s.count; i++) {
        this.spawnQueue.push({
          type: s.type,
          edge: s.edge,
          spawnAt: DD.Config.WAVE_PREP_TIME + s.delay + i * 20,  // stagger spawns within group
        });
      }
    }

    // Sort by spawn time
    this.spawnQueue.sort((a, b) => a.spawnAt - b.spawnAt);
  },

  update(state) {
    this.waveTimer++;

    // Spawn enemies from queue
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].spawnAt <= this.waveTimer) {
      const s = this.spawnQueue.shift();
      const pos = DD.Utils.getEdgeSpawnPos(s.edge);
      DD.Entities.spawnEnemy(s.type, pos.x, pos.y);
    }

    // Check wave clear: all spawned and all dead
    if (this.spawnQueue.length === 0 && DD.Entities.enemies.length === 0) {
      this.waveClearTimer++;
      if (this.waveClearTimer >= 60) {  // 1 second grace period
        return 'clear';
      }
    }

    // Check timeout
    const def = this.getWaveDef(this.currentWave);
    if (this.waveTimer > def.duration + DD.Config.WAVE_PREP_TIME) {
      return 'timeout';
    }

    return 'active';
  },

  getCurrentReward() {
    const def = this.getWaveDef(this.currentWave);
    return def.reward;
  },

  shouldPuzzleAfter() {
    const def = this.getWaveDef(this.currentWave);
    return def.puzzleAfter;
  },
};
