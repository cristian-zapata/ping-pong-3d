// Estado de la partida, reglas, golpes, saque y puntos.
// Dos jugadores simétricos: PL[0] juega en z > 0 y PL[1] en z < 0. Cada uno tiene un control:
// "local" (este navegador), "ia" (la máquina) o "remoto" (entrada que llega por la red).
// No depende del DOM ni del audio: avisa mediante `out` (lo conecta main.js).
// Los parámetros salen de P (mundo/mesa) y PP[i] (jugador), que recalcula effects.js.
import {
  P, launchTo, serveVel, integrate, hitsNet, netDeflect, onTable, bounceTable, crossPlane, bounceFloor, isOut
} from "./physics.js";
import { clamp, rnd } from "./util.js";
import { aiNewPoint, aiOnOpponentHit, aiShot, aiServeX, updateAI } from "./ai.js";
import * as fx from "./effects.js";
import { ORB, orbStep, orbTouched } from "./powerups.js";
import { EVT, maybeEvent } from "./events.js";

// ---------- Estado ----------
// me: índice del jugador que ve esta pantalla. msg: descriptor del mensaje actual (ver texts.js).
// online: partida en línea (sin pausa). fxMode: modo de efectos ("off" | "powerups" | "events" | "all").
// lock: segundos en que no se puede sacar porque la mesa acaba de cambiar (dura lo que su animación).
// orb: orbe de power-up flotando (null o { kind, x, y, z, life }); orbWait: s hasta que pueda aparecer otro.
// evWait: puntos hasta que pueda empezar un evento de mesa. myName / rivalName: nombres en línea.
export var S = { mode: "menu", prev: null, diff: "medio", score: [0, 0], me: 0, base: 0, server: 0, timer: 0,
                 pending: null, wins: 0, losses: 0, guide: true, msg: null, online: false, fxMode: "off", lock: 0,
                 orb: null, orbWait: 0, evWait: 0, myName: "", rivalName: "" };
export var TABLE_ANIM = fx.TABLE_ANIM;
export var B = { x: 0, y: 1, z: 1.45, vx: 0, vy: 0, vz: 0, hitter: 0, need: "opp", live: false };

function makePlayer(i, ctrl) {
  return { i: i, side: i === 0 ? 1 : -1, ctrl: ctrl,
           tx: 0, ty: 1.05, x: 0, y: 1.05, vx: 0, swing: 0, cd: 0, err: 0, react: 0 };
}
export var PL = [makePlayer(0, "local"), makePlayer(1, "ia")];

export var out = {
  msg: function () {},        // msg(descriptor | null)
  hud: function () {},        // hud()
  overlay: function () {},    // overlay(tipo, gano) · overlay(null) la oculta
  sound: function () {},      // sound("hit", potencia) · ("bounce") · ("net") · ("point", ganador) · ("orb")
  notice: function () {}      // notice({ k: "fx-on" | "fx-off", id, o }) al empezar o terminar un efecto
};
fx.onNotice(function (ev) { out.notice(ev); });

export function setControls(c0, c1, me) { PL[0].ctrl = c0; PL[1].ctrl = c1; S.me = me; }

function say(d) { S.msg = d; out.msg(d); }

// Índice del jugador dueño del lado de la mesa en z.
function sideOf(z) { return z > 0 ? 0 : 1; }

// ---------- Reglas ----------
function serverFor(total) {
  var idx = total < 20 ? Math.floor(total / 2) : 10 + (total - 20);
  return (S.base + idx) % 2;
}

// w: ganador del punto; h: quien golpeó por última vez; why: "net" | "out" | "own" | "miss".
function pointTo(w, h, why) {
  if (S.mode !== "play") return;
  S.score[w]++;
  out.sound("point", w);
  say({ k: "point", w: w, h: h, why: why });
  var p = S.score[0], a = S.score[1];
  S.pending = ((p >= 11 || a >= 11) && Math.abs(p - a) >= 2) ? "over" : null;
  S.mode = "point"; S.timer = 1.7;
  B.live = false;
  out.hud();
}
function fault(h, kind) { pointTo(1 - h, h, kind); }
function receiverMissed(h) { pointTo(h, h, "miss"); }

// s: índice del jugador en cuyo lado botó. Devuelve true si el punto terminó con este bote.
function onBounce(s) {
  var h = B.hitter;
  if (B.need === "own") { if (s === h) { B.need = "opp"; return false; } fault(h, "own"); return true; }
  if (B.need === "opp") { if (s !== h) { B.need = "done"; return false; } fault(h, "own"); return true; }
  if (B.need === "done") { if (s !== h) { receiverMissed(h); return true; } }
  return false;
}

