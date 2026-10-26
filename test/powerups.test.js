// Tests de los power-ups: orbe (aparición, vida, recogida), los tres efectos, la IA y la guía.
import { test } from "node:test";
import assert from "node:assert/strict";
import { P, predict, integrate, onTable, bounceTable, crossPlane, hitsNet } from "../src/physics.js";
import * as fx from "../src/effects.js";
import { POWERUPS, ORB, FAST_SHOT, orbStep, orbTouched } from "../src/powerups.js";
import { S, B, PL, out, tick, newGame, setControls, trySwing, reachOf } from "../src/game.js";
import { fxText, msgText } from "../src/texts.js";
import { BALANCE } from "../src/balance.js";
import { impactPose } from "../src/render.js";

var STEP = 1 / 120;
var sounds = [], notices = [];
out.msg = out.hud = out.overlay = function () {};
out.sound = function (n) { sounds.push(n); };
out.notice = function (ev) { notices.push(ev); };
var realRandom = Math.random;
function seed(s) {
  Math.random = function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function reset(c0, c1, mode) {
  fx.clear(); sounds = []; notices = [];
  setControls(c0, c1, 0);
  Object.assign(S, { mode: "menu", prev: null, diff: "medio", score: [0, 0], base: 0, server: 0, timer: 0, pending: null,
                     fxMode: mode || "off", orb: null, orbWait: 0, lock: 0 });
  Object.assign(B, { x: 0, y: 1, z: 1.45, vx: 0, vy: 0, vz: 0, hitter: 0, need: "opp", live: false });
  PL.forEach(function (pl) { Object.assign(pl, { tx: 0, ty: 1.05, x: 0, y: 1.05, vx: 0, swing: 0, cd: 0, err: 0, react: 0 }); });
}

test("los power-ups están registrados con icono, color, textos y destinatario", function () {
  assert.deepEqual(POWERUPS.map(function (d) { return d.id; }), ["big", "fast", "freeze", "cannon"]);
  POWERUPS.forEach(function (d) {
    assert.equal(fx.getDef(d.id), d);
    assert.ok(d.icon && /^#[0-9a-f]{6}$/i.test(d.color) && d.name, d.id);
    assert.equal(d.cat, "powerup");
    ["on", "off"].forEach(function (k) { assert.equal(d.say[k].length, 2, d.id + " " + k); });
  });
  assert.equal(fx.getDef("big").unit, "seconds"); assert.equal(fx.getDef("big").n, 8);
  assert.equal(fx.getDef("fast").unit, "hits"); assert.equal(fx.getDef("fast").n, 1);
  assert.equal(fx.getDef("freeze").unit, "seconds"); assert.equal(fx.getDef("freeze").n, 3);
  assert.equal(fx.getDef("freeze").target, "rival");
  // textos desde cada lado, contra la máquina y en línea
  assert.equal(fxText({ k: "fx-on", id: "freeze", o: 1 }, 0, true), "¡Congelaste a la máquina!");
  assert.equal(fxText({ k: "fx-on", id: "freeze", o: 0 }, 0, true), "¡La máquina te congeló! Tu paleta va lenta 3 s");
  assert.equal(fxText({ k: "fx-on", id: "freeze", o: 0 }, 1, false), "¡Congelaste a tu rival!");
  assert.equal(fxText({ k: "fx-off", id: "fast", o: 1 }, 0, true), "¡Cuidado, pelota rápida!");
});

test("el orbe respeta el primer retraso, la vida, el tiempo mínimo entre orbes y aparece sobre la mesa", function () {
  reset("ia", "ia", "powerups"); seed(1);
  S.orbWait = ORB.FIRST;
  var t = 0, first = null, spawns = [], lastGone = null, gaps = [];
  for (var i = 0; i < 120 * 600; i++) {
    var had = !!S.orb;
    orbStep(S, STEP); t += STEP;
    if (!had && S.orb) { if (first === null) first = t; if (lastGone !== null) gaps.push(t - lastGone); spawns.push(Object.assign({}, S.orb)); }
    if (had && !S.orb) lastGone = t;
  }
  Math.random = realRandom;
  assert.ok(first >= ORB.FIRST, "primer orbe a los " + first.toFixed(1) + " s");
  assert.ok(gaps.length > 10 && Math.min.apply(null, gaps) >= ORB.GAP - 1e-6, "separación mínima " + Math.min.apply(null, gaps).toFixed(2) + " s");
  var avg = gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length;
  assert.ok(avg < ORB.GAP + 12, "separación media " + avg.toFixed(1) + " s: poco frecuente pero no rara");
  spawns.forEach(function (o) {
    assert.ok(Math.abs(o.x) <= ORB.X && Math.abs(o.x) < P.HW, "x " + o.x);
    assert.ok(Math.abs(o.z) >= ORB.Z0 && Math.abs(o.z) <= ORB.Z1 && Math.abs(o.z) < P.HL, "z " + o.z);
    assert.ok(o.y - ORB.R > P.NET_TOP - 0.2 && o.y > P.TOPY + ORB.R, "y " + o.y);
  });
  var kinds = {}; spawns.forEach(function (o) { kinds[o.kind] = (kinds[o.kind] || 0) + 1; });
  assert.deepEqual(Object.keys(kinds).sort(), ["big", "cannon", "fast", "freeze"]);
});

test("sin power-ups en el modo de partida no aparece ningún orbe (ni se consume azar)", function () {
  ["off", "events"].forEach(function (mode) {
    reset("ia", "ia", mode);
    var calls = 0, orig = Math.random;
    Math.random = function () { calls++; return orig(); };
    newGame();
    var before = calls;
    S.orbWait = 0;
    for (var i = 0; i < 120 * 30; i++) { if (S.mode === "over") break; tick(STEP); assert.equal(S.orb, null, mode); }
    Math.random = orig;
    assert.ok(calls >= before, mode);
  });
});

test("orbTouched detecta el paso de la pelota por el orbe y no lo que pasa lejos", function () {
  var orb = { x: 0.2, y: 1.0, z: 0.5 };
  assert.ok(orbTouched(orb, 0.2, 1.0, 0.6, { x: 0.2, y: 1.0, z: 0.4 }), "atraviesa");
  assert.ok(orbTouched(orb, 0.2 + ORB.R, 1.0, 0.6, { x: 0.2 + ORB.R, y: 1.0, z: 0.4 }), "roza dentro del radio");
  assert.ok(!orbTouched(orb, 0.2 + ORB.R + P.R + 0.01, 1.0, 0.6, { x: 0.2 + ORB.R + P.R + 0.01, y: 1.0, z: 0.4 }), "pasa justo fuera");
  assert.ok(!orbTouched(orb, 0.2, 1.6, 0.6, { x: 0.2, y: 1.6, z: 0.4 }), "pasa por encima");
});

// Lanza la pelota del jugador `hitter` hacia el otro lado, atravesando un orbe del tipo `kind`, y avanza la partida.
function shootThroughOrb(kind, hitter) {
  reset("local", "local", "all");
  newGame();
  S.mode = "play";
  var s = PL[hitter].side;
  Object.assign(B, { x: 0, y: 1.1, z: s * 0.9, vx: 0, vy: 0, vz: -s * 4, hitter: hitter, need: "opp", live: true });
  S.orb = { kind: kind, x: 0, y: 1.1 - 4.9 * Math.pow(0.1 / 4, 2), z: s * 0.8, life: 5 };
  for (var i = 0; i < 6; i++) tick(STEP);
}

test("recoger un orbe: lo recoge quien golpeó; paleta grande y pelota rápida son suyas, congelar es para el rival", function () {
  [0, 1].forEach(function (hitter) {
    shootThroughOrb("big", hitter);
    assert.equal(S.orb, null, "el orbe desaparece");
    assert.ok(S.orbWait <= ORB.GAP && S.orbWait > ORB.GAP - 0.1, "vuelve a esperar el mínimo: " + S.orbWait);
    assert.ok(sounds.indexOf("orb") !== -1, "suena");
    assert.deepEqual(fx.list().map(function (e) { return e.id + ":" + e.owner; }), ["big:" + hitter]);
    assert.equal(reachOf(hitter), P.REACH * 1.5);
    assert.equal(reachOf(1 - hitter), P.REACH);
    assert.deepEqual(notices.map(function (n) { return n.k + ":" + n.id + ":" + n.o; }), ["fx-on:big:" + hitter]);

    shootThroughOrb("fast", hitter);
    assert.deepEqual(fx.list().map(function (e) { return e.id + ":" + e.owner; }), ["fast:" + hitter]);
    assert.equal(fx.PP[hitter].shotTime, FAST_SHOT);

    shootThroughOrb("freeze", hitter);
    assert.deepEqual(fx.list().map(function (e) { return e.id + ":" + e.owner; }), ["freeze:" + (1 - hitter)]);
    assert.equal(fx.PP[1 - hitter].speedCap, 0.6);
    assert.equal(fx.PP[hitter].speedCap, Infinity);
  });
  fx.clear();
});

// Prepara una pelota que llega al plano de golpeo del jugador 0 en (x, y) y avanza hasta que la devuelve o pasa.
function incomingTo0(x, y) {
  S.mode = "play";
  Object.assign(B, { x: x, y: y, z: P.PZ - 0.05, vx: 0, vy: 0, vz: 3, hitter: 1, need: "done", live: true });
  for (var i = 0; i < 4 && B.hitter === 1 && B.live; i++) tick(STEP);
  return B.hitter === 0;
}

test("paleta grande: alcanza pelotas que sin ella se le escapan (también a la máquina)", function () {
  reset("local", "ia", "all");
  PL[0].x = PL[0].tx = 0; PL[0].y = PL[0].ty = 1.2;
  var d = (P.REACH + P.REACH * 1.5) / 2;            // entre el alcance normal y el grande
  assert.equal(incomingTo0(d, 1.2), false, "sin efecto no llega");
  reset("local", "ia", "all");
  PL[0].x = PL[0].tx = 0; PL[0].y = PL[0].ty = 1.2;
  fx.apply("big", 0);
  assert.equal(incomingTo0(d, 1.2), true, "con paleta grande sí");
  assert.equal(reachOf(1), P.REACH);
  fx.clear();
});

test("pelota rápida: la siguiente devolución de su dueño tarda menos y el efecto se consume con ella", function () {
  function flightTime(withFast) {
    reset("local", "ia", "all"); seed(5);
    PL[0].x = PL[0].tx = 0; PL[0].y = PL[0].ty = 1.2;
    if (withFast) fx.apply("fast", 0);
    assert.ok(incomingTo0(0.05, 1.2));
    var t = 0;
    while (B.live && B.z > -P.PZ && t < 3) { tick(STEP); t += STEP; if (B.hitter !== 0) break; }
    Math.random = realRandom;
    return t;
  }
  var normal = flightTime(false), fast = flightTime(true);
  assert.ok(fast < normal * 0.85, "normal " + normal.toFixed(3) + " s, rápida " + fast.toFixed(3) + " s");
  assert.equal(fx.list().length, 0, "se consumió con esa devolución");
  assert.equal(fx.PP[0].shotTime, 1);
});

test("congelado: limita la velocidad de la paleta del rival 3 s (humano y máquina)", function () {
  reset("local", "ia", "all");
  fx.apply("freeze", 1); fx.apply("freeze", 0);
  S.mode = "play"; B.live = true; B.vz = -2; B.z = 0.5;
  PL[1].x = 0; PL[1].react = 1; PL[1].tx = 1.2;
  PL[0].x = 0; PL[0].tx = 1.0;
  for (var i = 0; i < 60; i++) tick(STEP);         // 0.5 s
  assert.ok(Math.abs(PL[1].x) <= 0.6 * 0.5 + 1e-9, "máquina recorrió " + PL[1].x.toFixed(3) + " m en 0.5 s");
  assert.ok(Math.abs(PL[0].x) <= 0.6 * 0.5 + 1e-9, "humano recorrió " + PL[0].x.toFixed(3) + " m en 0.5 s");
  for (i = 0; i < 120 * 3; i++) fx.onSeconds(STEP);
  assert.equal(fx.list().length, 0, "dura 3 s");
  fx.clear();
});

test("la máquina recoge orbes y se ve afectada; las partidas con power-ups terminan bien", function (t) {
  var picks = [0, 0], applied = { big: 0, fast: 0, freeze: 0 }, games = 0;
  ["facil", "medio", "dificil"].forEach(function (diff, k) {
    reset("ia", "ia", "powerups"); seed(40 + k);
    S.diff = diff;
    newGame();
    var before = 0;
    out.sound = function (n) { if (n === "orb") picks[B.hitter]++; };
    out.notice = function (ev) { if (ev.k === "fx-on") applied[ev.id]++; };
    for (var i = 0; i < 120 * 60 * 20 && S.mode !== "over"; i++) tick(STEP);
    assert.equal(S.mode, "over", diff + " termina");
    var hi = Math.max(S.score[0], S.score[1]), lo = Math.min(S.score[0], S.score[1]);
    assert.ok(hi >= 11 && hi - lo >= 2);
    games++;
  });
  Math.random = realRandom;
  out.sound = function (n) { sounds.push(n); };
  out.notice = function (ev) { notices.push(ev); };
  t.diagnostic(games + " partidas máquina contra máquina: orbes recogidos " + picks.join(" / ") + "; efectos " + JSON.stringify(applied));
  assert.ok(picks[0] > 0 && picks[1] > 0, "ambas máquinas recogen orbes");
  assert.ok(applied.big > 0 && applied.fast > 0 && applied.freeze > 0, "aparecen los tres efectos");
  fx.clear();
});

test("con efectos activos, la guía (predict) coincide con el vuelo real de la pelota", function (t) {
  reset("ia", "ia", "powerups"); seed(77);
  newGame();
  var worst = 0, n = 0;
  for (var i = 0; i < 120 * 60 * 6 && S.mode !== "over"; i++) {
    if (i % 240 === 0) fx.apply(["big", "fast", "freeze"][(i / 240) % 3], (i / 720) % 2 < 1 ? 0 : 1);   // siempre hay efectos
    tick(STEP);
    if (S.mode === "play" && B.live && B.vz > 0 && B.need === "done" && fx.list().length && i % 7 === 0) {
      var pr = predict(B.x, B.y, B.z, B.vx, B.vy, B.vz, P.PZ);
      var b = { x: B.x, y: B.y, z: B.z, vx: B.vx, vy: B.vy, vz: B.vz }, c = null;
      for (var k = 0; k < 600 && !c; k++) {
        var ox = b.x, oy = b.y, oz = b.z;
        integrate(b, STEP);
        if (hitsNet(ox, oy, oz, b)) break;
        if (onTable(b)) bounceTable(b);
        c = crossPlane(ox, oy, oz, b, P.PZ);
      }
      if (pr && c) { worst = Math.max(worst, Math.hypot(pr.x - c.x, pr.y - c.y)); n++; }
    }
  }
  Math.random = realRandom;
  t.diagnostic(n + " predicciones con efectos activos; error máximo " + (worst * 100).toFixed(1) + " cm");
  assert.ok(n > 100, "muestras " + n);
  assert.ok(worst < 0.03, "error " + worst);
  fx.clear();
});

test("la recogida no cambia nada si el anfitrión no permite power-ups (solo efectos de mesa)", function () {
  reset("local", "local", "events");
  newGame();
  S.mode = "play";
  S.orb = { kind: "big", x: 0, y: 1.1, z: 0.8, life: 5 };
  Object.assign(B, { x: 0, y: 1.1, z: 0.9, vx: 0, vy: 0, vz: -4, hitter: 0, need: "opp", live: true });
  for (var i = 0; i < 6; i++) tick(STEP);
  assert.equal(fx.list().length, 0, "giveEffect lo rechaza por el modo");
});

// Cañonazo del jugador 1 hacia el jugador 0. `ready`: el jugador 0 pone la paleta donde llegará la pelota.
function cannonFrom1(ready) {
  reset("local", "local", "all");
  newGame();
  var events = [], snd = [];
  out.event = function (ev) { events.push(ev); };
  out.sound = function (n, a) { snd.push(n + ":" + a); };
  fx.apply("cannon", 1);
  PL[0].x = PL[0].tx = 0.9; PL[0].y = PL[0].ty = 1.0;          // el cuerpo del jugador 0 está en x = 0.55 · 0.9
  S.mode = "play";
  Object.assign(B, { x: 0, y: 1.2, z: -P.PZ + 0.05, vx: 0, vy: 0, vz: -3, hitter: 0, need: "done", live: true });
  for (var i = 0; i < 6 && B.hitter === 0; i++) tick(STEP);   // el jugador 1 devuelve: sale el cañonazo
  assert.equal(B.hitter, 1, "el jugador 1 golpeó");
  assert.equal(B.cannon, true, "la pelota va marcada como cañonazo");
  assert.equal(fx.list().length, 0, "el efecto se consume al dispararlo");
  for (i = 0; i < 120 * 3 && S.mode === "play"; i++) {
    if (ready) {
      var p = predict(B.x, B.y, B.z, B.vx, B.vy, B.vz, P.PZ);
      if (p && B.vz > 0) { PL[0].tx = p.x; PL[0].ty = p.y; }
    }
    tick(STEP);
    if (ready && B.hitter === 0) break;
  }
  out.event = function () {};
  out.sound = function (n) { sounds.push(n); };
  return { events: events, snd: snd };
}

test("cañonazo no devuelto: impacto, punto para quien disparó, evento de animación y pausa más larga", function () {
  var r = cannonFrom1(false);
  assert.equal(S.mode, "point");
  assert.deepEqual(S.score, [0, 1]);
  assert.equal(S.msg.why, "cannon");
  assert.deepEqual(r.events, [{ k: "impact", p: 0 }]);
  assert.ok(r.snd.indexOf("impact:0") !== -1, "sonido de impacto");
  assert.ok(S.timer > 1.7 + BALANCE.cannon.pause - 0.05, "pausa alargada: " + S.timer.toFixed(2));
  assert.equal(msgText(S.msg, 0, true), "Punto de la máquina · ¡La máquina te dio un cañonazo!");
  assert.equal(msgText(S.msg, 1, false), "Punto para ti · ¡Cañonazo! Le diste a tu rival");
  fx.clear();
});

test("cañonazo devuelto: no hay impacto y la pelota de vuelta ya no es cañonazo", function () {
  var r = cannonFrom1(true);
  assert.equal(B.hitter, 0, "el jugador 0 lo devolvió");
  assert.equal(B.cannon, false);
  assert.deepEqual(r.events, []);
  fx.clear();
});

test("la animación de impacto es determinista: vuela, cae tendido, se levanta y termina en su sitio", function () {
  var A = BALANCE.impactAnim, end = A.fly + A.lie + A.rise;
  assert.deepEqual(impactPose(0.3), impactPose(0.3), "misma entrada, misma pose");
  assert.equal(impactPose(-0.01), null);
  assert.ok(impactPose(A.fly / 2).y > 0.5, "en el aire a media trayectoria");
  var lying = impactPose(A.fly + A.lie / 2);
  assert.ok(Math.abs(lying.rx + Math.PI / 2) < 1e-9 && lying.z < -1, "tendido detrás de su sitio");
  var last = impactPose(end - 1e-6);
  assert.ok(Math.abs(last.rx) < 1e-3 && Math.abs(last.z) < 1e-3 && Math.abs(last.y) < 1e-3, "de pie en su sitio");
  assert.equal(impactPose(end), null);
  assert.ok(end <= 1.7 + BALANCE.cannon.pause, "cabe en la pausa entre puntos");
});
