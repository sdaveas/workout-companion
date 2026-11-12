const SOUND = 'wc:sound';
const VIBRATE = 'wc:vibrate';

/** Preferences are read at the call site, not held in React state: a cue fires from an
    effect, and reading localStorage a few times a set is cheaper than threading props. */
const enabled = (key: string) => localStorage.getItem(key) !== '0';

export type Cue =
  /** A set was logged. */
  | 'set'
  /** Ten seconds left on the running clock. */
  | 'ten'
  /** Three, two, one. */
  | 'tick'
  /** The clock ran out. */
  | 'end';

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  audio ??= new AudioContext();
  // iOS hands back a suspended context until a gesture has happened; the listener
  // below runs on the first tap anywhere, which is always before the first cue.
  if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
  return audio;
}

if (typeof window !== 'undefined') {
  // Stays attached on purpose: iOS suspends the context when the app is backgrounded
  // (or after a call) and only a gesture can resume it, so the next tap has to revive
  // it. Removing the listener after the first tap leaves the rest of the session mute.
  const unlock = () => {
    context();
  };
  window.addEventListener('pointerdown', unlock);
}

function blip(ac: AudioContext, freq: number, start: number, dur: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  // Ramped, not switched: a square edge on a phone speaker clicks.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.3, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

const TONES: Record<Cue, Array<[freq: number, at: number, dur: number]>> = {
  // A logged set is a single confirmation, the countdown is a rising ladder: short
  // and high so three of them in a row do not sound like one long note.
  set: [[880, 0, 0.12]],
  // Two rising notes: one blip at 220ms was still easy to miss mid-rep, and the
  // pitch change separates it from the ticks and from the end pair.
  ten: [
    [740, 0, 0.14],
    [880, 0.16, 0.14],
  ],
  tick: [[990, 0, 0.06]],
  end: [
    [660, 0, 0.12],
    [660, 0.22, 0.18],
  ],
};

const BUZZ: Record<Cue, number | number[]> = {
  set: 120,
  ten: 80,
  tick: 60,
  end: [200, 100, 200],
};

function tone(kind: Cue) {
  const ac = context();
  if (!ac) return;
  const at = ac.currentTime;
  for (const [freq, offset, dur] of TONES[kind]) blip(ac, freq, at + offset, dur);
}

function buzz(kind: Cue) {
  navigator.vibrate?.(BUZZ[kind]);
}

/** Both channels honour their own switch. `force` is for the switch itself: turning
    one on plays a cue before the new preference has reached localStorage. */
export function cue(kind: Cue, force = false): void {
  if (force || enabled(VIBRATE)) buzz(kind);
  if (force || enabled(SOUND)) tone(kind);
}

export const canVibrate = () =>
  typeof navigator !== 'undefined' &&
  'vibrate' in navigator &&
  // Desktop Chrome exposes the API and does nothing with it; only touch devices
  // have something to buzz.
  window.matchMedia('(pointer: coarse)').matches;
