// Tests de física: simulan con el mismo paso (1/120 s) y las mismas funciones que usa el juego.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PZ, REACH, HW, HL, SERVE_Y, launchTo, serveVel,
  integrate, hitsNet, onTable, bounceTable, crossPlane, isOut
} from "../src/physics.js";

var STEP = 1 / 120;

// Alcance vertical de cada paleta (ver input.js y ai.js): centro de la paleta ± REACH.
var REACH_Y = { "1": [0.75 - REACH, 1.75 + REACH], "-1": [0.75 - REACH, 1.4 + REACH] };
var REACH_X = { "1": 1.1 + REACH, "-1": 1.3 + REACH };

// Simula una pelota en juego y devuelve la lista de eventos hasta que cruza el plano de golpeo
// del lado `recv` (+1 jugador 0, -1 rival), toca la red o se sale.
function simulate(b, recv) {
  var ev = [], t = 0;
  while (t < 5) {
    var ox = b.x, oy = b.y, oz = b.z;
    integrate(b, STEP); t += STEP;
    if (hitsNet(ox, oy, oz, b)) { ev.push({ type: "net", t: t }); return ev; }
    if (onTable(b)) { bounceTable(b); ev.push({ type: "bounce", side: b.z > 0 ? 1 : -1, t: t, x: b.x, z: b.z }); }
    var c = crossPlane(ox, oy, oz, b, recv * PZ);
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

test("saques válidos: botan en el lado de quien saca, luego en el contrario, pasan la red y son devolvibles", function (t) {
  var count = 0, minReturn = Infinity, minTotal = Infinity, failures = [];
  [1, -1].forEach(function (side) {
    // x0: game.js acota la x de saque a [-0.6, 0.6]; x2: jugador [-0.5, 0.5], máquina [-0.45, 0.45].
    range(-0.6, 0.6, 25).forEach(function (x0) {
      range(-0.5, 0.5, 21).forEach(function (x2) {
        count++;
        var b = serveVel(side, x0, SERVE_Y, x2);
        var recv = -side;
        var ev = simulate(b, recv);
        var types = ev.map(function (e) { return e.type; }).join(",");
        var ok = types === "bounce,bounce,plane" && ev[0].side === side && ev[1].side === recv;
        if (ok) {
          var p = ev[2];
          ok = p.y >= REACH_Y[recv][0] && p.y <= REACH_Y[recv][1] && Math.abs(p.x) <= REACH_X[recv];
          minReturn = Math.min(minReturn, p.t - ev[1].t);
          minTotal = Math.min(minTotal, p.t);
        }
        if (!ok) failures.push({ side: side, x0: x0, x2: x2, ev: fmt(ev) });
      });
    });
  });
  t.diagnostic(count + " saques simulados; tiempo mínimo saque→plano de golpeo " + minTotal.toFixed(3) +
    " s; tiempo mínimo desde el bote en el lado receptor " + minReturn.toFixed(3) + " s");
  assert.deepEqual(failures.slice(0, 5), [], failures.length + " saques inválidos");
});

// Devolución sin ruido: debe cruzar la red y botar primero en la mesa del contrario.
function checkReturn(fromZ, x, y, tx, tz, tDes) {
  var y0 = Math.max(y, 0.95);              // igual que launchBall en game.js
  var v = launchTo(x, y0, fromZ, tx, tz, tDes);
  var b = { x: x, y: y0, z: fromZ, vx: v.vx, vy: v.vy, vz: v.vz };
  var opp = fromZ > 0 ? -1 : 1;
  var ev = simulate(b, opp);
  var first = ev[0];
  var ok = first.type === "bounce" && first.side === opp && Math.abs(first.x) <= HW && Math.abs(first.z) <= HL;
  return { ok: ok, ev: ev };
}

test("devoluciones del jugador 0 (sin ruido) cruzan la red y caen en la mesa contraria", function (t) {
  var count = 0, failures = [];
  [0.35, 1].forEach(function (power) {
    range(-1.1 - REACH, 1.1 + REACH, 15).forEach(function (x) {
      range(REACH_Y["1"][0], REACH_Y["1"][1], 12).forEach(function (y) {
        range(-0.65, 0.65, 9).forEach(function (tx) {
          count++;
          var r = checkReturn(PZ, x, y, tx, -(0.55 + 0.55 * power), 0.9 - 0.45 * power);
          if (!r.ok) failures.push({ power: power, x: x, y: y, tx: tx, ev: fmt(r.ev) });
        });
      });
    });
  });
  t.diagnostic(count + " devoluciones simuladas");
  assert.deepEqual(failures.slice(0, 5), [], failures.length + " devoluciones inválidas");
});

test("devoluciones de la máquina (sin falta intencional) cruzan la red y caen en la mesa contraria", function (t) {
  var count = 0, failures = [];
  range(0.25, 1, 7).forEach(function (power) {
    range(-1.3 - REACH, 1.3 + REACH, 15).forEach(function (x) {
      range(REACH_Y["-1"][0], REACH_Y["-1"][1], 10).forEach(function (y) {
        range(-0.62, 0.62, 9).forEach(function (tx) {
          count++;
          var r = checkReturn(-PZ, x, y, tx, 0.55 + 0.55 * power, 0.9 - 0.45 * power);
          if (!r.ok) failures.push({ power: power, x: x, y: y, tx: tx, ev: fmt(r.ev) });
        });
      });
    });
  });
  t.diagnostic(count + " devoluciones simuladas");
  assert.deepEqual(failures.slice(0, 5), [], failures.length + " devoluciones inválidas");
});
