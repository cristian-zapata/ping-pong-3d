// Partida en línea. El anfitrión es el jugador 0 y ejecuta toda la física y las reglas; el invitado es el
// jugador 1, solo envía su entrada y dibuja las snapshots que recibe. Solo usa la interfaz de net.js.
//
// Mensajes (JSON):
//   invitado -> anfitrión  rt:  { t:"in", q, x, y, sw }      objetivo de su paleta (mundo) y contador de golpes
//   anfitrión -> invitado  rt:  { t:"st", q, m, sc, sv, msg, b:[x,y,z,vx,vy,vz,viva,golpeador], p:[x0,y0,vx0,sw0,x1,y1,vx1,sw1],
//                                fm: modo de efectos, fx: [[uid, id, dueño, restante], ...],   (solo el anfitrión activa efectos)
//                                ob: orbe [tipo, x, y, z] o null }
//                          ctl: { t:"ev", e, a }              sonidos
//   ambos                  rt:  { t:"ping", ts } / { t:"pong", ts }
//                          ctl: { t:"revancha" } · { t:"adios" }
import * as net from "./net.js";
import { P, integrate, hitsNet, netDeflect, onTable, bounceTable, bounceFloor } from "./physics.js";
import * as fx from "./effects.js";
import { isOrbKind } from "./powerups.js";
import { S, B, PL, out, setControls, newGame, trySwing, moveHuman, toMenu } from "./game.js";
import { clamp } from "./util.js";
import { playSound } from "./audio.js";
import * as ui from "./ui.js";

var SNAP_DT = 1 / 30, INPUT_DT = 1 / 40, PING_DT = 1, TIMEOUT_MS = 6000, MAX_MSGS_PER_S = 150, STEP = 1 / 120;
var MODES = ["serve", "play", "point", "over"], WHY = ["net", "out", "own", "miss"], SOUNDS = ["hit", "bounce", "net", "point", "orb"];

var role = null;            // null | "host" | "guest"
var gen = 0;                // sube en cada intento: descarta resultados de intentos cancelados
var connected = false, code = "";
var lastRecv = 0, rtt = 0, pingAcc = 0, msgCount = 0, msgWindow = 0;
var meReady = false, rivalReady = false;
// anfitrión
var snapQ = 0, snapAcc = 0, lastInQ = -1, lastSw = 0;
// invitado
var inQ = 0, inAcc = 0, swCount = 0, lastSnapQ = -1;
var sim = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, live: false, hitter: 0 }, corr = { x: 0, y: 0, z: 0 };
var p0T = { x: 0, y: 1.05 };

function isNum(v) { return typeof v === "number" && isFinite(v); }
function r4(v) { return Math.round(v * 1e4) / 1e4; }
function now() { return performance.now(); }

net.onMensaje(onMessage);
net.onEvento(function (ev) {
  if (ev === "conectado" && role === "host") begin();
  else if (ev === "desconectado") lost("Tu rival se desconectó", "Salió de la sala o se cortó la conexión.");
});

export function getRole() { return role; }
export function roomCode() { return code; }

function reset() {
  connected = false; code = ""; rtt = 0; pingAcc = 0; msgCount = 0; msgWindow = now();
  meReady = rivalReady = false;
  snapQ = 0; snapAcc = 0; lastInQ = -1; lastSw = 0;
  inQ = 0; inAcc = 0; swCount = 0; lastSnapQ = -1;
  corr.x = corr.y = corr.z = 0;
}

// ---------- Crear / unirse / salir ----------
export function startHost() {
  reset(); role = "host";
  var g = ++gen;
  setControls("local", "remoto", 0); S.online = true;
  ui.showOverlay("connecting", S, "Creando sala…");
  net.crearSala().then(function (c) {
    if (g !== gen) return;
    code = c;
    ui.showOverlay("hosting", S, c);
  }, function (err) { if (g === gen) fail(err.code); });
}

export function startGuest(raw) {
  var c = net.normalizarCodigo(raw);
  if (!net.codigoValido(c)) { ui.setOverlayNote("El código son 4 letras (no se usan I, L ni O)."); return; }
  reset(); role = "guest"; code = c;
  var g = ++gen;
  setControls("remoto", "local", 1); S.online = true;
  ui.showOverlay("connecting", S, "Buscando la sala " + c + "…");
  net.unirse(c).then(function () {
    if (g !== gen) return;
    begin();
    ui.showOverlay("connecting", S, "Conectado. Esperando al anfitrión…");
  }, function (err) { if (g === gen) fail(err.code); });
}

