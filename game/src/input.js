// Keyboard and mouse input. Two kinds of reading come out of here:
//   readControl()  the steering for one simulation step: an angle target from the
//                  mouse, a key turn when the mouse is idle, ring changes queued by
//                  the wheel and the up/down keys, and whether the pulse fired.
//   takeActions()  the one-shot menu actions (confirm, restart, pause, continue,
//                  mute) pressed since the last call, as a bitmask.
// The mouse steers by position: the drone swings toward the angle of the pointer
// around the planet. Clicking fires the pulse in play and confirms in menus.

import { FIELD, PLANET } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_RESTART = 2;
export const ACTION_PAUSE = 4;
export const ACTION_CONTINUE = 8;
export const ACTION_MUTE = 16;

/** How long after the mouse last moved it still owns the steering, in seconds. */
const MOUSE_HOLD = 4;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouse = null;
  let mouseAge = Infinity;
  let ringQueue = 0;
  let pulseQueued = false;

  function toLogical(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * FIELD.width,
      y: ((event.clientY - rect.top) / rect.height) * FIELD.height,
    };
  }

  canvas.addEventListener('pointermove', (event) => {
    mouse = toLogical(event);
    mouseAge = 0;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouse = toLogical(event);
    mouseAge = 0;
    actions |= ACTION_CONFIRM;
    pulseQueued = true;
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    ringQueue += event.deltaY > 0 ? 1 : -1;
  }, { passive: false });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) event.preventDefault();
      return;
    }
    keys.add(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    if (event.key === 'Enter' || event.key === ' ') actions |= ACTION_CONFIRM;
    if (event.key === ' ') pulseQueued = true;
    if (event.key === 'r' || event.key === 'R') actions |= ACTION_RESTART;
    if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') actions |= ACTION_PAUSE;
    if (event.key === 'c' || event.key === 'C') actions |= ACTION_CONTINUE;
    if (event.key === 'm' || event.key === 'M') actions |= ACTION_MUTE;
    if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') ringQueue -= 1;
    if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') ringQueue += 1;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  });
  window.addEventListener('blur', () => keys.clear());

  /** The steering for one step; dt ages the mouse so keys take over when it rests. */
  function readControl(dt) {
    mouseAge += dt;
    let angleTarget = null;
    let keyTurn = 0;
    if (mouse && mouseAge < MOUSE_HOLD) {
      angleTarget = Math.atan2(mouse.y - PLANET.y, mouse.x - PLANET.x);
    } else {
      if (keys.has('ArrowLeft') || keys.has('a')) keyTurn -= 1;
      if (keys.has('ArrowRight') || keys.has('d')) keyTurn += 1;
    }
    const ringDelta = Math.max(-1, Math.min(1, ringQueue));
    ringQueue = 0;
    const pulse = pulseQueued;
    pulseQueued = false;
    return { angleTarget, keyTurn, ringDelta, pulse };
  }

  /** The menu actions pressed since the last call; reading clears them. */
  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  return { readControl, takeActions };
}
