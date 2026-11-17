// All drawing. The renderer reads the world state and paints: deep space with a
// twinkling starfield, the orbit rings, the planet, the falling shards and rocks,
// the drone, the HUD, and the title / paused / game-over / victory screens over it.
// It also owns the purely visual effects — particles, floating score text, the red
// flash when the planet is hit — fed by the world's events through fx() and aged
// by tickFx(). Nothing here changes the game.

import {
  COMBO, DRONE, FIELD, FONT, INTEGRITY, PALETTE, PLANET, PULSE, RINGS,
} from './config.js';
import { createRandom } from './random.js';
import {
  KIND_GOLD, KIND_ROCK, PHASE_CLEAR, PHASE_VICTORY, multiplierFor, polar, quotaFor,
} from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

const TAU = Math.PI * 2;

/** Deterministic per-item variation in [0, 1) from a seed and an index. */
function hash01(seed, index) {
  const x = Math.sin(seed * 127.1 + index * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const fxRandom = createRandom(20261115);

  // The starfield is fixed: positions and twinkle phases from one seeded stream.
  const stars = [];
  {
    const rng = createRandom(987654321);
    for (let i = 0; i < 150; i += 1) {
      stars.push({
        x: rng.range(0, FIELD.width), y: rng.range(0, FIELD.height),
        r: rng.range(0.6, 2.1), phase: rng.range(0, TAU), speed: rng.range(0.4, 1.6),
      });
    }
  }

  let particles = [];
  let floaters = [];
  let flash = 0;

  /** Spawn the visual effects for one step's world events. */
  function fx(events) {
    for (const event of events) {
      if (event.type === 'catch' || event.type === 'gold') {
        burst(event.x, event.y, event.type === 'gold' ? PALETTE.gold : PALETTE.shard, event.type === 'gold' ? 22 : 13);
        floaters.push({ x: event.x, y: event.y - 14, text: `+${event.gained}`, life: 0, color: event.type === 'gold' ? PALETTE.gold : PALETTE.shardCore });
      } else if (event.type === 'pulseKill') {
        burst(event.x, event.y, PALETTE.rockLight, 16);
      } else if (event.type === 'deflect') {
        burst(event.x, event.y, '#a5f3fc', 9);
      } else if (event.type === 'planetHit') {
        burst(event.x, event.y, PALETTE.danger, 26);
        flash = 0.55;
      } else if (event.type === 'droneHit') {
        burst(event.x, event.y, PALETTE.danger, 20);
        flash = 0.35;
      } else if (event.type === 'waveClear' || event.type === 'victory') {
        for (let i = 0; i < 5; i += 1) {
          const at = polar(fxRandom.range(0, TAU), fxRandom.range(90, 300));
          burst(at.x, at.y, fxRandom.pick([PALETTE.shard, PALETTE.gold, PALETTE.planetLight, PALETTE.droneAccent]), 18);
        }
      }
    }
    floaters = floaters.slice(-24);
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = fxRandom.range(0, TAU);
      const speed = fxRandom.range(30, 230);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0, maxLife: fxRandom.range(0.35, 0.9),
        color, size: fxRandom.range(1.4, 3.6),
      });
    }
    if (particles.length > 420) particles.splice(0, particles.length - 420);
  }

  /** Age every effect by dt seconds. */
  function tickFx(dt) {
    for (const p of particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    particles = particles.filter((p) => p.life < p.maxLife);
    for (const f of floaters) {
      f.life += dt;
      f.y -= 34 * dt;
    }
    floaters = floaters.filter((f) => f.life < 0.9);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.4);
  }

  function drawBackground(state) {
    const gradient = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.spaceTop);
    gradient.addColorStop(1, PALETTE.spaceBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const [x, y, r, color] of [[250, 130, 300, PALETTE.nebulaA], [1060, 560, 340, PALETTE.nebulaB], [1080, 110, 200, PALETTE.nebulaA]]) {
      const nebula = ctx.createRadialGradient(x, y, 0, x, y, r);
      nebula.addColorStop(0, color);
      nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = nebula;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (const star of stars) {
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(state.time * star.speed + star.phase));
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = '#dbeafe';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRings(state) {
    RINGS.forEach((radius, index) => {
      ctx.beginPath();
      ctx.arc(PLANET.x, PLANET.y, radius, 0, TAU);
      ctx.strokeStyle = index === state.drone.ring ? PALETTE.ringActive : PALETTE.ring;
      ctx.lineWidth = index === state.drone.ring ? 2 : 1.2;
      ctx.setLineDash([4, 9]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  function drawPlanet(state) {
    const { x, y, radius } = PLANET;
    const atmosphere = ctx.createRadialGradient(x, y, radius * 0.8, x, y, radius * 1.65);
    atmosphere.addColorStop(0, PALETTE.atmosphere);
    atmosphere.addColorStop(1, 'rgba(110, 231, 220, 0)');
    ctx.fillStyle = atmosphere;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.65, 0, TAU);
    ctx.fill();

    const body = ctx.createRadialGradient(x - radius * 0.4, y - radius * 0.45, radius * 0.15, x, y, radius * 1.05);
    body.addColorStop(0, PALETTE.planetLight);
    body.addColorStop(0.45, PALETTE.planet);
    body.addColorStop(1, PALETTE.planetDeep);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();

    // Continents drift slowly as the planet turns.
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius - 1.5, 0, TAU);
    ctx.clip();
    ctx.fillStyle = 'rgba(6, 78, 74, 0.35)';
    const turn = state.time * 0.03;
    for (const [offset, w, h, dy] of [[0.4, 30, 15, -12], [2.4, 22, 11, 10], [4.2, 36, 17, 2], [5.5, 16, 9, -20]]) {
      const cx = x + Math.cos(turn + offset) * radius * 0.55;
      ctx.beginPath();
      ctx.ellipse(cx, y + dy, w, h, 0.3, 0, TAU);
      ctx.fill();
    }
    if (state.integrity < INTEGRITY) {
      ctx.strokeStyle = 'rgba(10, 20, 30, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 18, y - 30);
      ctx.lineTo(x - 6, y - 8);
      ctx.lineTo(x - 16, y + 14);
      ctx.stroke();
    }
    if (state.integrity < INTEGRITY - 1) {
      ctx.beginPath();
      ctx.moveTo(x + 24, y - 18);
      ctx.lineTo(x + 12, y + 2);
      ctx.lineTo(x + 22, y + 26);
      ctx.stroke();
      ctx.fillStyle = 'rgba(251, 113, 133, 0.5)';
      ctx.beginPath();
      ctx.arc(x + 8, y + 20, 4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawShard(item, pos) {
    const gold = item.kind === KIND_GOLD;
    const size = gold ? item.size * 1.25 : item.size;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(item.spin);
    ctx.shadowColor = gold ? PALETTE.gold : PALETTE.shard;
    ctx.shadowBlur = 16;
    ctx.fillStyle = gold ? PALETTE.gold : PALETTE.shard;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.62, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.62, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = gold ? PALETTE.goldCore : PALETTE.shardCore;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.45);
    ctx.lineTo(size * 0.28, 0);
    ctx.lineTo(0, size * 0.45);
    ctx.lineTo(-size * 0.28, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawRock(item, pos) {
    const size = item.size;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(item.spin);
    ctx.beginPath();
    const points = 8;
    for (let i = 0; i < points; i += 1) {
      const angle = (i / points) * TAU;
      const r = size * (0.78 + hash01(item.seed, i) * 0.4);
      if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
      else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.fillStyle = PALETTE.rock;
    ctx.fill();
    ctx.strokeStyle = PALETTE.rockLight;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = PALETTE.rockDark;
    for (const [i, fx, fy, fr] of [[11, -0.3, -0.2, 0.22], [23, 0.28, 0.3, 0.16], [37, 0.1, -0.42, 0.12]]) {
      ctx.beginPath();
      ctx.arc((fx + (hash01(item.seed, i) - 0.5) * 0.2) * size, fy * size, fr * size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawItems(state) {
    for (const item of state.items) {
      if (!item.active) continue;
      const pos = polar(item.angle, item.distance);
      if (item.kind === KIND_ROCK) drawRock(item, pos);
      else drawShard(item, pos);
    }
  }

  function drawDrone(state) {
    const drone = state.drone;
    const pos = polar(drone.angle, drone.radius);
    // The pulse shockwave, growing out of the drone.
    if (state.pulse.age >= 0) {
      const reach = PULSE.radius * Math.min(1, state.pulse.age / PULSE.duration);
      const alpha = 1 - state.pulse.age / PULSE.duration;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, reach, 0, TAU);
      ctx.strokeStyle = `rgba(125, 211, 252, ${0.75 * alpha})`;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.fillStyle = `rgba(125, 211, 252, ${0.1 * alpha})`;
      ctx.fill();
    }
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(drone.angle + Math.PI / 2);
    // Engine flame, always flickering a little.
    const flame = 8 + Math.sin(state.time * 31) * 2.5 + (state.phase === 'play' ? 3 : 0);
    ctx.fillStyle = PALETTE.flame;
    ctx.beginPath();
    ctx.moveTo(-4.5, 13);
    ctx.lineTo(0, 13 + flame);
    ctx.lineTo(4.5, 13);
    ctx.closePath();
    ctx.fill();
    // Hull: a sleek dart with swept wings.
    ctx.shadowColor = PALETTE.droneAccent;
    ctx.shadowBlur = 12;
    ctx.fillStyle = PALETTE.drone;
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(5, -2);
    ctx.lineTo(15, 11);
    ctx.lineTo(6, 9);
    ctx.lineTo(3.5, 13);
    ctx.lineTo(-3.5, 13);
    ctx.lineTo(-6, 9);
    ctx.lineTo(-15, 11);
    ctx.lineTo(-5, -2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.droneAccent;
    ctx.beginPath();
    ctx.arc(0, -4, 3.4, 0, TAU);
    ctx.fill();
    ctx.restore();
    // The shield bubble: any rock crossing this circle is turned aside.
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, DRONE.guardRadius, 0, TAU);
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.30)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 7]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(165, 243, 252, 0.045)';
    ctx.fill();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = 1 - p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const f of floaters) {
      ctx.globalAlpha = 1 - f.life / 0.9;
      ctx.fillStyle = f.color;
      ctx.font = `700 19px ${FONT}`;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function heart(x, y, size, filled, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 20, size / 20);
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.bezierCurveTo(-11, -3, -7, -11, 0, -5.5);
    ctx.bezierCurveTo(7, -11, 11, -3, 0, 6);
    ctx.closePath();
    if (filled) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    ctx.restore();
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
  }

  function drawHud(state, muted) {
    ctx.textBaseline = 'alphabetic';
    // Score and combo, top left.
    panel(18, 16, 252, 86);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText('SCORE', 34, 40);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 32px ${FONT}`;
    ctx.fillText(String(state.score).padStart(6, '0'), 34, 74);
    const multiplier = multiplierFor(state.combo);
    ctx.textAlign = 'right';
    ctx.fillStyle = multiplier > 1 ? PALETTE.gold : PALETTE.muted;
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText(`x${multiplier}`, 254, 52);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(`COMBO ${state.combo}`, 254, 70);
    const intoStep = (state.combo % COMBO.perStep) / COMBO.perStep;
    ctx.fillStyle = 'rgba(148, 184, 255, 0.25)';
    ctx.fillRect(34, 84, 220, 5);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(34, 84, 220 * (multiplier >= COMBO.maxMultiplier ? 1 : intoStep), 5);

    // Wave and quota, top centre.
    panel(490, 16, 300, 86);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText(state.endless && state.wave > 5 ? `WAVE ${state.wave} · ENDLESS` : `WAVE ${state.wave} OF 5`, 640, 40);
    const quota = quotaFor(state.wave);
    for (let i = 0; i < quota; i += 1) {
      const x = 640 + (i - (quota - 1) / 2) * 24;
      ctx.save();
      ctx.translate(x, 66);
      ctx.rotate(Math.PI / 4);
      const s = 7;
      ctx.fillStyle = i < state.caught ? PALETTE.shard : 'rgba(148, 184, 255, 0.22)';
      ctx.fillRect(-s / 1.4, -s / 1.4, s * 1.43, s * 1.43);
      ctx.restore();
    }

    // Planet integrity and the run's best combo, top right.
    panel(1010, 16, 252, 86);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText('PLANET', 1026, 42);
    ctx.fillText('BEST COMBO', 1026, 76);
    for (let i = 0; i < INTEGRITY; i += 1) heart(1124 + i * 30, 36, 19, i < state.integrity, i < state.integrity ? PALETTE.danger : 'rgba(148, 164, 200, 0.5)');
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 17px ${FONT}`;
    ctx.fillText(`x${multiplierFor(state.bestCombo)}`, 1124, 78);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(`(${state.bestCombo} catches)`, 1168, 78);

    // Pulse readiness, bottom right.
    const ready = state.pulse.cooldown <= 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = ready ? PALETTE.shard : PALETTE.muted;
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText(ready ? 'PULSE READY — CLICK / SPACE' : 'PULSE CHARGING', 1244, 692);
    ctx.fillStyle = 'rgba(148, 184, 255, 0.25)';
    ctx.fillRect(1090, 698, 154, 5);
    ctx.fillStyle = PALETTE.shard;
    ctx.fillRect(1090, 698, 154 * (ready ? 1 : 1 - state.pulse.cooldown / PULSE.cooldown), 5);

    // Controls reminder, bottom left; sound state beside it.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 13px ${FONT}`;
    ctx.fillText('MOVE mouse / arrow keys · RING wheel / up-down · PAUSE P', 20, 692);
    ctx.fillText(muted ? 'SOUND OFF (M)' : 'SOUND ON (M)', 20, 712 - 6);
  }

  function centreText(text, y, font, color) {
    ctx.textAlign = 'center';
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, FIELD.width / 2, y);
  }

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(4, 6, 20, 0.42)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const gradient = ctx.createLinearGradient(340, 0, 940, 0);
    gradient.addColorStop(0, '#67e8f9');
    gradient.addColorStop(0.5, '#a5f3fc');
    gradient.addColorStop(1, '#38bdf8');
    ctx.textAlign = 'center';
    ctx.font = `900 92px ${FONT}`;
    ctx.fillStyle = gradient;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.65)';
    ctx.shadowBlur = 34;
    ctx.fillText('ORBITKEEPER', FIELD.width / 2, 168);
    ctx.shadowBlur = 0;
    centreText('SHIELD THE PLANET · HARVEST THE STARLIGHT', 208, `600 20px ${FONT}`, PALETTE.gold);
    centreText('Starlight shards are falling. Catch them on your orbit ring — but the rocks among', 268, `500 18px ${FONT}`, PALETTE.text);
    centreText('them must never reach the planet. Clear 5 waves to save it.', 294, `500 18px ${FONT}`, PALETTE.text);
    panel(390, 330, 500, 118);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `500 17px ${FONT}`;
    ctx.fillText('MOVE      mouse, or ← → arrow keys', 424, 364);
    ctx.fillText('RING        mouse wheel, or ↑ ↓', 424, 392);
    ctx.fillText('PULSE     click, or Space — breaks rocks', 424, 420);
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 4);
    ctx.globalAlpha = pulse;
    centreText('CLICK OR PRESS ENTER TO PLAY', 520, `800 26px ${FONT}`, PALETTE.shardCore);
    ctx.globalAlpha = 1;
    if (best > 0) centreText(`BEST SCORE ${best}`, 566, `600 16px ${FONT}`, PALETTE.muted);
  }

  function drawEndPanel(state, best, victory) {
    ctx.fillStyle = 'rgba(4, 6, 20, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(340, 168, 600, 384);
    if (victory) {
      centreText('THE PLANET IS SAVED!', 262, `900 46px ${FONT}`, PALETTE.planetLight);
      centreText('All 5 waves cleared. The starlight is harvested,', 302, `500 18px ${FONT}`, PALETTE.text);
      centreText('and the planet still shines.', 328, `500 18px ${FONT}`, PALETTE.text);
    } else {
      centreText('GAME OVER', 262, `900 54px ${FONT}`, PALETTE.danger);
      centreText('The last rock broke the planet open.', 302, `500 18px ${FONT}`, PALETTE.text);
    }
    ctx.textAlign = 'left';
    ctx.font = `600 20px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('SCORE', 420, 386);
    ctx.fillText('WAVE REACHED', 420, 424);
    ctx.fillText('BEST COMBO', 420, 462);
    ctx.fillText('BEST SCORE', 420, 500);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 20px ${FONT}`;
    ctx.fillText(String(state.score), 860, 386);
    ctx.fillText(String(state.wave), 860, 424);
    ctx.fillText(`x${multiplierFor(state.bestCombo)} (${state.bestCombo} catches)`, 860, 462);
    ctx.fillText(String(Math.max(best, state.score)), 860, 500);
    centreText(victory ? 'R — PLAY AGAIN · C — ENDLESS MODE' : 'PRESS R OR CLICK TO PLAY AGAIN', 590, `800 21px ${FONT}`, PALETTE.shardCore);
    // The panel is 168..552; the prompt sits just under it.
  }

  function drawClearBanner(state) {
    const remain = state.clearTimer;
    const pop = remain > 2.1 ? 1 - (remain - 2.1) / 0.3 : 1;
    ctx.save();
    ctx.translate(FIELD.width / 2, 250);
    ctx.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop);
    ctx.globalAlpha = Math.min(1, remain / 0.5);
    ctx.textAlign = 'center';
    ctx.font = `900 52px ${FONT}`;
    ctx.fillStyle = PALETTE.gold;
    ctx.shadowColor = 'rgba(252, 211, 77, 0.7)';
    ctx.shadowBlur = 26;
    ctx.fillText(`WAVE ${state.wave} CLEAR!`, 0, 0);
    ctx.shadowBlur = 0;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(`BONUS +${100 * state.wave}`, 0, 36);
    ctx.restore();
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(4, 6, 20, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    centreText('PAUSED', 330, `900 54px ${FONT}`, PALETTE.text);
    centreText('Press P or Enter to keep flying', 376, `500 19px ${FONT}`, PALETTE.muted);
  }

  /** Paint one frame: the world, its effects, then the screen's overlay. */
  function draw(state, screen, best, muted = false) {
    ctx.save();
    if (state.shake > 0) {
      const t = state.time * 47;
      ctx.translate(Math.sin(t) * state.shake * 0.6, Math.cos(t * 1.3) * state.shake * 0.6);
    }
    drawBackground(state);
    drawRings(state);
    drawPlanet(state);
    drawItems(state);
    drawDrone(state);
    drawParticles();
    ctx.restore();
    if (flash > 0) {
      const vignette = ctx.createRadialGradient(640, 360, 240, 640, 360, 760);
      vignette.addColorStop(0, 'rgba(190, 18, 60, 0)');
      vignette.addColorStop(1, `rgba(190, 18, 60, ${flash})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawHud(state, muted);
    if (state.phase === PHASE_CLEAR && screen === SCREEN_PLAY) drawClearBanner(state);
    if (screen === SCREEN_PAUSED) drawPaused();
    if (screen === SCREEN_OVER) drawEndPanel(state, best, false);
    if (screen === SCREEN_VICTORY || state.phase === PHASE_VICTORY) drawEndPanel(state, best, true);
  }

  return { draw, fx, tickFx };
}
