// The simulation of Orbitkeeper, with no drawing and no DOM: a planet at the centre of
// the field, a drone riding one of three orbit rings around it, and shards and rocks
// falling in from deep space toward the planet. Everything moves in polar coordinates
// (angle, distance from the planet), which is what makes the game feel round.
//
// The player steers the drone to catch shards (score, combo, wave quota) and to
// guard the planet: the drone's shield bubble deflects any rock that comes within
// its reach, its pulse breaks rocks a little further out, and a rock that slips
// past both smashes the planet (integrity). Clearing the last wave wins; losing
// all integrity ends the game.
//
// step(dt, control, ambient) advances one fixed step and returns the events that
// happened in it, as plain objects the renderer and the sound board consume:
//   { type: 'catch' | 'gold' | 'pulseKill' | 'deflect' | 'planetHit' | 'shardLost'
//           | 'pulse' | 'waveClear' | 'victory' | 'gameOver', x, y, ... }
// In ambient mode (the title screen's backdrop) things fall and fade at the planet
// with no collisions, no score and no events.

import {
  COMBO, DRIFT, DRONE, INTEGRITY, PLANET, POOL_SIZE, PULSE, RINGS, ROCK,
  SHARD, SPAWN_DISTANCE, WAVE,
} from './config.js';

export const PHASE_PLAY = 'play';
export const PHASE_CLEAR = 'clear';
export const PHASE_OVER = 'over';
export const PHASE_VICTORY = 'victory';

export const KIND_SHARD = 'shard';
export const KIND_GOLD = 'gold';
export const KIND_ROCK = 'rock';

/** Cartesian position of a polar point around the planet. */
export function polar(angle, distance) {
  return { x: PLANET.x + Math.cos(angle) * distance, y: PLANET.y + Math.sin(angle) * distance };
}

/** The multiplier a combo count earns. */
export function multiplierFor(combo) {
  return Math.min(1 + Math.floor(combo / COMBO.perStep), COMBO.maxMultiplier);
}

/** Shards to catch to clear a wave. */
export function quotaFor(wave) {
  return WAVE.quotaBase + WAVE.quotaPerWave * (wave - 1);
}

function makeItem() {
  return {
    active: false, kind: KIND_SHARD, angle: 0, distance: 0, speed: 0,
    swayPhase: 0, swayRate: 0, spin: 0, spinRate: 0, size: SHARD.size, seed: 0,
  };
}

