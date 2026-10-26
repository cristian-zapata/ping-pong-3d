// Tests de reglas con jugadores simétricos (game.js no usa DOM, así que corre en Node).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PZ, predict } from "../src/physics.js";
import { S, B, PL, out, tick, trySwing, newGame, setControls } from "../src/game.js";
import { msgText } from "../src/texts.js";

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

// Deja el estado como recién cargado. newGame() invierte base, así que base = 1 - (quien saca primero).
function reset(c0, c1, me, firstServer) {
  setControls(c0, c1, me);
  Object.assign(S, { mode: "menu", prev: null, diff: "medio", score: [0, 0], base: 1 - firstServer, server: 0,
                     timer: 0, pending: null, wins: 0, losses: 0 });
  Object.assign(B, { x: 0, y: 1, z: 1.45, vx: 0, vy: 0, vz: 0, hitter: 0, need: "opp", live: false });
  PL.forEach(function (pl) { Object.assign(pl, { tx: 0, ty: 1.05, x: 0, y: 1.05, vx: 0, swing: 0, cd: 0, err: 0, react: 0 }); });
}

var msgs = [];
out.msg = function (d) { if (d) msgs.push(msgText(d, S.me, PL[1 - S.me].ctrl === "ia")); };
out.hud = function () {};
out.overlay = function () {};

// Bot humano: saca tras 0.6 s, va adonde llegará la pelota (con desvío `off` en su marco) y golpea fuerte al final.
function makeBot(i, off) {
  var wait = 0;
  return function () {
    var pl = PL[i];
    if (S.mode === "serve" && S.server === i) { wait += STEP; if (wait > 0.6) { wait = 0; trySwing(i); } }
    if (S.mode === "play" && B.live && B.vz * pl.side > 0) {
      var p = predict(B.x, B.y, B.z, B.vx, B.vy, B.vz, pl.side * PZ);
      if (p) { pl.tx = p.x + pl.side * off; pl.ty = p.y; if (p.t < 0.1) trySwing(i); }
    }
  };
}

// Juega una partida completa; devuelve la traza de la pelota, los mensajes y el marcador.
function playGame(bots) {
  var trace = [], n = 0;
  msgs = [];
  newGame();
  while (S.mode !== "over" && n < 1e6) {
    bots.forEach(function (b) { b(); });
    tick(STEP);
    trace.push([B.x, B.y, B.z]);
    n++;
  }
  return { trace: trace, msgs: msgs.slice(), score: S.score.slice(), mode: S.mode };
}

test("las reglas son simétricas: la partida espejada da la pelota reflejada y el mismo resultado", function (t) {
  [[0.05, 0.27], [0.27, 0.22], [-0.12, 0.3]].forEach(function (offs, k) {
    // Partida A: el papel "a" es el jugador 0 (saca primero) y la pantalla es suya.
    reset("local", "local", 0, 0); seed(100 + k);
    var a = playGame([makeBot(0, offs[0]), makeBot(1, offs[1])]);
    // Partida B: el mismo papel "a" lo juega el jugador 1 (saca primero) y la pantalla es suya.
    reset("local", "local", 1, 1); seed(100 + k);
    var b = playGame([makeBot(1, offs[0]), makeBot(0, offs[1])]);

    assert.equal(a.mode, "over");
    assert.equal(a.trace.length, b.trace.length, "misma duración");
    for (var i = 0; i < a.trace.length; i++) {
      var p = a.trace[i], q = b.trace[i];
      if (Math.abs(p[0] + q[0]) > 1e-9 || Math.abs(p[1] - q[1]) > 1e-9 || Math.abs(p[2] + q[2]) > 1e-9) {
        assert.fail("paso " + i + ": pelota " + p + " vs espejo " + q);
      }
    }
    assert.deepEqual(b.msgs, a.msgs, "mismos mensajes desde el punto de vista de cada uno");
    assert.deepEqual(b.score, [a.score[1], a.score[0]], "marcador espejado");
    t.diagnostic("partida " + k + ": " + a.score.join("-") + " en " + (a.trace.length * STEP).toFixed(0) + " s, " + a.msgs.length + " mensajes");
  });
  Math.random = realRandom;
});

test("el saque del jugador remoto solo lo dispara su propia entrada", function () {
  reset("local", "remoto", 0, 1);
  newGame();
  assert.equal(S.server, 1);
  for (var i = 0; i < 600; i++) tick(STEP);         // 5 s: no hay saque automático
  assert.equal(S.mode, "serve");
  trySwing(0);                                        // el local no puede sacar por el remoto
  assert.equal(S.mode, "serve");
  trySwing(1);
  assert.equal(S.mode, "play");
  assert.equal(B.hitter, 1);
  assert.ok(B.vz > 0, "la pelota sale hacia el lado del jugador 0");
  assert.ok(B.z < 0, "desde el lado del jugador 1");
});

test("la máquina saca sola desde cualquier lado y su entrada se ignora", function () {
  reset("ia", "local", 1, 0);
  newGame();
  assert.equal(S.server, 0);
  trySwing(0);
  assert.equal(S.mode, "serve", "trySwing no actúa sobre la IA");
  for (var i = 0; i < 200 && S.mode === "serve"; i++) tick(STEP);
  assert.equal(S.mode, "play");
  assert.equal(B.hitter, 0);
  assert.ok(B.vz < 0);
});

test("máquina contra máquina termina una partida válida", function () {
  reset("ia", "ia", 0, 0); seed(7);
  newGame();
  for (var i = 0; i < 120 * 60 * 30 && S.mode !== "over"; i++) tick(STEP);
  Math.random = realRandom;
  assert.equal(S.mode, "over");
  var hi = Math.max(S.score[0], S.score[1]), lo = Math.min(S.score[0], S.score[1]);
  assert.ok(hi >= 11 && hi - lo >= 2, "marcador final " + S.score);
});
