// Tests del sistema de efectos (effects.js) y de su integración con las reglas (game.js).
// Usa efectos de prueba registrados aquí; los efectos reales llegan en fases posteriores.
import { test } from "node:test";
import assert from "node:assert/strict";
import { P, DEFAULTS, predict } from "../src/physics.js";
import * as fx from "../src/effects.js";
import { S, B, PL, out, tick, newGame, setControls, giveEffect, moveHuman, reachOf, trySwing, TABLE_ANIM } from "../src/game.js";

var STEP = 1 / 120;
var notices = [];
fx.onNotice(function (ev) { notices.push(ev.k + ":" + ev.id + ":" + ev.o); });
out.msg = out.hud = out.overlay = out.sound = function () {};

fx.register({ id: "t_sec", name: "Prueba segundos", icon: "S", color: "#fff", cat: "powerup", scope: "player", unit: "seconds", n: 8,
  mod: function (pp) { pp.reachMul *= 1.5; } });
fx.register({ id: "t_hit", name: "Prueba golpe", icon: "H", color: "#fff", cat: "powerup", scope: "player", unit: "hits", n: 1,
  mod: function (pp) { pp.shotTime *= 0.8; } });
fx.register({ id: "t_ghit", name: "Prueba global", icon: "G", color: "#fff", cat: "event", scope: "global", unit: "hits", n: 3,
  mod: function (p) { p.G *= 1; } });
fx.register({ id: "t_cap", name: "Prueba tope", icon: "C", color: "#fff", cat: "powerup", scope: "player", unit: "seconds", n: 3,
  mod: function (pp) { pp.speedCap = 0.5; } });
fx.register({ id: "t_narrow", name: "Prueba mesa", icon: "M", color: "#fff", cat: "event", scope: "table", unit: "points", n: 2,
  mod: function (p) { p.HW *= 0.8; } });
fx.register({ id: "t_narrow2", name: "Prueba mesa 2", icon: "N", color: "#fff", cat: "event", scope: "table", unit: "points", n: 2,
  mod: function (p) { p.HW *= 0.9; } });

function fresh() { fx.clear(); notices = []; }
function isDefault() {
  for (var k in DEFAULTS) if (P[k] !== DEFAULTS[k]) return k;
  for (var i = 0; i < 2; i++) for (k in fx.PLAYER_DEFAULTS) if (fx.PP[i][k] !== fx.PLAYER_DEFAULTS[k]) return "PP" + i + "." + k;
  return true;
}

test("register rechaza definiciones inválidas, y un efecto de mesa que no dure puntos", function () {
  var base = { id: "x_ok", name: "x", icon: "x", color: "#000", cat: "powerup", scope: "player", unit: "hits", n: 1, mod: function () {} };
  assert.throws(function () { fx.register(Object.assign({}, base, { id: "Mal Id" })); });
  assert.throws(function () { fx.register(Object.assign({}, base, { cat: "otro" })); });
  assert.throws(function () { fx.register(Object.assign({}, base, { unit: "minutos" })); });
  assert.throws(function () { fx.register(Object.assign({}, base, { n: 0 })); });
  assert.throws(function () { fx.register(Object.assign({}, base, { scope: "table", unit: "seconds" })); }, /debe durar puntos/);
  assert.throws(function () { fx.register(Object.assign({}, base, { mod: null })); });
});

test("sin efectos, los parámetros efectivos son exactamente los valores por defecto", function () {
  fresh();
  assert.equal(isDefault(), true);
  assert.equal(P.NET_TOP, DEFAULTS.TOPY + DEFAULTS.NET_H);
  fx.apply("t_sec", 0); fx.apply("t_narrow", -1); fx.onPoint();
  assert.notEqual(isDefault(), true);
  fx.clear();
  assert.equal(isDefault(), true, "clear() devuelve todo a los valores por defecto");
});

test("duración en segundos: solo afecta a su dueño y caduca a los 8 s", function () {
  fresh();
  assert.equal(fx.apply("t_sec", 0), "on");
  assert.equal(fx.PP[0].reachMul, 1.5);
  assert.equal(fx.PP[1].reachMul, 1);
  for (var i = 0; i < 8 * 120 - 2; i++) fx.onSeconds(STEP);
  assert.equal(fx.list().length, 1, "sigue activo justo antes de 8 s");
  fx.onSeconds(STEP); fx.onSeconds(STEP);
  assert.equal(fx.list().length, 0);
  assert.equal(fx.PP[0].reachMul, 1);
  assert.deepEqual(notices, ["fx-on:t_sec:0", "fx-off:t_sec:0"]);
});