function begin() {
  connected = true; lastRecv = now();
  ui.setOnline(true);
  if (role === "host") newGame();
}

var FAILS = {
  "sin-libreria": ["Sin conexión en línea", "No se pudo cargar la librería de red (PeerJS). Revisa tu conexión o si un bloqueador la está deteniendo."],
  "servidor": ["No se pudo conectar", "No se pudo contactar al servidor de señalización de PeerJS. Puede estar caído o bloqueado en esta red."],
  "sin-codigo": ["No se pudo crear la sala", "No se encontró un código libre. Inténtalo de nuevo."],
  "inexistente": ["Sala inexistente", "No hay ninguna sala abierta con ese código. Revisa las letras o pide uno nuevo."],
  "tiempo": ["Tiempo agotado", "No se pudo establecer la conexión. Puede que esta red bloquee WebRTC."],
  "llena": ["Sala llena", "Esa sala ya tiene dos jugadores."],
  "version": ["Versiones distintas", "Tu rival usa otra versión del juego. Recarguen la página los dos."]
};
function fail(c) {
  var f = FAILS[c] || FAILS.servidor;
  lost(f[0], f[1]);
}

function endOnline() {
  role = null; connected = false; gen++;
  net.cerrar();
  S.online = false;
  fx.clear(); S.orb = null;
  setControls("local", "ia", 0);
  ui.setOnline(false);
}

// Fin inesperado (o error al conectar): mensaje y vuelta al menú.
function lost(title, text) {
  if (!role) return;
  endOnline();
  S.mode = "menu"; B.live = false; S.msg = null; out.msg(null); out.hud();
  ui.showOverlay("neterror", S, { title: title, text: text });
}

// Salida voluntaria: avisa al rival y vuelve al menú.
export function leave() {
  if (!role) return;
  net.enviar({ t: "adios" }, true);
  endOnline();
  toMenu();
}

export function rematch() {
  if (!role || S.mode !== "over") return;
  meReady = true;
  net.enviar({ t: "revancha" }, true);
  ui.setOverlayNote(rivalReady ? "Empezando…" : "Esperando a que tu rival acepte…");
  maybeRematch();
}
function maybeRematch() {
  if (role === "host" && meReady && rivalReady && S.mode === "over") { meReady = rivalReady = false; newGame(); }
}

// ---------- Recepción ----------
function onMessage(m) {
  if (!role || !m || typeof m !== "object") return;
  var t = now();
  if (t - msgWindow > 1000) { msgWindow = t; msgCount = 0; }
  if (++msgCount > MAX_MSGS_PER_S) return;            // límite de tasa: lo que sobra se descarta
  lastRecv = t;

  if (m.t === "ping") { if (isNum(m.ts)) net.enviar({ t: "pong", ts: m.ts }, false); return; }
  if (m.t === "pong") {
    if (isNum(m.ts) && t - m.ts >= 0 && t - m.ts < 10000) { rtt = t - m.ts; ui.setPing(rtt); }
    return;
  }
  if (m.t === "adios") { lost("Tu rival salió de la sala", "La partida terminó."); return; }
  if (m.t === "revancha") {
    if (S.mode === "over") ui.setOverlayNote(meReady ? "Empezando…" : "Tu rival quiere la revancha.");
    rivalReady = true; maybeRematch();
    return;
  }
  if (role === "host" && m.t === "in") hostInput(m);
  else if (role === "guest" && m.t === "st") guestSnapshot(m);
  else if (role === "guest" && m.t === "ev") {
    if (SOUNDS.indexOf(m.e) !== -1) playSound(m.e, isNum(m.a) ? clamp(m.a, 0, 1) : 0, S.me);
  }
}

// El anfitrión nunca confía en el invitado: descarta lo viejo, acota rangos y ignora lo malformado.
function hostInput(m) {
  if (!isNum(m.q) || m.q <= lastInQ) return;            // viejo o repetido (el canal no garantiza orden)
  lastInQ = m.q;
  var p = PL[1];
  if (isNum(m.x) && isNum(m.y)) { p.tx = clamp(m.x, -P.PAD_X, P.PAD_X); p.ty = clamp(m.y, P.PAD_YMIN, P.PAD_YMAX); }
  if (isNum(m.sw) && m.sw > lastSw) { lastSw = m.sw; trySwing(1); }   // un golpe por paquete como máximo
}

