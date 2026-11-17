// The sound board: every sound is synthesized with the Web Audio API, so the game
// needs no audio files. The context is created lazily on the first user gesture
// (browsers refuse audio before one), and every method is silent until then and
// while muted. M toggles mute.

export function createSoundBoard() {
  let context = null;
  let master = null;
  let muted = false;

  /** Create the context on a user gesture; safe to call on every gesture. */
  function unlock() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    context = new AudioCtor();
    master = context.createGain();
    master.gain.value = 0.32;
    master.connect(context.destination);
  }

  function tone({ frequency, end = null, type = 'sine', at = 0, duration = 0.12, volume = 0.5 }) {
    if (!context || muted) return;
    const start = context.currentTime + at;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (end !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  function noise({ at = 0, duration = 0.25, volume = 0.5, from = 2400, to = 300 }) {
    if (!context || muted) return;
    const start = context.currentTime + at;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
  }

  return {
    unlock,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    /** A shard caught: a blip that climbs as the combo grows. */
    catch(combo) {
      const step = Math.min(combo, 16);
      tone({ frequency: 620 + step * 45, end: 940 + step * 60, type: 'sine', duration: 0.1, volume: 0.4 });
    },
    /** A golden shard: a quick three-note sparkle. */
    gold() {
      tone({ frequency: 880, type: 'triangle', duration: 0.09, volume: 0.4 });
      tone({ frequency: 1174, type: 'triangle', at: 0.06, duration: 0.09, volume: 0.4 });
      tone({ frequency: 1568, type: 'triangle', at: 0.12, duration: 0.14, volume: 0.42 });
    },
    /** The pulse firing: a sweeping whoosh. */
    pulse() {
      noise({ duration: 0.3, volume: 0.35, from: 3200, to: 500 });
      tone({ frequency: 220, end: 660, type: 'sawtooth', duration: 0.22, volume: 0.12 });
    },
    /** A rock broken by the pulse. */
    pulseKill() {
      noise({ duration: 0.14, volume: 0.4, from: 1800, to: 240 });
      tone({ frequency: 160, end: 60, type: 'square', duration: 0.1, volume: 0.2 });
    },
    /** A rock hits the planet: a low boom. */
    planetHit() {
      tone({ frequency: 120, end: 38, type: 'sine', duration: 0.5, volume: 0.9 });
      noise({ duration: 0.4, volume: 0.5, from: 900, to: 120 });
    },
    /** A rock turned aside by the shield bubble: a bright metallic tick. */
    deflect() {
      tone({ frequency: 1250, end: 900, type: 'triangle', duration: 0.07, volume: 0.3 });
      tone({ frequency: 1900, type: 'sine', duration: 0.05, volume: 0.16 });
    },
    /** A shard reaches the planet uncaught and fades. */
    shardLost() {
      tone({ frequency: 520, end: 240, type: 'sine', duration: 0.16, volume: 0.22 });
    },
    /** A wave cleared: a rising major arpeggio. */
    waveClear() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((frequency, i) => tone({ frequency, type: 'triangle', at: i * 0.09, duration: 0.22, volume: 0.4 }));
    },
    /** Victory: a small fanfare. */
    victory() {
      const notes = [523, 659, 784, 1046, 784, 1046, 1318];
      notes.forEach((frequency, i) => tone({ frequency, type: 'triangle', at: i * 0.11, duration: 0.3, volume: 0.42 }));
    },
    /** Game over: three descending tones. */
    gameOver() {
      const notes = [392, 330, 262];
      notes.forEach((frequency, i) => tone({ frequency, type: 'triangle', at: i * 0.16, duration: 0.3, volume: 0.42 }));
    },
    /** A menu click or a ring change. */
    uiTick() {
      tone({ frequency: 740, end: 880, type: 'sine', duration: 0.05, volume: 0.18 });
    },
  };
}