/** Create a world whose falling pattern comes from the given seeded generator. */
export function createWorld(random) {
  const items = [];
  for (let i = 0; i < POOL_SIZE; i += 1) items.push(makeItem());

  const state = {
    time: 0,
    phase: PHASE_PLAY,
    endless: false,
    wave: 1,
    score: 0,
    combo: 0,
    bestCombo: 0,
    caught: 0,
    quota: quotaFor(1),
    integrity: INTEGRITY,
    drone: { angle: -Math.PI / 2, ring: 1, radius: RINGS[1] },
    pulse: { cooldown: 0, age: -1 },
    clearTimer: 0,
    shake: 0,
    items,
  };

  let shardTimer = 0.4;
  let rockTimer = 1.6;

  function reset() {
    state.time = 0;
    state.phase = PHASE_PLAY;
    state.endless = false;
    state.wave = 1;
    state.score = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.caught = 0;
    state.quota = quotaFor(1);
    state.integrity = INTEGRITY;
    state.drone.angle = -Math.PI / 2;
    state.drone.ring = 1;
    state.drone.radius = RINGS[1];
    state.pulse.cooldown = 0;
    state.pulse.age = -1;
    state.clearTimer = 0;
    state.shake = 0;
    for (const item of items) item.active = false;
    shardTimer = 0.4;
    rockTimer = 1.6;
  }

  function spawn(kind) {
    const item = items.find((entry) => !entry.active);
    if (!item) return;
    const growth = 1 + (state.wave - 1) * 0.04;
    item.active = true;
    item.kind = kind;
    item.angle = random.range(0, Math.PI * 2);
    item.distance = SPAWN_DISTANCE + random.range(0, 90);
    const base = kind === KIND_ROCK ? DRIFT.rockSpeed : DRIFT.shardSpeed;
    item.speed = (base + (state.wave - 1) * DRIFT.speedPerWave) * growth * random.range(1 - DRIFT.speedJitter, 1 + DRIFT.speedJitter);
    item.swayPhase = random.range(0, Math.PI * 2);
    item.swayRate = DRIFT.swayRate * random.range(0.7, 1.3);
    item.spin = random.range(0, Math.PI * 2);
    item.spinRate = random.range(-1.6, 1.6);
    item.size = kind === KIND_ROCK ? ROCK.size * random.range(0.8, 1.3) : SHARD.size;
    item.seed = random.next();
  }

  function dronePos() {
    return polar(state.drone.angle, state.drone.radius);
  }

  function moveDrone(dt, control) {
    const drone = state.drone;
    if (control.ringDelta) {
      drone.ring = Math.min(RINGS.length - 1, Math.max(0, drone.ring + control.ringDelta));
    }
    const targetRadius = RINGS[drone.ring];
    drone.radius += (targetRadius - drone.radius) * Math.min(1, DRONE.ringEase * dt);
    if (control.angleTarget !== null && control.angleTarget !== undefined) {
      let diff = control.angleTarget - drone.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = DRONE.turnSpeed * dt;
      drone.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
    } else if (control.keyTurn) {
      drone.angle += control.keyTurn * DRONE.turnSpeed * dt;
    }
  }

  function firePulse(events) {
    const pulse = state.pulse;
    if (pulse.cooldown > 0 || state.phase !== PHASE_PLAY) return;
    pulse.cooldown = PULSE.cooldown;
    pulse.age = 0;
    const at = dronePos();
    events.push({ type: 'pulse', x: at.x, y: at.y });
  }

  function growPulse(dt, events) {
    const pulse = state.pulse;
    if (pulse.cooldown > 0) pulse.cooldown -= dt;
    if (pulse.age < 0) return;
    pulse.age += dt;
    const reach = PULSE.radius * Math.min(1, pulse.age / PULSE.duration);
    const at = dronePos();
    for (const item of items) {
      if (!item.active || item.kind !== KIND_ROCK) continue;
      const pos = polar(item.angle, item.distance);
      if (Math.hypot(pos.x - at.x, pos.y - at.y) <= reach + item.size) {
        item.active = false;
        state.score += PULSE.points * multiplierFor(state.combo);
        events.push({ type: 'pulseKill', x: pos.x, y: pos.y });
      }
    }
    if (pulse.age >= PULSE.duration) pulse.age = -1;
  }

  function endGame(events, why) {
    state.phase = PHASE_OVER;
    events.push({ type: 'gameOver', x: PLANET.x, y: PLANET.y, why });
  }

  function catchShard(item, pos, events) {
    item.active = false;
    state.combo += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    const gold = item.kind === KIND_GOLD;
    const base = gold ? SHARD.goldPoints : SHARD.points;
    const gained = base * multiplierFor(state.combo);
    state.score += gained;
    state.caught += 1;
    events.push({ type: gold ? 'gold' : 'catch', x: pos.x, y: pos.y, gained, combo: state.combo });
    if (state.caught >= state.quota) {
      const bonus = WAVE.bonusPerWave * state.wave;
      state.score += bonus;
      if (state.wave >= WAVE.lastWave && !state.endless) {
        state.phase = PHASE_VICTORY;
        events.push({ type: 'victory', x: PLANET.x, y: PLANET.y, bonus });
      } else {
        state.phase = PHASE_CLEAR;
        state.clearTimer = WAVE.clearSeconds;
        events.push({ type: 'waveClear', x: PLANET.x, y: PLANET.y, bonus, wave: state.wave });
      }
    }
  }

  function collide(events) {
    const drone = dronePos();
    for (const item of items) {
      if (!item.active) continue;
      const pos = polar(item.angle, item.distance);
      const gap = Math.hypot(pos.x - drone.x, pos.y - drone.y);
      if (item.kind !== KIND_ROCK) {
        if (gap <= DRONE.catchRadius) {
          catchShard(item, pos, events);
          continue;
        }
      } else if (gap <= DRONE.guardRadius + item.size * 0.4) {
        // The shield bubble turns the rock aside: no damage, a few points.
        item.active = false;
        state.score += DRONE.deflectPoints;
        events.push({ type: 'deflect', x: pos.x, y: pos.y });
        continue;
      }
      if (item.distance <= PLANET.radius + item.size * 0.5) {
        item.active = false;
        if (item.kind === KIND_ROCK) {
          state.integrity -= 1;
          state.shake = Math.max(state.shake, 10);
          events.push({ type: 'planetHit', x: pos.x, y: pos.y });
          if (state.integrity <= 0) { endGame(events, 'planet'); return; }
        } else {
          state.combo = 0;
          events.push({ type: 'shardLost', x: pos.x, y: pos.y });
        }
      }
    }
  }

  function driftItems(dt) {
    for (const item of items) {
      if (!item.active) continue;
      item.distance -= item.speed * dt;
      item.angle += Math.sin(state.time * item.swayRate + item.swayPhase) * DRIFT.sway * dt;
      item.spin += item.spinRate * dt;
    }
  }

  function step(dt, control, ambient = false) {
    const events = [];
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);

    if (ambient) {
      state.drone.angle += dt * 0.3;
      state.drone.radius += (RINGS[1] - state.drone.radius) * Math.min(1, dt * 2);
      shardTimer -= dt;
      rockTimer -= dt;
      if (shardTimer <= 0) { spawn(random.chance(SHARD.goldChance) ? KIND_GOLD : KIND_SHARD); shardTimer = DRIFT.shardInterval * 1.4; }
      if (rockTimer <= 0) { spawn(KIND_ROCK); rockTimer = DRIFT.rockInterval * 1.6; }
      driftItems(dt);
      for (const item of items) if (item.active && item.distance <= PLANET.radius + 6) item.active = false;
      return events;
    }

    if (state.phase === PHASE_CLEAR) {
      state.clearTimer -= dt;
      driftItems(dt);
      if (state.clearTimer <= 0) {
        state.wave += 1;
        state.caught = 0;
        state.quota = quotaFor(state.wave);
        state.phase = PHASE_PLAY;
        shardTimer = Math.min(shardTimer, 0.3);
        rockTimer = Math.min(rockTimer, 1.1);
      }
      return events;
    }
    if (state.phase !== PHASE_PLAY) return events;

    moveDrone(dt, control);
    if (control.pulse) firePulse(events);
    growPulse(dt, events);

    const intervalScale = Math.pow(DRIFT.intervalPerWave, state.wave - 1);
    shardTimer -= dt;
    rockTimer -= dt;
    if (shardTimer <= 0) {
      spawn(random.chance(SHARD.goldChance) ? KIND_GOLD : KIND_SHARD);
      shardTimer = Math.max(DRIFT.minShardInterval, DRIFT.shardInterval * intervalScale) * random.range(0.75, 1.25);
    }
    if (rockTimer <= 0) {
      spawn(KIND_ROCK);
      rockTimer = Math.max(DRIFT.minRockInterval, DRIFT.rockInterval * intervalScale) * random.range(0.75, 1.3);
    }

    driftItems(dt);
    collide(events);
    return events;
  }

  /** After victory, keep playing endless waves from the next one. */
  function continueEndless() {
    if (state.phase !== PHASE_VICTORY) return;
    state.endless = true;
    state.wave += 1;
    state.caught = 0;
    state.quota = quotaFor(state.wave);
    state.phase = PHASE_PLAY;
  }

  return { state, reset, step, continueEndless };
}
