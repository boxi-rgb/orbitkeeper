# Orbitkeeper

A small orbital defence game for make.fun's **best-game-01** ("Make the best game").

You are the drone riding an orbit ring around a living planet. Starlight shards fall
in from deep space: catch them to score, build a combo multiplier and fill each
wave's quota. Rocks fall among them, all bound for the planet: your shield bubble
turns aside any rock that comes within its reach, and your pulse shockwave breaks
rocks a little further out — but a rock that slips past both cracks the planet's
integrity. Clear 5 waves to save the planet; lose all three integrity and the run
ends. After victory, endless waves are one key away.

## Play

Open `game/index.html` in a desktop browser (or run `node serve.ts` and visit
http://localhost:8080). No network, no build step, no dependencies.

- **Move** — mouse (the drone swings toward your pointer), or ← / → arrow keys
- **Change ring** — mouse wheel, or ↑ / ↓ (three rings: low, mid, high orbit)
- **Pulse** — click or Space: destroys rocks within reach, 4 s cooldown
- **Pause** — P or Esc · **Restart** — R · **Endless after victory** — C · **Mute** — M

Scoring: shard 10, golden shard 50, rock broken by pulse 15 — multiplied by the
combo multiplier (×1–×6, one step per 4 catches in a row; a shard that slips past
you into the planet resets the combo). A rock deflected by the shield bubble: 5.
Wave-clear bonus: 100 × wave number.

## Layout

- `main.ts` — the entry program (Node 22): copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with the vendored library.
- `vendor/makefun-game.ts` — make.fun's dossier library, copied from the kit unchanged.
- `game/index.html` — the page; `game/src/` holds the game, one job per file:
  - `config.js` — every tuning number and colour
  - `random.js` — the seeded generator behind the falling patterns
  - `world.js` — the simulation (planet, drone, rings, shards, rocks, waves)
  - `input.js` — keyboard, mouse and wheel
  - `render.js` — all drawing, the HUD, screens and effects
  - `audio.js` — synthesized sound effects (Web Audio, no audio files)
  - `shots.js` — the deterministic autopilot scenes behind the screenshots
  - `main.js` — boot, the fixed-step loop, the screen state machine
- `screenshots/` — four real renders of the game (title, play, wave clear, game
  over), taken from the `?shot=` scenes listed in `shots.json` at seed 1.
- `serve.ts` — a tiny static server for local play-testing.

## License

MIT — see `LICENSE`.