export function newGame() {
  S.score[0] = 0; S.score[1] = 0; S.pending = null;
  fx.clear();
  S.orb = null; S.orbWait = ORB.FIRST; S.evWait = EVT.FIRST;
  S.base = 1 - S.base;
  out.overlay(null);
  startPoint();
}

function startPoint() {
  S.server = serverFor(S.score[0] + S.score[1]);
  S.mode = "serve";
  S.timer = 1.3;
  B.live = false; B.vx = B.vy = B.vz = 0; B.need = "opp";
  var ver = fx.FX.tableVer;
  if (fx.allowedIn({ cat: "event" }, S.fxMode)) maybeEvent(S, giveEffect);   // quizá empieza un evento de mesa
  fx.onPoint();                      // entre puntos: caducan/empiezan los efectos que duran puntos
  S.lock = fx.FX.tableVer !== ver ? TABLE_ANIM : 0;   // si cambió la mesa, nadie saca hasta que acabe su animación
  PL.forEach(function (pl) { if (pl.ctrl === "ia") aiNewPoint(pl, S.diff); });
  say({ k: "serve", s: S.server });
  out.hud();
}

function endGame() {
  S.mode = "over";
  var won = S.score[S.me] > S.score[1 - S.me];
  if (won) S.wins++; else S.losses++;
  say(null);
  out.hud();
  out.overlay("over", won);
}

export function togglePause() {
  if (S.online) return;              // en línea no hay pausa
  if (S.mode === "paused") { out.overlay(null); S.mode = S.prev || "serve"; }
  else if (S.mode === "play" || S.mode === "serve" || S.mode === "point") { S.prev = S.mode; S.mode = "paused"; out.overlay("pause"); }
}

export function toMenu() {
  S.mode = "menu"; B.live = false; fx.clear(); S.orb = null; say(null); out.hud(); out.overlay("menu");
}

export function setDiff(d) { S.diff = d; out.overlay("menu"); }
export function setFxMode(m) { if (fx.MODES[m]) S.fxMode = m; out.overlay("menu"); }

// Activa un efecto (solo quien ejecuta las reglas: modo local o anfitrión), si el modo de partida lo permite.
// owner: jugador 0 | 1 (efectos de jugador) o -1 (globales y de mesa). Devuelve "on", "pending" o null.
export function giveEffect(id, owner) {
  if (S.online && S.me !== 0) return null;          // en línea solo el anfitrión (jugador 0) activa efectos
  var def = fx.getDef(id);
  if (!def || !fx.allowedIn(def, S.fxMode)) return null;
  return fx.apply(id, owner);
}

// ---------- Golpes ----------
function launchBall(x, y, z, Tx, Tz, tDes, hitter) {
  var y0 = Math.max(y, P.HIT_YMIN);
  var v = launchTo(x, y0, z, Tx, Tz, tDes);
  B.x = x; B.y = y0; B.z = z; B.vx = v.vx; B.vy = v.vy; B.vz = v.vz;
  B.hitter = hitter; B.need = "opp"; B.live = true;
}

// El jugador i devuelve la pelota que cruzó su plano de golpeo en (xx, yy).
function hit(i, xx, yy) {
  var pl = PL[i], s = pl.side, opp = PL[1 - i], power, tx, tz;
  if (pl.ctrl === "ia") {
    var shot = aiShot(pl, S.diff, opp.x, xx, S.orb);
    power = shot.power; tx = shot.tx; tz = shot.tz;
  } else {
    // Golpe humano, calculado en el marco de quien golpea (x' = s·x, z' = s·z):
    // la dirección sale del movimiento de la paleta y de dónde tocó la pelota.
    power = pl.swing > 0 ? 1 : 0.35;
    var n = 0.28 * power * power;
    tx = s * (clamp(s * pl.vx * 0.16 + s * (xx - pl.x) * 3.5, -P.AIM_X, P.AIM_X) + rnd() * n);
    tz = s * (-(P.DEPTH_MIN + P.DEPTH_RANGE * power) + rnd() * n);
  }
  launchBall(xx, yy, s * P.PZ, tx, tz, (P.T_BASE - P.T_POWER * power) * fx.PP[i].shotTime, i);
  out.sound("hit", power);
  fx.onHit(i);
  if (opp.ctrl === "ia") aiOnOpponentHit(opp, S.diff);
}

function doServe(i) {
  var pl = PL[i];
  var x0 = clamp(B.x, -P.SERVE_X0, P.SERVE_X0), y0 = B.y, bx;
  if (pl.ctrl === "ia") bx = aiServeX();
  else bx = clamp(x0 * 0.4 + pl.vx * 0.1, -P.SERVE_X2, P.SERVE_X2);
  var sv = serveVel(pl.side, x0, y0, bx);
  B.x = sv.x; B.y = sv.y; B.z = sv.z; B.vx = sv.vx; B.vy = sv.vy; B.vz = sv.vz;
  B.hitter = i;
  B.need = "own"; B.live = true;
  S.mode = "play";
  say(null);
  pl.swing = 0.25;
  out.sound("hit", 0.4);
}

