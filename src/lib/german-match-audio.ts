// Tiny WebAudio helpers — no asset files.
let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const C = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!C) return null;
  if (!ctx) ctx = new C();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.15, when = 0) {
  const a = ac();
  if (!a) return;
  if (a.state === "suspended") void a.resume().catch(() => {});
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + when);
  g.gain.setValueAtTime(0, a.currentTime + when);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + when + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + when);
  o.stop(a.currentTime + when + dur + 0.02);
}

export function playCorrect() {
  tone(880, 0.12, "sine", 0.18, 0);
  tone(1320, 0.16, "sine", 0.14, 0.08);
}

export function playAlmost() {
  tone(620, 0.1, "triangle", 0.14, 0);
  tone(820, 0.14, "triangle", 0.12, 0.08);
}

export function playWrong() {
  tone(220, 0.16, "square", 0.12, 0);
  tone(180, 0.18, "square", 0.1, 0.05);
  try { navigator.vibrate?.(15); } catch {}
}

export function playTick() {
  tone(660, 0.05, "sine", 0.08);
}