function sanitizeMsg(d) {
  if (!d || typeof d !== "object") return null;
  if (d.k === "serve") return { k: "serve", s: d.s === 1 ? 1 : 0 };
  if (d.k === "point") return { k: "point", w: d.w === 1 ? 1 : 0, h: d.h === 1 ? 1 : 0, why: WHY.indexOf(d.why) !== -1 ? d.why : "miss" };
  return null;
}
function numArray(a, n) {
  if (!Array.isArray(a) || a.length !== n) return false;
  for (var i = 0; i < n; i++) if (!isNum(a[i])) return false;
  return true;
}

function guestSnapshot(m) {
  if (!isNum(m.q) || m.q <= lastSnapQ) return;          // descarta snapshots viejas
  if (MODES.indexOf(m.m) === -1 || !numArray(m.b, 8) || !numArray(m.p, 8) || !numArray(m.sc, 2)) return;
  lastSnapQ = m.q;

  var prev = S.mode, hud = prev !== m.m || S.score[0] !== m.sc[0] || S.score[1] !== m.sc[1] || S.server !== m.sv;
  S.score[0] = Math.max(0, Math.floor(m.sc[0])); S.score[1] = Math.max(0, Math.floor(m.sc[1]));
  S.server = m.sv === 1 ? 1 : 0;
  S.mode = m.m;

  // Efectos: el invitado solo carga lo que decide el anfitrión (recalcula P/PP para dibujar y extrapolar).
  if (fx.MODES[m.fm]) S.fxMode = m.fm;
  fx.load(m.fx);
  S.orb = Array.isArray(m.ob) && m.ob.length === 4 && isOrbKind(m.ob[0]) && numArray(m.ob.slice(1), 3)
    ? { kind: m.ob[0], x: clamp(m.ob[1], -2, 2), y: clamp(m.ob[2], 0, 3), z: clamp(m.ob[3], -2, 2), life: 1 } : null;

  var d = sanitizeMsg(m.msg);
  if (JSON.stringify(d) !== JSON.stringify(S.msg)) { S.msg = d; out.msg(d); }

  if (prev !== "over" && S.mode === "over") {
    var won = S.score[S.me] > S.score[1 - S.me];
    if (won) S.wins++; else S.losses++;
    out.hud();
    out.overlay("over", won);
    if (rivalReady) ui.setOverlayNote("Tu rival quiere la revancha.");
  } else if (S.mode !== "over" && (prev === "over" || prev === "menu")) {
    out.overlay(null);                                   // empezó la partida o la revancha
    meReady = rivalReady = false;
  }
  if (hud) out.hud();

  var p = m.p, p0 = PL[0];
  p0T.x = clamp(p[0], -1.6, 1.6); p0T.y = clamp(p[1], 0.4, 2.1);
  p0.vx = clamp(p[2], -20, 20); p0.swing = clamp(p[3], 0, 0.25);
  if (prev === "menu") { p0.x = p0T.x; p0.y = p0T.y; }

  setBall(m.b);
}

// ---------- Pelota del invitado: última snapshot + extrapolación con la misma física ----------
function stepSim(b, h) {
  var ox = b.x, oy = b.y, oz = b.z;
  integrate(b, h);
  if (!b.live) { bounceFloor(b); return; }
  if (hitsNet(ox, oy, oz, b)) netDeflect(b, oz);
  else if (onTable(b)) bounceTable(b);
}

