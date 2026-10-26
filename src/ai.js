// La máquina: dificultad, movimiento de su paleta y elección de golpe.
// Todas las funciones reciben el jugador (pl) que controla la IA; sirven para cualquier lado de la mesa.
import { PZ, predict } from "./physics.js";
import { clamp, rnd } from "./util.js";

export var DIFF = {
  facil:   { label: "Fácil",   speed: 2.1, react: 0.22, err: 0.30, fault: 0.22, pmin: 0.25, pmax: 0.6 },
  medio:   { label: "Medio",   speed: 3.0, react: 0.14, err: 0.17, fault: 0.10, pmin: 0.4,  pmax: 0.85 },
  dificil: { label: "Difícil", speed: 4.2, react: 0.08, err: 0.08, fault: 0.04, pmin: 0.55, pmax: 1.0 }
};

// Error de puntería al empezar un punto.
export function aiNewPoint(pl, diff) { pl.err = rnd() * DIFF[diff].err; }

// Tras cada golpe del rival, la máquina recalcula su error (a veces mayor).
export function aiOnOpponentHit(pl, diff) {
  pl.err = rnd() * DIFF[diff].err;
  if (Math.random() < 0.15) pl.err *= 1.8;
}

// Elige el golpe: devuelve {power, tx, tz} (objetivo en la mesa del rival).
// Apunta en x lejos del rival (simétrico en x para ambos lados); tz va hacia el lado contrario.
export function aiShot(pl, diff, oppX) {
  var D = DIFF[diff];
  var power = D.pmin + Math.random() * (D.pmax - D.pmin);
  var tx = clamp(-0.5 * oppX + rnd() * 0.45, -0.62, 0.62);
  var tz = -pl.side * (0.55 + 0.55 * power);
  if (Math.random() < D.fault) {
    if (Math.random() < 0.5) tz = -pl.side * 1.75; else tx = (Math.random() < 0.5 ? -1 : 1) * 0.95;
  }
  pl.swing = 0.25;
  return { power: power, tx: tx, tz: tz };
}

// x donde la máquina quiere que caiga su saque.
export function aiServeX() { return rnd() * 0.45; }

export function updateAI(pl, h, S, B) {
  var D = DIFF[S.diff];
  pl.react -= h;
  if (pl.react <= 0) {
    pl.react = D.react;
    if (S.mode === "play" && B.live && B.vz * pl.side > 0) {
      var p = predict(B.x, B.y, B.z, B.vx, B.vy, B.vz, pl.side * PZ);
      if (p) { pl.tx = clamp(p.x + pl.err, -1.3, 1.3); pl.ty = clamp(p.y, 0.75, 1.4); }
    } else {
      pl.tx = 0; pl.ty = 1.05;
    }
  }
  var m = D.speed * h;
  pl.x += clamp(pl.tx - pl.x, -m, m);
  pl.y += clamp(pl.ty - pl.y, -m, m);
  pl.swing = Math.max(0, pl.swing - h);
}