test("duración en golpes: cuentan las devoluciones del dueño; las globales cuentan todas", function () {
  fresh();
  fx.apply("t_hit", 1);
  assert.equal(fx.PP[1].shotTime, 0.8);
  fx.onHit(0);
  assert.equal(fx.list().length, 1, "el golpe del rival no lo consume");
  fx.onHit(1);
  assert.equal(fx.list().length, 0);
  assert.equal(fx.PP[1].shotTime, 1);
  fx.apply("t_ghit", 0);
  assert.equal(fx.list()[0].owner, -1, "un efecto global no tiene dueño");
  fx.onHit(0); fx.onHit(1);
  assert.equal(fx.list().length, 1);
  fx.onHit(0);
  assert.equal(fx.list().length, 0);
});

test("duración en puntos: queda pendiente hasta el siguiente punto y dura n puntos", function () {
  fresh();
  assert.equal(fx.apply("t_narrow", -1), "pending");
  assert.equal(P.HW, DEFAULTS.HW, "no cambia la mesa al pedirlo");
  var v = fx.FX.tableVer;
  fx.onPoint();                                     // empieza el punto 1 con la mesa angosta
  assert.equal(P.HW, DEFAULTS.HW * 0.8);
  assert.equal(fx.FX.tableVer, v + 1, "avisa de que la geometría cambió");
  fx.onPoint();                                     // punto 2
  assert.equal(P.HW, DEFAULTS.HW * 0.8);
  fx.onPoint();                                     // punto 3: ya terminó
  assert.equal(P.HW, DEFAULTS.HW);
  assert.equal(fx.FX.tableVer, v + 2);
});

test("los efectos de mesa se componen y renovar un efecto no lo duplica", function () {
  fresh();
  fx.apply("t_narrow", -1); fx.apply("t_narrow2", -1); fx.onPoint();
  assert.equal(P.HW, DEFAULTS.HW * 0.8 * 0.9);
  fresh();
  fx.apply("t_sec", 0);
  for (var i = 0; i < 600; i++) fx.onSeconds(STEP);
  fx.apply("t_sec", 0);
  assert.equal(fx.list().length, 1);
  assert.equal(fx.list()[0].left, 8, "se renueva la duración");
});

test("el modo de partida filtra qué efectos se pueden dar", function () {
  fresh();
  S.fxMode = "off";
  assert.equal(giveEffect("t_sec", 0), null);
  S.fxMode = "events";
  assert.equal(giveEffect("t_sec", 0), null, "un power-up no entra en 'Solo eventos'");
  assert.equal(giveEffect("t_narrow", -1), "pending");
  S.fxMode = "powerups";
  assert.equal(giveEffect("t_narrow2", -1), null, "un evento no entra en 'Solo power-ups'");
  assert.equal(giveEffect("t_sec", 1), "on");
  S.fxMode = "all";
  assert.equal(giveEffect("t_cap", 0), "on");
  assert.equal(giveEffect("no_existe", 0), null);
  S.fxMode = "off";
});

function resetGame(c0, c1) {
  setControls(c0, c1, 0);
  Object.assign(S, { mode: "menu", prev: null, diff: "medio", score: [0, 0], base: 0, server: 0, timer: 0, pending: null });
  Object.assign(B, { x: 0, y: 1, z: 1.45, vx: 0, vy: 0, vz: 0, hitter: 0, need: "opp", live: false });
  PL.forEach(function (pl) { Object.assign(pl, { tx: 0, ty: 1.05, x: 0, y: 1.05, vx: 0, swing: 0, cd: 0, err: 0, react: 0 }); });
}

