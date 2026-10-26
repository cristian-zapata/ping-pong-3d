// Tests de los eventos de mesa: registro, cuándo empiezan, exclusividad, espera mínima, modo y partidas completas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { P, DEFAULTS } from "../src/physics.js";
import * as fx from "../src/effects.js";
import { EVENTS, EVT, NARROW, WIDE, NET_HIGH, NET_LOW } from "../src/events.js";
import { ORB, orbStep } from "../src/powerups.js";
import { S, B, PL, out, tick, newGame, setControls } from "../src/game.js";

var STEP = 1 / 120;
var realRandom = Math.random;
function seed(s) {
  Math.random = function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
var msgs = [];
out.hud = out.overlay = out.sound = function () {};
out.msg = function (d) { if (d && d.k === "point") msgs.push(d); };
function reset(mode) {
  fx.clear(); msgs = [];
  setControls("ia", "ia", 0);
  Object.assign(S, { mode: "menu", prev: null, diff: "medio", score: [0, 0], base: 0, server: 0, timer: 0, pending: null,
                     fxMode: mode, orb: null, orbWait: 0, lock: 0, evWait: 0 });
  Object.assign(B, { x: 0, y: 1, z: 1.45, vx: 0, vy: 0, vz: 0, hitter: 0, need: "opp", live: false });
  PL.forEach(function (pl) { Object.assign(pl, { tx: 0, ty: 1.05, x: 0, y: 1.05, vx: 0, swing: 0, cd: 0, err: 0, react: 0 }); });
}
function tableState() {
  if (P.HW < DEFAULTS.HW) return "narrow";
  if (P.HW > DEFAULTS.HW) return "wide";
  if (P.NET_H > DEFAULTS.NET_H) return "nethigh";
  if (P.NET_H < DEFAULTS.NET_H) return "netlow";
  return "";
}

test("los cuatro eventos de mesa están registrados, duran puntos y cambian lo que dicen", function () {
  assert.deepEqual(EVENTS.map(function (e) { return e.id; }), ["narrow", "wide", "nethigh", "netlow"]);
  var expected = { narrow: { HW: DEFAULTS.HW * NARROW }, wide: { HW: DEFAULTS.HW * WIDE },
                   nethigh: { NET_H: DEFAULTS.NET_H * NET_HIGH }, netlow: { NET_H: DEFAULTS.NET_H * NET_LOW } };
  EVENTS.forEach(function (e) {
    assert.equal(fx.getDef(e.id), e);
    assert.ok(e.cat === "event" && e.scope === "table" && e.unit === "points" && e.n === EVT.LEN, e.id);
    assert.ok(e.icon && /^#[0-9a-f]{6}$/i.test(e.color) && e.name, e.id);
    fx.clear(); fx.apply(e.id, -1); fx.onPoint();
    for (var k in expected[e.id]) assert.equal(P[k], expected[e.id][k], e.id + " " + k);
    assert.equal(P.NET_TOP, P.TOPY + P.NET_H);
    if (e.id === "narrow" || e.id === "wide") {
      var f = P.HW / DEFAULTS.HW;
      assert.ok(Math.abs(P.AIM_X - DEFAULTS.AIM_X * f) < 1e-12 && Math.abs(P.SERVE_X2 - DEFAULTS.SERVE_X2 * f) < 1e-12, "objetivos escalados");
      assert.ok(Math.abs((P.NETW - P.HW) - (DEFAULTS.NETW - DEFAULTS.HW)) < 1e-12, "la red sobresale igual");
    }
  });
  fx.clear();
  assert.equal(P.HW, DEFAULTS.HW);
});

test("en una partida: espera inicial, un solo evento a la vez, dura 3 puntos y respeta la espera entre eventos", function (t) {
  reset("events"); seed(3);
  newGame();
  var log = [], prev = "", point = 0, lastMode = S.mode;
  for (var i = 0; i < 120 * 60 * 90 && point < 60; i++) {
    if (S.mode === "over") { newGame(); prev = ""; log.push({ point: point + 0.5, ev: "(nueva partida)" }); }
    tick(STEP);
    if (lastMode !== "serve" && S.mode === "serve") {
      point++;
      var cur = tableState();
      var activeTable = fx.list().filter(function (e) { return fx.getDef(e.id).scope === "table"; });
      assert.ok(activeTable.length <= 1, "nunca dos eventos de mesa a la vez");
      if (cur !== prev) log.push({ point: point, ev: cur });
      prev = cur;
    }
    lastMode = S.mode;
  }
  Math.random = realRandom;
  // cada partida nueva limpia los efectos: se comprueba cada partida por separado
  var games = [[]];
  log.forEach(function (l) { if (l.ev === "(nueva partida)") games.push([]); else games[games.length - 1].push(l); });
  var starts = log.filter(function (l) { return l.ev && l.ev !== "(nueva partida)"; }), ends = log.filter(function (l) { return !l.ev; });
  t.diagnostic(point + " puntos, " + starts.length + " eventos: " + starts.map(function (l) { return l.ev + "@" + l.point; }).join(" "));
  assert.ok(starts.length >= 3, "hubo eventos");
  assert.ok(starts[0].point > EVT.FIRST, "el primero no antes de " + EVT.FIRST + " puntos");
  games.forEach(function (g) {
    for (var k = 0; k < g.length - 1; k++) {
      if (g[k].ev) assert.equal(g[k + 1].point - g[k].point, EVT.LEN, "dura " + EVT.LEN + " puntos");
      else assert.ok(g[k + 1].point - g[k].point > EVT.GAP, "espera de al menos " + EVT.GAP + " puntos entre eventos");
    }
  });
  assert.ok(ends.length >= 1);
  fx.clear();
});

test("los eventos solo ocurren en 'Solo eventos' y 'Todo' (y no gastan azar en los otros modos)", function () {
  ["off", "powerups"].forEach(function (mode) {
    reset(mode); seed(9);
    newGame();
    for (var i = 0; i < 120 * 60 * 5 && S.mode !== "over"; i++) { tick(STEP); assert.equal(tableState(), "", mode); }
  });
  reset("all"); seed(9);
  newGame();
  var seen = false;
  for (var i = 0; i < 120 * 60 * 10 && S.mode !== "over" && !seen; i++) { tick(STEP); seen = tableState() !== ""; }
  Math.random = realRandom;
  assert.ok(seen, "en 'Todo' hay eventos");
  fx.clear();
});

test("partidas máquina contra máquina con eventos (y con todo) terminan bien; al final la mesa vuelve a la normalidad", function (t) {
  var faults = { normal: [0, 0], evento: [0, 0] };
  ["events", "all"].forEach(function (mode, k) {
    ["facil", "dificil"].forEach(function (diff, j) {
      reset(mode); seed(200 + k * 10 + j);
      S.diff = diff;
      newGame();
      var lastLen = 0;
      for (var i = 0; i < 120 * 60 * 30 && S.mode !== "over"; i++) {
        tick(STEP);
        if (msgs.length > lastLen) {                          // cada punto: ¿con qué mesa se jugó? ¿fue una pelota fuera?
          var d = msgs[msgs.length - 1], bucket = tableState() ? "evento" : "normal";
          faults[bucket][0]++; if (d.why === "out" || d.why === "net") faults[bucket][1]++;
          lastLen = msgs.length;
        }
      }
      assert.equal(S.mode, "over", mode + " " + diff);
      var hi = Math.max(S.score[0], S.score[1]), lo = Math.min(S.score[0], S.score[1]);
      assert.ok(hi >= 11 && hi - lo >= 2);
    });
  });
  Math.random = realRandom;
  fx.clear();
  assert.equal(tableState(), "", "sin efectos, mesa normal");
  var pct = function (a) { return (100 * a[1] / Math.max(1, a[0])).toFixed(0) + " % de " + a[0]; };
  t.diagnostic("puntos por pelota fuera o en la red: mesa normal " + pct(faults.normal) + " · con evento " + pct(faults.evento));
  assert.ok(faults.evento[0] > 10);
});

test("con la mesa angosta o ancha, los orbes siguen apareciendo sobre la mesa", function () {
  ["narrow", "wide"].forEach(function (id) {
    fx.clear(); fx.apply(id, -1); fx.onPoint();
    var st = { orb: null, orbWait: 0 }; seed(11);
    for (var i = 0; i < 400; i++) {
      st.orb = null; st.orbWait = 0;
      while (!st.orb) orbStep(st, 1);
      assert.ok(Math.abs(st.orb.x) <= ORB.X * P.HW / DEFAULTS.HW + 1e-12 && Math.abs(st.orb.x) < P.HW, id + " x " + st.orb.x);
    }
  });
  Math.random = realRandom;
  fx.clear();
});
