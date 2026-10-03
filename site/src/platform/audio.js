// Sound effects, synthesised with hand-written Web Audio (ADR 0006, US-11,
// US-12, UX_SPEC.md 12). `soundFor` and `panFor` decide what an event sounds
// like and are unit-tested in Node; `createAudio` is the Web Audio glue. The
// AudioContext is made on the first key press or click (AC-01.4), and every
// sound goes through one master gain, which mute sets to 0 (BR-23). Sound is
// a Should: with no Web Audio, or if it fails, the game runs on in silence.

/** @typedef {import('../core/world.js').GameEvent} GameEvent */
/** @typedef {import('../core/world.js').GameState} GameState */
/** @typedef {import('../core/math.js').Vec2} Vec2 */
/** @typedef {'player-shot' | 'enemy-shot' | 'warning' | 'aiming' | 'explosion'} Sound */

const MASTER_VOLUME = 1;
/** Peak level of each sound. The explosion is the loudest by design (UX_SPEC.md 12). */
export const LEVELS = { 'player-shot': 0.75, 'enemy-shot': 0.45, warning: 0.4, aiming: 0.2, explosion: 1 };
const NOISE_SECONDS = 1;

/**
 * The sound an event makes, or null if it makes none (UX_SPEC.md 12).
 * @param {GameEvent} event @param {number} playerId
 * @returns {Sound | null}
 */
export function soundFor(event, playerId) {
  switch (event.type) {
    case 'shot':
      return event.tankId === playerId ? 'player-shot' : 'enemy-shot';
    case 'tank-hit':
    case 'player-hit':
      return 'explosion';
    case 'enemy-spawned':
      return 'warning';
    case 'enemy-aiming':
      return 'aiming';
    default:
      return null;
  }
}

/**
 * Stereo position of a point as heard by the listener: -1 hard left, 0 ahead
 * or behind, 1 hard right. Heading 0 faces +Z and turns towards +X.
 * @param {{ pos: Vec2, heading: number }} listener @param {Vec2} target
 */
export function panFor(listener, target) {
  const dx = target.x - listener.pos.x;
  const dz = target.z - listener.pos.z;
  if (dx === 0 && dz === 0) return 0;
  return Math.sin(Math.atan2(dx, dz) - listener.heading);
}

/** @param {GameState} state @param {unknown} id */
function tankById(state, id) {
  for (const tank of state.tanks) if (tank.id === id) return tank;
  return null;
}

/**
 * A pitch sweep with a fast attack and an exponential fade.
 * @param {AudioContext} ctx @param {AudioNode} out
 * @param {{ wave: OscillatorType, from: number, to: number, peak: number, seconds: number, delay?: number }} spec
 */
function tone(ctx, out, { wave, from, to, peak, seconds, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + seconds);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + seconds + 0.02);
}

/**
 * A noise burst falling in pitch: the loudest sound in the game (UX_SPEC.md 12).
 * @param {AudioContext} ctx @param {AudioNode} out @param {AudioBuffer} noise
 */
function explosion(ctx, out, noise) {
  const t = ctx.currentTime;
  const seconds = 0.8;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  src.buffer = noise;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2400, t);
  filter.frequency.exponentialRampToValueAtTime(80, t + seconds);
  env.gain.setValueAtTime(LEVELS.explosion, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  src.connect(filter).connect(env).connect(out);
  src.start(t);
  src.stop(t + seconds);
}

/**
 * The Web Audio side. Nothing is created until `unlock`, which the page calls
 * on every key press and click.
 * @param {{ AudioContext?: typeof AudioContext }} win
 */
export function createAudio(win) {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let master = null;
  /** @type {AudioBuffer | null} */
  let noise = null;
  let broken = false;
  let muted = false;

  // Web Audio failed: close it if we can, and carry on in silence.
  const disable = () => {
    broken = true;
    try {
      ctx?.close().catch(() => {});
    } catch {
      // Closing is best effort.
    }
    ctx = null;
    master = null;
  };

  /** @param {Sound} sound @param {GameEvent} event @param {GameState} state */
  const emit = (sound, event, state) => {
    if (!ctx || !master || !noise) return;
    switch (sound) {
      case 'player-shot':
        tone(ctx, master, { wave: 'triangle', from: 150, to: 50, peak: LEVELS['player-shot'], seconds: 0.15 });
        break;
      case 'enemy-shot': {
        const shooter = tankById(state, event.tankId);
        const listener = tankById(state, state.playerId);
        /** @type {AudioNode} */
        let out = master;
        if (shooter && listener && ctx.createStereoPanner) {
          const panner = ctx.createStereoPanner();
          panner.pan.value = panFor(listener, shooter.pos);
          panner.connect(master);
          out = panner;
        }
        tone(ctx, out, { wave: 'triangle', from: 320, to: 140, peak: LEVELS['enemy-shot'], seconds: 0.1 });
        break;
      }
      case 'warning':
        tone(ctx, master, { wave: 'sine', from: 500, to: 1000, peak: LEVELS.warning, seconds: 0.3 });
        break;
      case 'aiming':
        tone(ctx, master, { wave: 'square', from: 1200, to: 1200, peak: LEVELS.aiming, seconds: 0.05 });
        tone(ctx, master, { wave: 'square', from: 1200, to: 1200, peak: LEVELS.aiming, seconds: 0.05, delay: 0.1 });
        break;
      case 'explosion':
        explosion(ctx, master, noise);
        break;
    }
  };

  return {
    /** Makes the context on the first call and resumes it if suspended. Call it from a key press or click. */
    unlock() {
      try {
        if (!ctx && !broken) {
          const Ctor = win.AudioContext;
          if (!Ctor) {
            broken = true;
            return;
          }
          ctx = new Ctor();
          master = ctx.createGain();
          master.gain.value = muted ? 0 : MASTER_VOLUME;
          if (ctx.createDynamicsCompressor) {
            const limiter = ctx.createDynamicsCompressor();
            limiter.threshold.value = -12;
            limiter.knee.value = 10;
            limiter.ratio.value = 12;
            limiter.attack.value = 0.003;
            limiter.release.value = 0.15;
            master.connect(limiter).connect(ctx.destination);
          } else {
            master.connect(ctx.destination);
          }
          const length = Math.round(ctx.sampleRate * NOISE_SECONDS);
          noise = ctx.createBuffer(1, length, ctx.sampleRate);
          const data = noise.getChannelData(0);
          for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
        }
        if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
      } catch {
        disable();
      }
    },
    /** @param {boolean} on */
    setMuted(on) {
      muted = on;
      if (!ctx || !master) return;
      try {
        master.gain.setValueAtTime(on ? 0 : MASTER_VOLUME, ctx.currentTime);
      } catch {
        disable();
      }
    },
    /**
     * Plays the sounds for one step's events. Nothing plays while muted or
     * before the context is running, so no sound is queued up for later.
     * @param {readonly GameEvent[]} events @param {GameState} state
     */
    play(events, state) {
      if (!ctx || muted || ctx.state !== 'running') return;
      try {
        for (const event of events) {
          const sound = soundFor(event, state.playerId);
          if (sound) emit(sound, event, state);
        }
      } catch {
        disable();
      }
    },
  };
}
