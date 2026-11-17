// Every tuning number and colour of Orbitkeeper in one place. The playfield is a fixed
// 1280x720 logical area with the planet at its centre; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The planet the player defends: its centre and radius in the logical field. */
export const PLANET = { x: 640, y: 392, radius: 46 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The three orbit rings the drone can ride, as radii from the planet's centre. */
export const RINGS = [118, 178, 238];

export const DRONE = {
  /** How fast the drone swings around the planet, radians per second. */
  turnSpeed: 4.2,
  /** How fast its radius eases toward the ring it is heading for, per second. */
  ringEase: 7,
  /** A shard this close to the drone is caught. */
  catchRadius: 38,
  /** A rock this close to the drone is deflected by its shield bubble. */
  guardRadius: 66,
  /** Score for a rock the bubble deflects. */
  deflectPoints: 5,
};

export const PULSE = {
  /** The shockwave's reach when fully grown. */
  radius: 165,
  /** Seconds the shockwave takes to grow and fade. */
  duration: 0.38,
  /** Seconds between shockwaves. */
  cooldown: 4,
  /** Score for each rock the shockwave breaks. */
  points: 15,
};

/** How far from the planet falling things appear. */
export const SPAWN_DISTANCE = 580;

export const SHARD = {
  /** Chance a falling shard is a golden one worth five times as much. */
  goldChance: 0.12,
  points: 10,
  goldPoints: 50,
  size: 13,
};

export const ROCK = { size: 17 };

export const WAVE = {
  /** Shards to catch to clear wave n: quotaBase + quotaPerWave * (n - 1). */
  quotaBase: 6,
  quotaPerWave: 2,
  /** Clearing this wave wins the game (endless play may continue after). */
  lastWave: 5,
  /** Bonus for clearing wave n: bonusPerWave * n. */
  bonusPerWave: 100,
  /** Seconds the wave-clear banner and fireworks last. */
  clearSeconds: 2.4,
};

/** Falling speeds and spawn intervals at wave 1, and how they grow per wave. */
export const DRIFT = {
  shardSpeed: 60,
  rockSpeed: 74,
  speedPerWave: 8,
  speedJitter: 0.25,
  shardInterval: 1.05,
  rockInterval: 2.1,
  intervalPerWave: 0.93,
  minShardInterval: 0.5,
  minRockInterval: 0.95,
  /** Sideways wander of a falling thing, radians of swing and its rate. */
  sway: 0.16,
  swayRate: 1.4,
};

export const INTEGRITY = 3;

/** Combo needed per multiplier step: x1 + one per comboPerStep catches, capped. */
export const COMBO = { perStep: 4, maxMultiplier: 6 };

/** How many falling things can exist at once; the pool is allocated once, at boot. */
export const POOL_SIZE = 72;

export const PALETTE = {
  spaceTop: '#05081a',
  spaceBottom: '#101b45',
  nebulaA: 'rgba(64, 60, 180, 0.20)',
  nebulaB: 'rgba(14, 116, 144, 0.16)',
  ring: 'rgba(148, 184, 255, 0.16)',
  ringActive: 'rgba(148, 220, 255, 0.45)',
  planetDeep: '#0e6e6b',
  planet: '#17a398',
  planetLight: '#7fe7dc',
  atmosphere: 'rgba(110, 231, 220, 0.35)',
  drone: '#eaf6ff',
  droneAccent: '#38bdf8',
  flame: '#ffb454',
  shard: '#67e8f9',
  shardCore: '#ecfeff',
  gold: '#fcd34d',
  goldCore: '#fffbeb',
  rock: '#c65b3f',
  rockDark: '#8a3b28',
  rockLight: '#e88a68',
  danger: '#fb7185',
  text: '#eef4ff',
  muted: '#93a4c8',
  panel: 'rgba(10, 16, 38, 0.72)',
  panelEdge: 'rgba(148, 184, 255, 0.35)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'orbitkeeper.best';
