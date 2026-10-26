// Tests de física con los parámetros por defecto y con todas las combinaciones de power-ups. Los barridos están en sim.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { P, DEFAULTS, resetParams, setParams, launchTo } from "../src/physics.js";
import { checkServes, checkReturns, checkCannon } from "./sim.js";
import { BALANCE } from "../src/balance.js";
import { POWERUPS } from "../src/powerups.js";
import { PLAYER_DEFAULTS } from "../src/effects.js";
import { EVENTS, NARROW, WIDE, NET_HIGH, NET_LOW, widthMod, netMod } from "../src/events.js";

test("los valores por defecto son los validados", function () {
  resetParams();
  var expected = { G: 9.81, R: 0.032, E: 0.88, TOPY: 0.76, HW: 0.7625, HL: 1.37, NET_H: 0.1525, NETW: 0.915,
    PZ: 1.55, REACH: 0.27, PAD_X: 1.1, PAD_YMIN: 0.75, PAD_YMAX: 1.75,
    SERVE_Y: 1.2, SERVE_Z: 1.45, SERVE_Z1: 0.65, SERVE_T1: 0.26, SERVE_X0: 0.6, SERVE_X2: 0.5,
    HIT_YMIN: 0.95, AIM_X: 0.65, DEPTH_MIN: 0.55, DEPTH_RANGE: 0.55, T_BASE: 0.9, T_POWER: 0.45, NET_CLEAR: 0.07,
    AI_X: 1.3, AI_YMAX: 1.4, AI_AIM_X: 0.62, AI_FAULT_X: 0.95, AI_FAULT_Z: 1.75, AI_SERVE_X: 0.45 };
  assert.deepEqual(Object.assign({}, DEFAULTS), expected);
  assert.equal(P.NET_TOP, 0.76 + 0.1525);
  for (var k in DEFAULTS) assert.equal(P[k], DEFAULTS[k], k);
});

test("saques válidos: botan en el lado de quien saca, luego en el contrario, pasan la red y son devolvibles", function (t) {
  resetParams();
  var r = checkServes(P.REACH);
  t.diagnostic(r.count + " saques simulados; tiempo mínimo saque→plano de golpeo " + r.minTotal.toFixed(3) +
    " s; tiempo mínimo desde el bote en el lado receptor " + r.minReturn.toFixed(3) + " s");
  assert.deepEqual(r.failures.slice(0, 5), [], r.failures.length + " saques inválidos");
});

test("devoluciones del jugador 0 (sin ruido) cruzan la red y caen en la mesa contraria", function (t) {
  resetParams();
  var r = checkReturns(1, P.REACH, 1);
  t.diagnostic(r.count + " devoluciones simuladas");
  assert.deepEqual(r.failures.slice(0, 5), [], r.failures.length + " devoluciones inválidas");
});

test("devoluciones de la máquina (sin falta intencional) cruzan la red y caen en la mesa contraria", function (t) {
  resetParams();
  var r = checkReturns(-1, P.REACH, 1);
  t.diagnostic(r.count + " devoluciones simuladas");
  assert.deepEqual(r.failures.slice(0, 5), [], r.failures.length + " devoluciones inválidas");
});

// ---------- Con power-ups: todas las combinaciones del registro (no una lista a mano) ----------

// Parámetros de jugador para cada subconjunto de power-ups de jugador (sin repetir los que dan lo mismo).
function playerCombos() {
  var defs = POWERUPS.filter(function (d) { return d.scope === "player"; }), out = {}, mask;
  for (mask = 0; mask < (1 << defs.length); mask++) {
    var pp = Object.assign({}, PLAYER_DEFAULTS), names = [];
    defs.forEach(function (d, k) { if (mask & (1 << k)) { d.mod(pp); names.push(d.id); } });
    var key = JSON.stringify([pp.reachMul, pp.shotTime, pp.cannon]);   // lo que afecta a la física de la pelota
    if (!out[key]) out[key] = { pp: pp, names: names.join("+") || "ninguno" };
  }
  return Object.keys(out).map(function (k) { return out[k]; });
}

