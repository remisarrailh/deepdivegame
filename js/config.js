window.DD = window.DD || {};

DD.Config = {
  // Canvas
  CANVAS_W: 480,
  CANVAS_H: 720,

  // Colors
  COLOR: {
    BG:          '#0a0a12',
    PLATFORM:    '#1a1a2e',
    PLATFORM_EDGE: '#2a2a4e',
    LIGHT:       'rgba(255, 255, 200, 0.03)',

    // Roles
    GUARDIAN:    '#4488ff',
    GUARDIAN_SHIELD: '#66ccff',
    TECHNICIAN:  '#44ff88',
    TECH_BEAM:   '#66ffaa',
    GUNNER:      '#ff4444',
    GUNNER_AIM:  '#ff8866',

    // Enemies
    DRONE:       '#ff3333',
    CHARGER:     '#ff8800',
    ORB:         '#aa44ff',
    SWARM:       '#ff66aa',
    TANK:        '#881111',

    // UI
    INTERACTIVE: '#ffdd44',
    DANGER:      '#ff2222',
    FRIENDLY:    '#44aaff',
    TEXT:        '#ffffff',
    TEXT_DIM:    '#888899',
    HUD_BG:      'rgba(0, 0, 0, 0.6)',
    HP_BAR:      '#44ff44',
    HP_BAR_BG:   '#333333',
    ENERGY_BAR:  '#ffaa00',
    AMMO_BAR:    '#ffdd44',

    // Effects
    EXPLOSION:   '#ffaa33',
    SPARK:       '#ffff66',
    CORE:        '#aa66ff',
  },

  // Platform
  PLATFORM_X: 40,
  PLATFORM_Y: 120,
  PLATFORM_W: 400,
  PLATFORM_H: 500,
  PLATFORM_ENERGY_MAX: 100,
  PLATFORM_ENERGY_DRAIN: 0.015,       // per frame during WAVE (~110s to empty)
  PLATFORM_ENERGY_DRAIN_FAST: 0.025, // per frame during DESCENDING (~67s to empty)
  PLATFORM_ENERGY_DRAIN_PUZZLE: 0.0, // puzzles don't drain energy directly

  // Players
  PLAYER_SPEED: 2.5,
  PLAYER_RADIUS: 16,

  // Guardian
  GUARDIAN_SHIELD_ARC: Math.PI / 2,  // 90 degrees
  GUARDIAN_SHIELD_RADIUS: 40,
  GUARDIAN_SHIELD_ENERGY_MAX: 100,
  GUARDIAN_SHIELD_DRAIN: 0.8,
  GUARDIAN_SHIELD_REGEN: 0.3,
  GUARDIAN_SHIELD_DEPLETION_PENALTY: 90, // frames before regen after full drain (~1.5s)
  GUARDIAN_SHIELD_SOUND_COOLDOWN: 40,    // min frames between shield activation sounds
  GUARDIAN_HP: 4,

  // Technician
  TECH_RECHARGE_RANGE: 60,
  TECH_RECHARGE_RATE: 0.5,      // ammo per frame to gunner
  TECH_REPAIR_RANGE: 40,         // must be close to repair terminal
  TECH_REPAIR_RATE: 0.08,        // energy per frame when repairing
  TECH_HP: 3,

  // Repair terminal (fixed position, center-bottom of platform)
  REPAIR_TERMINAL_OFFSET_X: 0,   // from platform center
  REPAIR_TERMINAL_OFFSET_Y: 180, // from platform center (toward bottom)

  // Ammo crates
  AMMO_CRATE_VALUE: 20,          // ammo restored per crate
  AMMO_CRATE_RADIUS: 14,
  AMMO_CRATE_SPAWN_INTERVAL: 1800, // frames between auto-spawns (~30s)

  // Gunner
  GUNNER_FIRE_COOLDOWN: 12,  // frames
  GUNNER_BULLET_SPEED: 6,
  GUNNER_BULLET_DAMAGE: 1,
  GUNNER_BULLET_RADIUS: 4,
  GUNNER_AMMO_MAX: 12,
  GUNNER_HP: 3,

  // Enemies
  ENEMY_MAX: 64,
  DRONE_SPEED: 1.2,
  DRONE_HP: 1,
  DRONE_RADIUS: 10,
  DRONE_DAMAGE: 1,
  CHARGER_SPEED: 0.6,
  CHARGER_DASH_SPEED: 5,
  CHARGER_HP: 2,
  CHARGER_RADIUS: 12,
  CHARGER_DAMAGE: 2,
  ORB_SPEED: 0.8,
  ORB_HP: 3,
  ORB_RADIUS: 14,
  SWARM_SPEED: 1.5,
  SWARM_HP: 1,
  SWARM_RADIUS: 6,
  TANK_SPEED: 0.4,
  TANK_HP: 8,
  TANK_RADIUS: 20,
  TANK_DAMAGE: 2,

  // Waves
  WAVE_PREP_TIME: 120,  // frames before first spawn
  DESCENT_DURATION: 120,  // frames of descent between phases
  DEPTH_PER_DESCENT: 100,

  // Network
  PEER_PREFIX: 'deepdive-',
  STATE_BROADCAST_INTERVAL: 3,  // frames between broadcasts (~20Hz)

  // Particles
  PARTICLE_MAX: 256,
  PARTICLE_MAX_MOBILE: 128,
};