function setBall(a) {
  var nb = { x: a[0], y: a[1], z: a[2], vx: a[3], vy: a[4], vz: a[5], live: a[6] === 1, hitter: a[7] === 1 ? 1 : 0 };
  if (S.mode !== "serve") {
    // La snapshot llega con ~medio ping de retraso: se adelanta ese tiempo.
    var n = Math.round(clamp(rtt / 2000, 0, 0.12) / STEP);
    for (var i = 0; i < n; i++) stepSim(nb, STEP);
  }
  // Si es el mismo vuelo, se suaviza la diferencia con lo que ya se dibujaba; si hubo golpe o punto, se salta.
  var same = S.mode !== "serve" && sim.live === nb.live && sim.hitter === nb.hitter;
  corr.x = B.x - nb.x; corr.y = B.y - nb.y; corr.z = B.z - nb.z;
  if (!same || corr.x * corr.x + corr.y * corr.y + corr.z * corr.z > 0.25) corr.x = corr.y = corr.z = 0;
  sim.x = nb.x; sim.y = nb.y; sim.z = nb.z; sim.vx = nb.vx; sim.vy = nb.vy; sim.vz = nb.vz;
  sim.live = nb.live; sim.hitter = nb.hitter;
}

// Paso fijo del invitado (en lugar de game.tick).
export function guestStep(h) {
  moveHuman(PL[1], h);                                   // la paleta propia responde al instante

  var p0 = PL[0], k = Math.min(1, h * 25);
  p0.x += (p0T.x - p0.x) * k; p0.y += (p0T.y - p0.y) * k;
  p0.swing = Math.max(0, p0.swing - h);

  if (S.mode === "serve") {
    // Pelota en la mano de quien saca; si saco yo, sigue a mi paleta local.
    if (S.server === 1) { B.x = PL[1].x; B.y = P.SERVE_Y; B.z = -P.SERVE_Z; }
    else { B.x = sim.x; B.y = sim.y; B.z = sim.z; }
    B.vx = B.vy = B.vz = 0; B.live = false;
    return;
  }
  stepSim(sim, h);
  var decay = Math.exp(-h * 15);
  corr.x *= decay; corr.y *= decay; corr.z *= decay;
  B.x = sim.x + corr.x; B.y = sim.y + corr.y; B.z = sim.z + corr.z;
  B.vx = sim.vx; B.vy = sim.vy; B.vz = sim.vz; B.live = sim.live; B.hitter = sim.hitter;
}

// Clic/espacio del invitado: se cuenta y se envía ya; la animación es local e inmediata.
export function guestSwing() {
  swCount++;
  sendInput();
  var pl = PL[1];
  if (S.mode === "play" && pl.cd <= 0) { pl.swing = 0.25; pl.cd = 0.4; }
  else if (S.mode === "serve" && S.server === 1) pl.swing = 0.25;
}

function sendInput() {
  var p = PL[1];
  net.enviar({ t: "in", q: ++inQ, x: r4(p.tx), y: r4(p.ty), sw: swCount }, false);
}

function sendSnapshot() {
  var a = PL[0], b = PL[1];
  net.enviar({
    t: "st", q: ++snapQ, m: S.mode, sc: [S.score[0], S.score[1]], sv: S.server, msg: S.msg, fm: S.fxMode, fx: fx.snapshot(),
    ob: S.orb ? [S.orb.kind, r4(S.orb.x), r4(S.orb.y), r4(S.orb.z)] : null,
    b: [r4(B.x), r4(B.y), r4(B.z), r4(B.vx), r4(B.vy), r4(B.vz), B.live ? 1 : 0, B.hitter],
    p: [r4(a.x), r4(a.y), r4(a.vx), r4(a.swing), r4(b.x), r4(b.y), r4(b.vx), r4(b.swing)]
  }, false);
}

// Sonidos del anfitrión: se reenvían al invitado por el canal fiable.
export function onSound(name, arg) {
  if (role === "host" && connected) net.enviar({ t: "ev", e: name, a: arg }, true);
}

// Cada fotograma: envíos periódicos y detección de silencio.
export function update(dt) {
  if (!role || !connected) return;
  if (role === "host") {
    snapAcc += dt;
    if (snapAcc >= SNAP_DT) { snapAcc = Math.min(snapAcc - SNAP_DT, SNAP_DT); sendSnapshot(); }
  } else {
    inAcc += dt;
    if (inAcc >= INPUT_DT) { inAcc = Math.min(inAcc - INPUT_DT, INPUT_DT); sendInput(); }
  }
  pingAcc += dt;
  if (pingAcc >= PING_DT) { pingAcc = 0; net.enviar({ t: "ping", ts: now() }, false); }
  if (now() - lastRecv > TIMEOUT_MS) lost("Se perdió la conexión", "No llegan datos de tu rival desde hace varios segundos.");
}
