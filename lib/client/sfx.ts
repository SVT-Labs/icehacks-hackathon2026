// Sound effects, synthesised with the Web Audio API. There are no audio files:
// every sound is a few oscillators or a burst of filtered noise. Browsers only
// allow sound after a click or key press, so the audio context is created the
// first time a sound is asked for.

const MUTE_KEY = "thinice:muted";

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let muted: boolean | null = null;
const listeners = new Set<() => void>();

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor: AudioCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = window.localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
  listeners.forEach((fn) => fn());
}

export function onMuteChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function tone(
  ac: AudioContext,
  opts: {
    from: number;
    to?: number;
    at?: number;
    dur: number;
    type?: OscillatorType;
    gain?: number;
  },
) {
  const start = ac.currentTime + (opts.at ?? 0);
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.from, start);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, start + opts.dur);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(opts.gain ?? 0.12, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + opts.dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(start);
  osc.stop(start + opts.dur + 0.02);
}

function noise(
  ac: AudioContext,
  opts: {
    at?: number;
    dur: number;
    type: BiquadFilterType;
    from: number;
    to?: number;
    gain?: number;
    q?: number;
  },
) {
  const start = ac.currentTime + (opts.at ?? 0);
  const length = Math.max(1, Math.floor(ac.sampleRate * opts.dur));
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = opts.type;
  filter.Q.value = opts.q ?? 0.8;
  filter.frequency.setValueAtTime(opts.from, start);
  if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, start + opts.dur);
  const amp = ac.createGain();
  amp.gain.setValueAtTime(opts.gain ?? 0.2, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + opts.dur);
  src.connect(filter).connect(amp).connect(ac.destination);
  src.start(start);
  src.stop(start + opts.dur + 0.02);
}

function play(fn: (ac: AudioContext) => void) {
  if (isMuted()) return;
  const ac = context();
  if (!ac) return;
  try {
    fn(ac);
  } catch {
    // A sound failing must never break the game.
  }
}

export const sfx = {
  /** A new player or a small confirmation. */
  pop: () => play((ac) => tone(ac, { from: 520, to: 820, dur: 0.09, gain: 0.1 })),
  /** A choice locked in. */
  lock: () =>
    play((ac) => {
      tone(ac, { from: 440, dur: 0.05, type: "triangle", gain: 0.1 });
      tone(ac, { from: 660, at: 0.05, dur: 0.07, type: "triangle", gain: 0.1 });
    }),
  /** Last seconds of a countdown. */
  tick: () => play((ac) => tone(ac, { from: 1000, dur: 0.035, gain: 0.05 })),
  correct: () =>
    play((ac) => {
      tone(ac, { from: 660, dur: 0.1, type: "triangle", gain: 0.13 });
      tone(ac, { from: 990, at: 0.09, dur: 0.16, type: "triangle", gain: 0.13 });
    }),
  wrong: () =>
    play((ac) => tone(ac, { from: 200, to: 110, dur: 0.22, type: "sawtooth", gain: 0.07 })),
  /** Ice cracking: two sharp clicks and a short falling creak. */
  crack: () =>
    play((ac) => {
      noise(ac, { dur: 0.05, type: "highpass", from: 2600, gain: 0.3 });
      noise(ac, { at: 0.07, dur: 0.04, type: "highpass", from: 3400, gain: 0.22 });
      tone(ac, { from: 900, to: 260, at: 0.02, dur: 0.16, type: "triangle", gain: 0.06 });
    }),
  /** A penguin going in. */
  splash: () =>
    play((ac) => {
      noise(ac, { dur: 0.7, type: "lowpass", from: 2400, to: 320, gain: 0.3 });
      tone(ac, { from: 300, to: 90, dur: 0.3, gain: 0.1 });
      tone(ac, { from: 700, to: 1100, at: 0.3, dur: 0.07, gain: 0.05 });
      tone(ac, { from: 900, to: 1400, at: 0.42, dur: 0.06, gain: 0.04 });
    }),
  /** End of the game. */
  fanfare: () =>
    play((ac) => {
      [523, 659, 784, 1047].forEach((freq, i) =>
        tone(ac, { from: freq, at: i * 0.11, dur: 0.2, type: "triangle", gain: 0.12 }),
      );
    }),
};
