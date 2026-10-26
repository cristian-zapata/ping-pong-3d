// La máquina: dificultad, movimiento de su paleta y elección de golpe.
// Todas las funciones reciben el jugador (pl) que controla la IA; sirven para cualquier lado de la mesa.
import { P, predict } from "./physics.js";
import { PP } from "./effects.js";
import { clamp, rnd } from "./util.js";
import { BALANCE } from "./balance.js";

// orb: probabilidad de apuntar su devolución a través de un orbe de power-up (en balance.js).
var AIM = BALANCE.aiOrbAim;
export var DIFF = {
  facil:   { label: "Fácil",   speed: 2.1, react: 0.22, err: 0.30, fault: 0.22, pmin: 0.25, pmax: 0.6,  orb: AIM.facil },
  medio:   { label: "Medio",   speed: 3.0, react: 0.14, err: 0.17, fault: 0.10, pmin: 0.4,  pmax: 0.85, orb: AIM.medio },
  dificil: { label: "Difícil", speed: 4.2, react: 0.08, err: 0.08, fault: 0.04, pmin: 0.55, pmax: 1.0,  orb: AIM.dificil }
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
// x0: x donde golpea; orb: orbe de power-up o null. En planta la pelota va en línea recta, así que, si el orbe
// está entre la paleta y el objetivo, puede elegir tx para que la trayectoria pase por su x (la altura no la controla).
export function aiShot(pl, diff, oppX, x0, orb) {
  var D = DIFF[diff];
  var power = D.pmin + Math.random() * (D.pmax - D.pmin);
  var tx = clamp(-0.5 * oppX + rnd() * 0.45, -P.AI_AIM_X, P.AI_AIM_X);
  var tz = -pl.side * (P.DEPTH_MIN + P.DEPTH_RANGE * power);
  if (orb) {
    var z0 = pl.side * P.PZ, f = (tz - z0) / (orb.z - z0);
    if (f > 1 && Math.random() < D.orb) tx = clamp(x0 + (orb.x - x0) * f, -P.AI_AIM_X, P.AI_AIM_X);
  }
  if (Math.random() < D.fault) {
    if (Math.random() < 0.5) tz = -pl.side * P.AI_FAULT_Z; else tx = (Math.random() < 0.5 ? -1 : 1) * P.AI_FAULT_X;
  }
  pl.swing = 0.25;
  return { power: power, tx: tx, tz: tz };
}

// x donde la máquina quiere que caiga su saque.
export function aiServeX() { return rnd() * P.AI_SERVE_X; }

export function updateAI(pl, h, S, B) {
  var D = DIFF[S.diff];
  pl.react -= h;
  if (pl.react <= 0) {
    pl.react = D.react;
    if (S.mode === "play" && B.live && B.vz * pl.side > 0) {
      var p = predict(B.x, B.y, B.z, B.vx, B.vy, B.vz, pl.side * P.PZ);
      if (p) { pl.tx = clamp(p.x + pl.err, -P.AI_X, P.AI_X); pl.ty = clamp(p.y, P.PAD_YMIN, P.AI_YMAX); }
    } else {
      pl.tx = 0; pl.ty = 1.05;
    }
  }
  var m = Math.min(D.speed, PP[pl.i].speedCap) * h;     // un efecto puede limitar su velocidad
  pl.x += clamp(pl.tx - pl.x, -m, m);
  pl.y += clamp(pl.ty - pl.y, -m, m);
  pl.swing = Math.max(0, pl.swing - h);
}
