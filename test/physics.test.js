// Tests de física con los parámetros por defecto. Los barridos están en sim.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { P, DEFAULTS, resetParams } from "../src/physics.js";
import { checkServes, checkReturns } from "./sim.js";

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