// El jugador i hizo pasar la pelota por el orbe: lo recoge. El efecto va a él o a su rival según el power-up.
function collectOrb(i) {
  var kind = S.orb.kind, def = fx.getDef(kind);
  S.orb = null; S.orbWait = ORB.GAP;
  out.sound("orb");
  giveEffect(kind, def.target === "rival" ? 1 - i : i);
}

// Clic/espacio del jugador i (local o remoto): saca si le toca, si no inicia un golpe fuerte.
export function trySwing(i) {
  var pl = PL[i];
  if (pl.ctrl === "ia") return;
  if (S.mode === "serve" && S.server === i && !B.live) { if (S.lock <= 0) doServe(i); return; }
  if (S.mode === "play" && pl.cd <= 0) { pl.swing = 0.25; pl.cd = 0.4; }
}

// ---------- Física de la pelota ----------
function stepBall(h) {
  var b = B, ox = b.x, oy = b.y, oz = b.z;
  integrate(b, h);

  if (!b.live) { bounceFloor(b); return; }   // pelota libre tras el punto

  if (hitsNet(ox, oy, oz, b)) {
    netDeflect(b, oz);
    out.sound("net");
    fault(b.hitter, "net");
    return;
  }

  if (onTable(b)) {
    bounceTable(b);
    out.sound("bounce");
    if (onBounce(sideOf(b.z))) return;
  }

  // orbe: lo recoge quien golpeó la pelota que pasa por él (no la desvía)
  if (S.orb && orbTouched(S.orb, ox, oy, oz, b)) collectOrb(b.hitter);

  // paleta del receptor (solo cuando ya botó en su lado)
  if (b.need === "done") {
    var r = PL[1 - b.hitter], c = crossPlane(ox, oy, oz, b, r.side * P.PZ), reach = reachOf(r.i);
    if (c && Math.abs(c.x - r.x) <= reach && Math.abs(c.y - r.y) <= reach) { hit(r.i, c.x, c.y); return; }
  }

  if (isOut(b)) {
    if (b.need === "done") receiverMissed(b.hitter); else fault(b.hitter, "out");
  }
}

// Alcance efectivo de la paleta del jugador i.
export function reachOf(i) { return P.REACH * fx.PP[i].reachMul; }

// ---------- Bucle lógico ----------
// Paleta de un jugador humano: sigue a su objetivo (tx, ty), que fija input.js o la red.
// Si un efecto limita su velocidad (PP.speedCap), el paso se acota a esa velocidad.
export function moveHuman(pl, h) {
  var ox = pl.x, cap = fx.PP[pl.i].speedCap;
  var k = Math.min(1, h * 70);
  if (cap === Infinity) {
    pl.x += (pl.tx - pl.x) * k;
    pl.y += (pl.ty - pl.y) * k;
  } else {
    var m = cap * h;
    pl.x += clamp((pl.tx - pl.x) * k, -m, m);
    pl.y += clamp((pl.ty - pl.y) * k, -m, m);
  }
  pl.vx += (((pl.x - ox) / h) - pl.vx) * Math.min(1, h * 20);
  pl.swing = Math.max(0, pl.swing - h);
  pl.cd = Math.max(0, pl.cd - h);
}

export function tick(h) {
  PL.forEach(function (pl) { if (pl.ctrl !== "ia") moveHuman(pl, h); });
  if (S.mode === "serve" || S.mode === "play" || S.mode === "point") {
    PL.forEach(function (pl) { if (pl.ctrl === "ia") updateAI(pl, h, S, B); });
    fx.onSeconds(h);
    if (fx.allowedIn({ cat: "powerup" }, S.fxMode)) orbStep(S, h);
  }

  if (S.mode === "serve") {
    var sp = PL[S.server];
    if (S.lock > 0) S.lock = Math.max(0, S.lock - h);
    B.live = false;
    B.x = sp.x;
    B.y = P.SERVE_Y;
    B.z = sp.side * P.SERVE_Z;
    if (sp.ctrl === "ia") { S.timer -= h; if (S.timer <= 0 && S.lock <= 0) doServe(S.server); }
  } else if (S.mode === "play") {
    stepBall(h);
  } else if (S.mode === "point") {
    stepBall(h);
    S.timer -= h;
    if (S.timer <= 0) { if (S.pending === "over") endGame(); else startPoint(); }
  }
}
