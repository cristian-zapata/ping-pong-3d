// Estado de la partida, reglas, golpes, saque y puntos.
// Dos jugadores simétricos: PL[0] juega en z > 0 y PL[1] en z < 0. Cada uno tiene un control:
// "local" (este navegador), "ia" (la máquina) o "remoto" (entrada que llega por la red).
// No depende del DOM ni del audio: avisa mediante `out` (lo conecta main.js).
import {
  PZ, REACH, SERVE_Y, SERVE_Z, launchTo, serveVel,
  integrate, hitsNet, netDeflect, onTable, bounceTable, crossPlane, bounceFloor, isOut
} from "./physics.js";
import { clamp, rnd } from "./util.js";
import { aiNewPoint, aiOnOpponentHit, aiShot, aiServeX, updateAI } from "./ai.js";

// ---------- Estado ----------
// me: índice del jugador que ve esta pantalla. msg: descriptor del mensaje actual (ver texts.js).
// online: partida en línea (sin pausa).
export var S = { mode: "menu", prev: null, diff: "medio", score: [0, 0], me: 0, base: 0, server: 0, timer: 0,
                 pending: null, wins: 0, losses: 0, guide: true, msg: null, online: false };
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
  sound: function () {}       // sound("hit", potencia) · ("bounce") · ("net") · ("point", ganador)
};

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
  S.base = 1 - S.base;
  out.overlay(null);
  startPoint();
}

function startPoint() {
  S.server = serverFor(S.score[0] + S.score[1]);
  S.mode = "serve";
  S.timer = 1.3;
  B.live = false; B.vx = B.vy = B.vz = 0; B.need = "opp";
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
  S.mode = "menu"; B.live = false; say(null); out.hud(); out.overlay("menu");
}

export function setDiff(d) { S.diff = d; out.overlay("menu"); }

// ---------- Golpes ----------
function launchBall(x, y, z, Tx, Tz, tDes, hitter) {
  var y0 = Math.max(y, 0.95);
  var v = launchTo(x, y0, z, Tx, Tz, tDes);
  B.x = x; B.y = y0; B.z = z; B.vx = v.vx; B.vy = v.vy; B.vz = v.vz;
  B.hitter = hitter; B.need = "opp"; B.live = true;
}

// El jugador i devuelve la pelota que cruzó su plano de golpeo en (xx, yy).
function hit(i, xx, yy) {
  var pl = PL[i], s = pl.side, opp = PL[1 - i], power, tx, tz;
  if (pl.ctrl === "ia") {
    var shot = aiShot(pl, S.diff, opp.x);
    power = shot.power; tx = shot.tx; tz = shot.tz;
  } else {
    // Golpe humano, calculado en el marco de quien golpea (x' = s·x, z' = s·z):
    // la dirección sale del movimiento de la paleta y de dónde tocó la pelota.
    power = pl.swing > 0 ? 1 : 0.35;
    var n = 0.28 * power * power;
    tx = s * (clamp(s * pl.vx * 0.16 + s * (xx - pl.x) * 3.5, -0.65, 0.65) + rnd() * n);
    tz = s * (-(0.55 + 0.55 * power) + rnd() * n);
  }
  launchBall(xx, yy, s * PZ, tx, tz, 0.9 - 0.45 * power, i);
  out.sound("hit", power);
  if (opp.ctrl === "ia") aiOnOpponentHit(opp, S.diff);
}

function doServe(i) {
  var pl = PL[i];
  var x0 = clamp(B.x, -0.6, 0.6), y0 = B.y, bx;
  if (pl.ctrl === "ia") bx = aiServeX();
  else bx = clamp(x0 * 0.4 + pl.vx * 0.1, -0.5, 0.5);
  var sv = serveVel(pl.side, x0, y0, bx);
  B.x = sv.x; B.y = sv.y; B.z = sv.z; B.vx = sv.vx; B.vy = sv.vy; B.vz = sv.vz;
  B.hitter = i;
  B.need = "own"; B.live = true;
  S.mode = "play";
  say(null);
  pl.swing = 0.25;
  out.sound("hit", 0.4);
}

// Clic/espacio del jugador i (local o remoto): saca si le toca, si no inicia un golpe fuerte.
export function trySwing(i) {
  var pl = PL[i];
  if (pl.ctrl === "ia") return;
  if (S.mode === "serve" && S.server === i && !B.live) { doServe(i); return; }
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

  // paleta del receptor (solo cuando ya botó en su lado)
  if (b.need === "done") {
    var r = PL[1 - b.hitter], c = crossPlane(ox, oy, oz, b, r.side * PZ);
    if (c && Math.abs(c.x - r.x) <= REACH && Math.abs(c.y - r.y) <= REACH) { hit(r.i, c.x, c.y); return; }
  }

  if (isOut(b)) {
    if (b.need === "done") receiverMissed(b.hitter); else fault(b.hitter, "out");
  }
}

// ---------- Bucle lógico ----------
// Paleta de un jugador humano: sigue a su objetivo (tx, ty), que fija input.js o la red.
export function moveHuman(pl, h) {
  var ox = pl.x;
  var k = Math.min(1, h * 70);
  pl.x += (pl.tx - pl.x) * k;
  pl.y += (pl.ty - pl.y) * k;
  pl.vx += (((pl.x - ox) / h) - pl.vx) * Math.min(1, h * 20);
  pl.swing = Math.max(0, pl.swing - h);
  pl.cd = Math.max(0, pl.cd - h);
}

export function tick(h) {
  PL.forEach(function (pl) { if (pl.ctrl !== "ia") moveHuman(pl, h); });
  if (S.mode === "serve" || S.mode === "play" || S.mode === "point") {
    PL.forEach(function (pl) { if (pl.ctrl === "ia") updateAI(pl, h, S, B); });
  }

  if (S.mode === "serve") {
    var sp = PL[S.server];
    B.live = false;
    B.x = sp.x;
    B.y = SERVE_Y;
    B.z = sp.side * SERVE_Z;
    if (sp.ctrl === "ia") { S.timer -= h; if (S.timer <= 0) doServe(S.server); }
  } else if (S.mode === "play") {
    stepBall(h);
  } else if (S.mode === "point") {
    stepBall(h);
    S.timer -= h;
    if (S.timer <= 0) { if (S.pending === "over") endGame(); else startPoint(); }
  }
}
