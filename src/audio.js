// Efectos de sonido sintetizados con Web Audio.
var ac = null, muted = false;

// Los navegadores solo permiten audio tras un gesto del usuario: se llama en cada clic/tecla.
export function unlockAudio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
  if (ac && ac.state === "suspended") ac.resume();
}
export function isMuted() { return muted; }
export function setMuted(m) { muted = m; }

function beep(freq, dur, type, vol, delay) {
  if (muted || !ac) return;
  var t0 = ac.currentTime + (delay || 0);
  var o = ac.createOscillator(), g = ac.createGain();
  o.type = type || "square"; o.frequency.value = freq;
  g.gain.setValueAtTime(vol || 0.06, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(t0); o.stop(t0 + dur);
}
export function sndHit(power) { beep(480 + power * 260, 0.06, "square", 0.07); }
export function sndBounce() { beep(210, 0.05, "triangle", 0.09); }
export function sndNet() { beep(120, 0.12, "sawtooth", 0.05); }
export function sndWin() { beep(520, 0.12, "triangle", 0.08, 0); beep(660, 0.12, "triangle", 0.08, 0.1); beep(880, 0.2, "triangle", 0.08, 0.2); }
export function sndOrb() { beep(660, 0.08, "sine", 0.08, 0); beep(990, 0.08, "sine", 0.08, 0.06); beep(1320, 0.14, "sine", 0.07, 0.12); }
export function sndLose() { beep(300, 0.15, "sawtooth", 0.05, 0); beep(200, 0.28, "sawtooth", 0.05, 0.14); }

// Reproduce un evento de sonido de game.js (out.sound) desde el punto de vista del jugador `me`.
export function playSound(name, arg, me) {
  if (name === "hit") sndHit(arg);
  else if (name === "bounce") sndBounce();
  else if (name === "net") sndNet();
  else if (name === "point") { if (arg === me) sndWin(); else sndLose(); }
  else if (name === "orb") sndOrb();
}