test("en una partida, la mesa solo cambia entre puntos (nunca con la pelota en juego)", function () {
  fresh(); resetGame("ia", "ia");
  S.fxMode = "all";
  newGame();
  var lastHW = P.HW, changes = [], asked = 0, inPlay = 0;
  for (var i = 0; i < 120 * 400 && S.mode !== "over"; i++) {
    if (S.mode === "play" && B.live && i % 997 === 0) { giveEffect(i % 2 ? "t_narrow" : "t_narrow2", -1); asked++; }
    tick(STEP);
    if (B.live) inPlay++;
    if (P.HW !== lastHW) { changes.push({ mode: S.mode, live: B.live }); lastHW = P.HW; }
  }
  S.fxMode = "off";
  assert.ok(asked > 3 && changes.length > 3, "pedidos " + asked + ", cambios " + changes.length);
  assert.ok(inPlay > 1000);
  changes.forEach(function (c) { assert.ok(c.mode === "serve" && !c.live, "cambio con modo " + c.mode + ", viva " + c.live); });
});

test("si la mesa cambia al empezar un punto, nadie saca hasta que termina la animación", function () {
  fresh(); resetGame("local", "local");
  S.fxMode = "all";
  newGame();
  assert.equal(S.lock, 0, "sin cambio de mesa no hay bloqueo");
  trySwing(S.server);
  assert.equal(S.mode, "play", "sin efectos se saca al instante, como siempre");
  giveEffect("t_narrow", -1);
  B.live = false; S.mode = "point"; S.timer = 0; S.pending = null;
  tick(STEP);                                       // termina el punto: empieza otro con la mesa nueva
  assert.equal(S.mode, "serve");
  assert.equal(P.HW, DEFAULTS.HW * 0.8);
  assert.equal(S.lock, TABLE_ANIM);
  var steps = 0;
  while (S.mode === "serve" && steps < 200) { trySwing(S.server); tick(STEP); steps++; }
  assert.ok(Math.abs(steps * STEP - TABLE_ANIM) < 2 * STEP, "el saque sale al terminar la animación: " + (steps * STEP).toFixed(3) + " s");
  S.fxMode = "off"; fresh();
});

test("tope de velocidad: limita la paleta humana y la de la máquina; el alcance efectivo sigue al efecto", function () {
  fresh(); resetGame("local", "ia");
  fx.apply("t_cap", 0); fx.apply("t_cap", 1);
  var pl = PL[0];
  pl.x = 0; pl.tx = 1;
  moveHuman(pl, STEP);
  assert.ok(Math.abs(pl.x - 0.5 * STEP) < 1e-12, "humano: " + pl.x);
  S.mode = "play"; B.live = true; B.vz = -1;
  PL[1].x = 0; PL[1].react = 1; PL[1].tx = 1;
  tick(STEP);
  assert.ok(Math.abs(PL[1].x) <= 0.5 * STEP + 1e-12, "máquina: " + PL[1].x);
  fresh();
  assert.equal(reachOf(0), P.REACH);
  fx.apply("t_sec", 0);
  assert.equal(reachOf(0), P.REACH * 1.5);
  assert.equal(reachOf(1), P.REACH);
  fresh();
});

test("nueva partida y snapshot/carga: limpia, sanea lo recibido y avisa de altas y bajas", function () {
  fresh(); resetGame("ia", "ia");
  fx.apply("t_sec", 1); fx.apply("t_hit", 0);
  var snap = JSON.parse(JSON.stringify(fx.snapshot()));
  newGame();
  assert.equal(fx.list().length, 0, "newGame limpia los efectos");
  notices = [];
  fx.load(snap.concat([[999, "no_existe", 0, 3], "basura", [5, "t_sec", 0, "x"], [6, "t_sec", 7, NaN]]));
  assert.equal(fx.list().length, 2, "solo entran los válidos");
  assert.equal(fx.PP[1].reachMul, 1.5, "recalcula los parámetros del invitado");
  assert.deepEqual(notices.sort(), ["fx-on:t_hit:0", "fx-on:t_sec:1"]);
  notices = [];
  fx.load([snap[0]]);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /^fx-off:/);
  fx.load(null);
  assert.equal(fx.list().length, 1, "una lista inválida no cambia nada");
  fresh();
});

test("la guía (predict) usa los parámetros efectivos de la mesa", function () {
  fresh();
  var x = 0.66, a = predict(x, 1.2, -1, 0, 0, 2.6, P.PZ);
  fx.apply("t_narrow", -1); fx.onPoint();           // HW 0.61: la pelota en x = 0.66 ya no bota en la mesa
  var b = predict(x, 1.2, -1, 0, 0, 2.6, P.PZ);
  fresh();
  assert.ok(a && (!b || Math.abs(a.y - b.y) > 0.05), "con la mesa angosta la predicción cambia: " + JSON.stringify([a, b]));
});