test("devoluciones válidas con todas las combinaciones de power-ups de quien golpea", function (t) {
  resetParams();
  var combos = playerCombos(), total = 0, bad = [];
  combos.forEach(function (c) {
    [1, -1].forEach(function (side) {
      var r = checkReturns(side, P.REACH * c.pp.reachMul, c.pp.shotTime);
      total += r.count;
      if (r.failures.length) bad.push(c.names + " lado " + side + ": " + r.failures.length + " " + JSON.stringify(r.failures[0]));
    });
  });
  t.diagnostic(combos.length + " combinaciones distintas (" + combos.map(function (c) { return c.names; }).join(", ") + "); " + total + " devoluciones");
  assert.deepEqual(bad, []);
});

test("saques válidos y devolvibles con todas las combinaciones de power-ups de quien recibe", function (t) {
  resetParams();
  var combos = playerCombos(), bad = [];
  combos.forEach(function (c) {
    var r = checkServes(P.REACH * c.pp.reachMul);
    if (r.failures.length) bad.push(c.names + ": " + r.failures.length);
  });
  t.diagnostic(combos.length + " combinaciones de alcance del receptor");
  assert.deepEqual(bad, []);
});

test("la pelota rápida de verdad llega antes (también cuando hay que subir el arco para pasar la red)", function (t) {
  resetParams();
  var fast = POWERUPS.filter(function (d) { return d.id === "fast"; })[0], pp = Object.assign({}, PLAYER_DEFAULTS);
  fast.mod(pp);
  var worst = 0, n = 0;
  [0.35, 0.6, 1].forEach(function (power) {
    for (var x = -1; x <= 1.001; x += 0.25) for (var y = 0.6; y <= 1.9; y += 0.1) for (var tx = -0.6; tx <= 0.61; tx += 0.3) {
      var y0 = Math.max(y, P.HIT_YMIN), tz = -(P.DEPTH_MIN + P.DEPTH_RANGE * power), tD = P.T_BASE - P.T_POWER * power;
      var a = launchTo(x, y0, P.PZ, tx, tz, tD), b = launchTo(x, y0, P.PZ, tx, tz, tD * pp.shotTime);
      worst = Math.max(worst, b.t / a.t); n++;
    }
  });
  t.diagnostic(n + " golpes: la rápida tarda como mucho " + worst.toFixed(2) + " de lo normal");
  assert.ok(worst <= 0.85, "peor caso " + worst);
});

// ---------- Eventos de mesa ----------
// Pone P como lo dejaría un conjunto de efectos de mesa (aplicando sus mod() del registro, como effects.recompute).
function applyTable(mods) {
  resetParams();
  var cur = Object.assign({}, DEFAULTS);
  mods.forEach(function (m) { m(cur); });
  setParams(cur);
}
function failCount(reach, shotTime, dens) {
  var s = checkServes(reach, dens), a = checkReturns(1, reach, shotTime, dens), b = checkReturns(-1, reach, shotTime, dens);
  return { serves: s.failures.length, returns: a.failures.length + b.failures.length, count: s.count + a.count + b.count,
           example: (s.failures[0] || a.failures[0] || b.failures[0]) };
}

test("barrido de anchos de mesa (x0.7 a x1.3): saques válidos y devoluciones dentro de la mesa", function (t) {
  var bad = [], total = 0;
  for (var f = 0.7; f <= 1.3001; f += 0.05) {
    applyTable([widthMod(f)]);
    var r = failCount(P.REACH, 1, 0.6);
    total += r.count;
    if (r.serves || r.returns) bad.push("x" + f.toFixed(2) + ": " + JSON.stringify(r));
    assert.ok(P.NETW - P.HW > 0.15 && P.AI_FAULT_X > P.HW + P.R, "la red sobresale y las faltas de la IA caen fuera (x" + f.toFixed(2) + ")");
  }
  resetParams();
  t.diagnostic("13 anchos, " + total + " simulaciones (eventos: x" + NARROW + " y x" + WIDE + ")");
  assert.deepEqual(bad, []);
});

