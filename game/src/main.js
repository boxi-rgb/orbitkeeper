// Boot and the one loop: input is read every step, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), the renderer paints
// what is there, and the sound board answers the world's events. The game moves
// between five screens: title, play, paused, game over and victory.
//
// ?seed=N fixes the falling pattern. ?shot=start|play|clear|end (with &seed=N)
// stages that scene instead of running the loop, paints it and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, PHASE_OVER, PHASE_VICTORY } from './world.js';
import {
  ACTION_CONFIRM, ACTION_CONTINUE, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import {
  SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY, createRenderer,
} from './render.js';
import { createSoundBoard } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const sound = createSoundBoard();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const screen = { title: SCREEN_TITLE, play: SCREEN_PLAY, over: SCREEN_OVER }[scene.screen] ?? SCREEN_TITLE;
  renderer.fx(scene.fxEvents);
  renderer.tickFx(0.15);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Catch the shards, protect the planet.');
  }

  function finishScreen(next) {
    screen = next;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(next === SCREEN_VICTORY
      ? `The planet is saved. Score ${world.state.score}.`
      : `Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function playEvents(events) {
    renderer.fx(events);
    for (const event of events) {
      if (event.type === 'catch') sound.catch(event.combo);
      else if (event.type === 'gold') sound.gold();
      else if (event.type === 'pulse') sound.pulse();
      else if (event.type === 'pulseKill') sound.pulseKill();
      else if (event.type === 'planetHit') sound.planetHit();
      else if (event.type === 'deflect') sound.deflect();
      else if (event.type === 'shardLost') sound.shardLost();
      else if (event.type === 'waveClear') sound.waveClear();
      else if (event.type === 'victory') sound.victory();
      else if (event.type === 'gameOver') sound.gameOver();
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      announce(sound.toggleMute() ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE && (actions & ACTION_CONFIRM)) startGame();
    else if (screen === SCREEN_PLAY && (actions & ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (screen === SCREEN_PAUSED && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    } else if (screen === SCREEN_OVER && (actions & (ACTION_RESTART | ACTION_CONFIRM))) startGame();
    else if (screen === SCREEN_VICTORY && (actions & ACTION_RESTART)) startGame();
    else if (screen === SCREEN_VICTORY && (actions & ACTION_CONTINUE)) {
      world.continueEndless();
      screen = SCREEN_PLAY;
      announce('Endless mode. The waves keep coming.');
    } else if (screen === SCREEN_PLAY && (actions & ACTION_RESTART)) startGame();
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, {}, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, input.readControl(STEP), false);
    playEvents(events);
    if (world.state.phase === PHASE_VICTORY && screen === SCREEN_PLAY) finishScreen(SCREEN_VICTORY);
    else if (world.state.phase === PHASE_OVER && screen === SCREEN_PLAY) finishScreen(SCREEN_OVER);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameSeconds = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += frameSeconds;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.tickFx(frameSeconds);
    renderer.draw(world.state, screen, best, sound.muted);
  }

  window.addEventListener('pointerdown', () => sound.unlock());
  window.addEventListener('keydown', () => sound.unlock());

  // Leaving the tab pauses a running game rather than letting rocks fall unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // A small handle for automated play-tests: the world and the current screen.
  window.__orbitkeeper = { world, screen: () => screen };

  announce('Orbitkeeper. Click or press Enter to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
