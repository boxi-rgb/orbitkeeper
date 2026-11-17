// The screenshot scenes behind ?shot=start|play|clear|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by an
// autopilot, so the frame is what a short game really looks like and the same seed
// always gives the same frame. The good pilot chases the nearest shard, keeps its
// ring aligned with it, pulses rocks that come close and dodges the rest; the end
// scene's pilot barely reacts, so the rocks get through, as they do for a player
// who has given up.

import { DRONE, PULSE, RINGS, STEP } from './config.js';
// DRONE is used for the bubble reach in the pulse decision below.
import {
  KIND_ROCK, PHASE_CLEAR, PHASE_OVER, polar,
} from './world.js';

const START_SECONDS = 4;
const PLAY_SECONDS = 12;
const PLAY_LIMIT_SECONDS = 75;
const CLEAR_LIMIT_SECONDS = 300;
const END_LIMIT_SECONDS = 900;
/** How often the careless pilot of the end scene reconsiders, in steps. */
const SLOPPY_EVERY = 14;

function angleDiff(a, b) {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function nearestRing(distance) {
  let best = 0;
  for (let i = 1; i < RINGS.length; i += 1) {
    if (Math.abs(RINGS[i] - distance) < Math.abs(RINGS[best] - distance)) best = i;
  }
  return best;
}

function dronePos(state) {
  return polar(state.drone.angle, state.drone.radius);
}

/** The good pilot's steering for one step, from the world's state alone. */
function goodPilot(state) {
  const drone = state.drone;
  // First duty: intercept the rock closest to the planet, with the shield bubble.
  let threat = null;
  for (const item of state.items) {
    if (!item.active || item.kind !== KIND_ROCK) continue;
    if (threat === null || item.distance < threat.distance) threat = item;
  }
  let target = null;
  for (const item of state.items) {
    if (!item.active || item.kind === KIND_ROCK) continue;
    if (target === null || item.distance < target.distance) target = item;
  }
  let angleTarget = drone.angle;
  let wantedRing = drone.ring;
  if (threat && threat.distance < 330) {
    angleTarget = threat.angle;
    wantedRing = nearestRing(threat.distance);
  } else if (target) {
    angleTarget = target.angle;
    if (target.distance < 340) wantedRing = nearestRing(target.distance);
  }
  // Pulse a rock that is close but not on a line the bubble can cover in time.
  let pulse = false;
  const at = dronePos(state);
  for (const item of state.items) {
    if (!item.active || item.kind !== KIND_ROCK) continue;
    const pos = polar(item.angle, item.distance);
    const gap = Math.hypot(pos.x - at.x, pos.y - at.y);
    if (gap < PULSE.radius * 0.85 && gap > DRONE.guardRadius + 26 && state.pulse.cooldown <= 0) pulse = true;
  }
  return { angleTarget, keyTurn: 0, ringDelta: Math.sign(wantedRing - drone.ring), pulse };
}

/** The careless pilot: reconsiders rarely, never pulses, wanders toward shards late. */
function sloppyPilot(state, stepIndex) {
  const drone = state.drone;
  if (stepIndex % SLOPPY_EVERY !== 0) {
    return { angleTarget: sloppyPilot.angle ?? drone.angle, keyTurn: 0, ringDelta: 0, pulse: false };
  }
  let target = null;
  for (const item of state.items) {
    if (!item.active || item.kind === KIND_ROCK) continue;
    if (target === null || item.distance < target.distance) target = item;
  }
  sloppyPilot.angle = target ? target.angle : drone.angle;
  return { angleTarget: sloppyPilot.angle, keyTurn: 0, ringDelta: 0, pulse: false };
}

/**
 * Set `world` to the named scene (start, play, clear or end; any other name is
 * start) and return the screen to draw over it, the best score to show, and the
 * events of the last steps for the renderer to turn into effects.
 */
export function stageShot(name, world) {
  world.reset();
  sloppyPilot.angle = undefined;
  if (name !== 'play' && name !== 'clear' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, {}, true);
    return { screen: 'title', best: 0, fxEvents: [] };
  }
  if (name === 'play') {
    // Play until a frame busy enough to show the game at work: several shards and
    // rocks on screen at once and a combo running. The search is deterministic —
    // the same seed always stops on the same frame.
    let fxEvents = [];
    const limit = PLAY_LIMIT_SECONDS / STEP;
    const warmup = PLAY_SECONDS / STEP;
    for (let i = 0; i < limit; i += 1) {
      const events = world.step(STEP, goodPilot(world.state), false);
      fxEvents = fxEvents.concat(events).slice(-14);
      if (i < warmup || world.state.phase !== 'play') continue;
      let rocks = 0;
      let active = 0;
      for (const item of world.state.items) {
        if (!item.active) continue;
        active += 1;
        if (item.kind === KIND_ROCK) rocks += 1;
      }
      if (active >= 9 && rocks >= 2 && world.state.combo >= 3) break;
    }
    return { screen: 'play', best: 0, fxEvents };
  }
  if (name === 'clear') {
    let fxEvents = [];
    const limit = CLEAR_LIMIT_SECONDS / STEP;
    for (let i = 0; i < limit; i += 1) {
      const events = world.step(STEP, goodPilot(world.state), false);
      if (world.state.phase === PHASE_CLEAR) {
        fxEvents = events.filter((event) => event.type === 'waveClear');
        break;
      }
    }
    // A beat into the celebration, with the banner up and fireworks going.
    for (let i = 0; i < 0.55 / STEP; i += 1) world.step(STEP, goodPilot(world.state), false);
    if (fxEvents.length === 0) fxEvents = [{ type: 'waveClear', x: 640, y: 392 }];
    return { screen: 'play', best: 0, fxEvents };
  }
  const limit = END_LIMIT_SECONDS / STEP;
  for (let i = 0; i < limit; i += 1) {
    world.step(STEP, sloppyPilot(world.state, i), false);
    if (world.state.phase === PHASE_OVER) break;
  }
  return { screen: 'over', best: world.state.score, fxEvents: [] };
}
