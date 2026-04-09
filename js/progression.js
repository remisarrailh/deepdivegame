window.DD = window.DD || {};

DD.Progression = {
  SAVE_KEY: 'deepdive_save',

  data: {
    totalCores: 0,
    upgrades: {
      guardianShieldSize:    0,  // max 3: +15 deg per level
      guardianShieldRegen:   0,  // max 3: +0.2 regen per level
      techRechargeSpeed:     0,  // max 3: +0.3 rate per level
      gunnerDamage:          0,  // max 5: +1 damage per level
      gunnerAmmoMax:         0,  // max 3: +4 ammo per level
      platformArmor:         0,  // max 3: -20% drain per level
      platformAmmoPool:      0,  // max 3: +20 initial ammo per level
    },
    stats: {
      runsCompleted: 0,
      maxDepth: 0,
      totalEnemiesKilled: 0,
      totalCoresEarned: 0,
    },
  },

  // Cost per upgrade level (index = current level)
  COSTS: [5, 10, 20, 40, 80],

  MAX_LEVELS: {
    guardianShieldSize:   3,
    guardianShieldRegen:  3,
    techRechargeSpeed:    3,
    gunnerDamage:         5,
    gunnerAmmoMax:        3,
    platformArmor:        3,
    platformAmmoPool:     3,
  },

  LABELS: {
    guardianShieldSize:   'Guardian: Shield Arc +15°',
    guardianShieldRegen:  'Guardian: Shield Regen +0.2/f',
    techRechargeSpeed:    'Technician: Recharge Speed',
    gunnerDamage:         'Gunner: Bullet Damage',
    gunnerAmmoMax:        'Gunner: Max Ammo +4',
    platformArmor:        'Platform: Armor (-20% drain)',
    platformAmmoPool:     'Platform: Ammo Pool +20',
  },

  load() {
    try {
      const raw = localStorage.getItem(this.SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        // Merge (in case new fields were added)
        if (saved.upgrades) Object.assign(this.data.upgrades, saved.upgrades);
        if (saved.stats) Object.assign(this.data.stats, saved.stats);
        if (saved.totalCores !== undefined) this.data.totalCores = saved.totalCores;
        console.log('[Progression] Loaded save:', this.data);
      }
    } catch (e) {
      console.warn('[Progression] Failed to load save:', e);
    }
  },

  save() {
    try {
      localStorage.setItem(this.SAVE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[Progression] Failed to save:', e);
    }
  },

  reset() {
    localStorage.removeItem(this.SAVE_KEY);
    this.data = {
      totalCores: 0,
      upgrades: Object.fromEntries(Object.keys(this.data.upgrades).map(k => [k, 0])),
      stats: { runsCompleted: 0, maxDepth: 0, totalEnemiesKilled: 0, totalCoresEarned: 0 },
    };
    console.log('[Progression] Save reset');
  },

  getCost(name) {
    const level = this.data.upgrades[name];
    return this.COSTS[level] !== undefined ? this.COSTS[level] : Infinity;
  },

  canAfford(name) {
    const level = this.data.upgrades[name];
    const maxLevel = this.MAX_LEVELS[name];
    return level < maxLevel && this.data.totalCores >= this.getCost(name);
  },

  purchase(name) {
    if (!this.canAfford(name)) return false;
    this.data.totalCores -= this.getCost(name);
    this.data.upgrades[name]++;
    this.save();
    return true;
  },

  // Apply upgrades to config values at run start
  applyToConfig() {
    const u = this.data.upgrades;
    const C = DD.Config;

    C.GUARDIAN_SHIELD_ARC = Math.PI / 2 + u.guardianShieldSize * (Math.PI / 12);
    C.GUARDIAN_SHIELD_REGEN = 0.3 + u.guardianShieldRegen * 0.2;
    C.TECH_RECHARGE_RATE = 0.5 + u.techRechargeSpeed * 0.3;
    C.GUNNER_BULLET_DAMAGE = 1 + u.gunnerDamage;
    C.GUNNER_AMMO_MAX = 12 + u.gunnerAmmoMax * 4;
    C.PLATFORM_ENERGY_DRAIN = 0.02 * (1 - u.platformArmor * 0.2);
    C.PLATFORM_ENERGY_DRAIN_FAST = 0.08 * (1 - u.platformArmor * 0.2);
    // Ammo pool is applied in game.js initState
  },

  getInitialAmmoPool() {
    return 60 + this.data.upgrades.platformAmmoPool * 20;
  },

  // Record run results
  recordRun(depth, coresEarned, enemiesKilled, victory) {
    this.data.totalCores += coresEarned;
    this.data.stats.totalCoresEarned += coresEarned;
    this.data.stats.totalEnemiesKilled += enemiesKilled;
    if (depth > this.data.stats.maxDepth) this.data.stats.maxDepth = depth;
    if (victory) this.data.stats.runsCompleted++;
    this.save();
  },
};
