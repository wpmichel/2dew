// A short, delightful two-note chime played when a task is completed. Best-effort: if the Web
// Audio API is unavailable (e.g. in tests) it silently does nothing — audio is never a failure
// path. A single AudioContext is reused so repeated completions don't exhaust the browser's
// per-page limit.

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  const globals = globalThis as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  const Ctor = globals.AudioContext ?? globals.webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

export function playCompletionChime(): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    // Completing a task is a user gesture, so a suspended context is allowed to resume.
    void ctx.resume();

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);

    // A quick rising perfect fifth (E6 → B6) with a soft pluck envelope.
    for (const [freq, start] of [
      [1318.51, 0],
      [1975.53, 0.09],
    ]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;

      const t0 = now + start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(1, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);

      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.45);
    }
  } catch {
    // Audio is a nicety, never a failure path.
  }
}
