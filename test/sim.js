// Barridos de física compartidos por los tests (no es un archivo de test: no ejecuta nada al importarse).
// Simulan con el mismo paso (1/120 s) y las mismas funciones que usa el juego, leyendo los rangos de P.
import { P, launchTo, serveVel, integrate, hitsNet, onTable, bounceTable, crossPlane, isOut } from "../src/physics.js";

var STEP = 1 / 120;

// Simula una pelota en juego y devuelve la lista de eventos hasta que cruza el plano de golpeo
// del lado `recv` (+1 jugador 0, -1 rival), toca la red o se sale.
export function simulate(b, recv) {
  var ev = [], t = 0;
  while (t < 5) {
    var ox = b.x, oy = b.y, oz = b.z;
    integrate(b, STEP); t += STEP;
    if (hitsNet(ox, oy, oz, b)) { ev.push({ type: "net", t: t }); return ev; }
    if (onTable(b)) { bounceTable(b); ev.push({ type: "bounce", side: b.z > 0 ? 1 : -1, t: t, x: b.x, z: b.z }); }
    var c = crossPlane(ox, oy, oz, b, recv * P.PZ);
    if (c) { ev.push({ type: "plane", t: t, x: c.x, y: c.y }); return ev; }
    if (isOut(b)) { ev.push({ type: "out", t: t }); return ev; }
  }
  ev.push({ type: "timeout", t: t });
  return ev;
}

function range(a, b, n) {
  var out = [], i;
  for (i = 0; i < n; i++) out.push(a + (b - a) * i / (n - 1));
  return out;
}
function fmt(ev) { return ev.map(function (e) { return e.type + (e.side ? "(" + e.side + ")" : ""); }).join(" > "); }

// Zona alcanzable por la paleta del lado `side` (+1 humano en input.js, -1 máquina en ai.js): centro ± alcance.
function reachZone(side, reach) {
  var xMax = side === 1 ? P.PAD_X : P.AI_X, yMax = side === 1 ? P.PAD_YMAX : P.AI_YMAX;
  return { x: xMax + reach, y0: P.PAD_YMIN - reach, y1: yMax + reach };
}

// Saques con los parámetros actuales. reach: alcance del receptor (para comprobar que puede devolver).
export function checkServes(reach) {
  var count = 0, minReturn = Infinity, minTotal = Infinity, failures = [];
  [1, -1].forEach(function (side) {
    // x0: game.js acota la x de saque a ±SERVE_X0; x2: ±SERVE_X2 el humano, ±AI_SERVE_X (menor) la máquina.
    range(-P.SERVE_X0, P.SERVE_X0, 25).forEach(function (x0) {
      range(-P.SERVE_X2, P.SERVE_X2, 21).forEach(function (x2) {
        count++;
        var b = serveVel(side, x0, P.SERVE_Y, x2);
        var recv = -side, z = reachZone(recv, reach);
        var ev = simulate(b, recv);
        var types = ev.map(function (e) { return e.type; }).join(",");
        var ok = types === "bounce,bounce,plane" && ev[0].side === side && ev[1].side === recv;
        if (ok) {
          var p = ev[2];
          ok = p.y >= z.y0 && p.y <= z.y1 && Math.abs(p.x) <= z.x;
          minReturn = Math.min(minReturn, p.t - ev[1].t);
          minTotal = Math.min(minTotal, p.t);
        }
        if (!ok) failures.push({ side: side, x0: x0, x2: x2, ev: fmt(ev) });
      });
    });
  });
  return { count: count, minReturn: minReturn, minTotal: minTotal, failures: failures };
}

// Devolución sin ruido: debe cruzar la red y botar primero en la mesa del contrario.
function checkReturn(fromZ, x, y, tx, tz, tDes) {
  var y0 = Math.max(y, P.HIT_YMIN);              // igual que launchBall en game.js
  var v = launchTo(x, y0, fromZ, tx, tz, tDes);
  var b = { x: x, y: y0, z: fromZ, vx: v.vx, vy: v.vy, vz: v.vz };
  var opp = fromZ > 0 ? -1 : 1;
  var ev = simulate(b, opp);
  var first = ev[0];
  var ok = first.type === "bounce" && first.side === opp && Math.abs(first.x) <= P.HW && Math.abs(first.z) <= P.HL;
  return { ok: ok, ev: ev };
}

// Devoluciones de un lado con los parámetros actuales. shotTime: factor de tiempo de vuelo (PP.shotTime).
// side +1: golpe humano (potencia 0.35 o 1, objetivo ±AIM_X); side -1: golpe de la máquina (sin faltas intencionales).
export function checkReturns(side, reach, shotTime) {
  var count = 0, failures = [], z = reachZone(side, reach);
  var powers = side === 1 ? [0.35, 1] : range(0.25, 1, 7), aim = side === 1 ? P.AIM_X : P.AI_AIM_X;
  powers.forEach(function (power) {
    range(-z.x, z.x, 15).forEach(function (x) {
      range(z.y0, z.y1, side === 1 ? 12 : 10).forEach(function (y) {
        range(-aim, aim, 9).forEach(function (tx) {
          count++;
          var tz = -side * (P.DEPTH_MIN + P.DEPTH_RANGE * power);
          var r = checkReturn(side * P.PZ, x, y, tx, tz, (P.T_BASE - P.T_POWER * power) * shotTime);
          if (!r.ok) failures.push({ power: power, x: x, y: y, tx: tx, ev: fmt(r.ev) });
        });
      });
    });
  });
  return { count: count, failures: failures };
}