test("barrido de alturas de red (x0.4 a x1.6): saques y devoluciones válidos", function (t) {
  var bad = [], total = 0;
  for (var f = 0.4; f <= 1.6001; f += 0.1) {
    applyTable([netMod(f)]);
    var r = failCount(P.REACH, 1, 0.6);
    total += r.count;
    if (r.serves || r.returns) bad.push("x" + f.toFixed(1) + ": " + JSON.stringify(r));
  }
  resetParams();
  t.diagnostic("13 alturas, " + total + " simulaciones (eventos: x" + NET_LOW + " y x" + NET_HIGH + ")");
  assert.deepEqual(bad, []);
});

test("la red alta deja al menos un 20 % de margen hasta la altura en que los saques dejan de pasar", function (t) {
  var lo = NET_HIGH, hi = 3;                       // busca por bisección el primer factor con saques inválidos
  applyTable([netMod(hi)]);
  assert.ok(checkServes(P.REACH, 0.4).failures.length > 0, "con x3 los saques deben fallar");
  while (hi - lo > 0.01) {
    var mid = (lo + hi) / 2;
    applyTable([netMod(mid)]);
    if (checkServes(P.REACH, 0.4).failures.length) hi = mid; else lo = mid;
  }
  resetParams();
  t.diagnostic("los saques dejan de pasar con la red x" + hi.toFixed(2) + " (" + (DEFAULTS.NET_H * hi * 100).toFixed(1) + " cm); red alta: x" + NET_HIGH);
  assert.ok(NET_HIGH <= hi * 0.8, "margen insuficiente: límite x" + hi.toFixed(2));
});

test("todas las combinaciones permitidas: cada estado de la mesa por cada combinación de power-ups", function (t) {
  var tables = [{ name: "mesa normal", mods: [] }].concat(EVENTS.map(function (e) { return { name: e.name, mods: [e.mod] }; }));
  var combos = playerCombos(), bad = [], total = 0;
  tables.forEach(function (tb) {
    combos.forEach(function (c) {
      applyTable(tb.mods);
      var r = failCount(P.REACH * c.pp.reachMul, c.pp.shotTime, 0.6);
      total += r.count;
      if (r.serves || r.returns) bad.push(tb.name + " + " + c.names + ": " + JSON.stringify(r));
    });
  });
  resetParams();
  t.diagnostic(tables.length + " estados de mesa x " + combos.length + " combinaciones de power-ups, " + total + " simulaciones");
  assert.deepEqual(bad, []);
});

test("cañonazo: con cada estado de mesa y cada combinación de power-ups cruza la red y bota en la mesa contraria", function (t) {
  var C = BALANCE.cannon;
  var tables = [{ name: "mesa normal", mods: [] }].concat(EVENTS.map(function (e) { return { name: e.name, mods: [e.mod] }; }));
  var combos = playerCombos().filter(function (c) { return c.pp.cannon; }), bad = [], total = 0, body = 0;
  assert.ok(combos.length >= 2, "combinaciones con cañonazo: " + combos.length);
  tables.forEach(function (tb) {
    combos.forEach(function (c) {
      applyTable(tb.mods);
      [1, -1].forEach(function (side) {
        var r = checkCannon(side, P.REACH * c.pp.reachMul, c.pp.shotTime, C.depth, C.bodyZ, 0.6);
        total += r.count; body += r.body;
        if (r.failures.length) bad.push(tb.name + " + " + c.names + " lado " + side + ": " + r.failures.length + " " + JSON.stringify(r.failures[0]));
      });
    });
  });
  resetParams();
  t.diagnostic(total + " cañonazos (" + combos.map(function (c) { return c.names; }).join(", ") + " x " + tables.length +
    " mesas); sin devolverlos, " + (100 * body / total).toFixed(0) + " % llega al plano del cuerpo");
  assert.deepEqual(bad, []);
  assert.ok(body / total > 0.9, "la mayoría de los cañonazos no devueltos deben llegar al cuerpo");
});
