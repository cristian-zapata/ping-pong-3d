// Sistema de efectos: registro, efectos activos (de jugador, globales y de mesa), duración en golpes,
// segundos o puntos, y cálculo de los parámetros efectivos: P (mundo/mesa, en physics.js) y PP[i] (por jugador).
// Sin DOM: avisa de cada efecto que empieza o termina mediante onNotice.
//
// Definición de un efecto (register):
//   id     identificador corto (viaja en las snapshots)
//   name, icon, color   para la interfaz
//   cat    "powerup" | "event"            (lo filtra el modo de partida)
//   scope  "player" | "global" | "table"  (player: modifica PP del dueño; global/table: modifica P)
//   unit   "hits" | "seconds" | "points";  n: cuánto dura en esa unidad
//   mod(p) cambia los parámetros: recibe PP del dueño (player) o una copia de P (global/table)
//
// Reglas de duración:
//   seconds  baja con el tiempo de juego (no en pausa ni en el menú).
//   hits     baja con cada devolución del dueño (efectos globales: con cualquier devolución). El saque no cuenta.
//   points   empieza al comenzar el siguiente punto y baja al comenzar cada punto posterior.
//            Los efectos de mesa DEBEN durar puntos: así solo cambian entre puntos, nunca con la pelota en juego.
import { P, DEFAULTS, resetParams, setParams } from "./physics.js";
import { BALANCE } from "./balance.js";

export var PLAYER_DEFAULTS = Object.freeze({
  reachMul: 1,          // multiplica P.REACH (alcance de la paleta)
  shotTime: 1,          // multiplica el tiempo de vuelo de sus devoluciones (< 1: más rápidas)
  speedCap: Infinity    // velocidad máxima de su paleta en m/s
});
export var PP = [Object.assign({}, PLAYER_DEFAULTS), Object.assign({}, PLAYER_DEFAULTS)];

export var MODES = {
  off: { label: "Sin efectos" },
  powerups: { label: "Solo power-ups" },
  events: { label: "Solo eventos" },
  all: { label: "Todo" }
};

var REG = {};
var active = [];      // { uid, id, owner (0 | 1 | -1 global/mesa), left }
var pending = [];     // { id, owner } que esperan al siguiente punto
var uid = 0;
var notice = function () {};
var TABLE_KEYS = ["TOPY", "HW", "HL", "NET_H", "NETW"];
var tableSig = "";
export var FX = { tableVer: 0 };   // sube cuando cambia la geometría de la mesa (render la reconstruye)
export var TABLE_ANIM = BALANCE.tableAnim;   // s de la animación de cambio de mesa (y en los que no se puede sacar)

export function onNotice(fn) { notice = fn; }

export function register(def) {
  if (!def || !def.id || !/^[a-z0-9_]{1,16}$/.test(def.id)) throw new Error("efecto sin id válido");
  if (["powerup", "event"].indexOf(def.cat) === -1) throw new Error(def.id + ": cat inválida");
  if (["player", "global", "table"].indexOf(def.scope) === -1) throw new Error(def.id + ": scope inválido");
  if (["hits", "seconds", "points"].indexOf(def.unit) === -1 || !(def.n > 0)) throw new Error(def.id + ": duración inválida");
  if (def.scope === "table" && def.unit !== "points") throw new Error(def.id + ": un efecto de mesa debe durar puntos");
  if (typeof def.mod !== "function") throw new Error(def.id + ": falta mod()");
  REG[def.id] = def;
}
export function unregister(id) { delete REG[id]; }
export function registeredIds() { return Object.keys(REG); }
export function getDef(id) { return Object.prototype.hasOwnProperty.call(REG, id) ? REG[id] : null; }
export function allowedIn(def, mode) {
  return mode === "all" || (mode === "powerups" && def.cat === "powerup") || (mode === "events" && def.cat === "event");
}

export function list() { return active; }
export function pendingList() { return pending; }
// ¿Hay un efecto de mesa activo o esperando al siguiente punto?
export function tableBusy() {
  var isTable = function (e) { var d = getDef(e.id); return d && d.scope === "table"; };
  return active.some(isTable) || pending.some(isTable);
}

// Activa un efecto. owner: 0 | 1 para efectos de jugador, -1 para globales y de mesa.
// Los que duran puntos quedan pendientes hasta el siguiente punto. Devuelve "on", "pending" o null.
export function apply(id, owner) {
  var def = getDef(id);
  if (!def) return null;
  owner = def.scope === "player" ? (owner === 1 ? 1 : 0) : -1;
  if (def.unit === "points") {
    if (!pending.some(function (p) { return p.id === id && p.owner === owner; })) pending.push({ id: id, owner: owner });
    return "pending";
  }
  activate(def, owner);
  return "on";
}

function activate(def, owner) {
  for (var i = 0; i < active.length; i++) {
    if (active[i].id === def.id && active[i].owner === owner) { active[i].left = def.n; return; }   // se renueva
  }
  active.push({ uid: ++uid, id: def.id, owner: owner, left: def.n });
  recompute();
  notice({ k: "fx-on", id: def.id, o: owner });
}

function expire(test) {
  var gone = [];
  active = active.filter(function (e) { if (test(e)) { gone.push(e); return false; } return true; });
  if (!gone.length) return;
  recompute();
  gone.forEach(function (e) { notice({ k: "fx-off", id: e.id, o: e.owner }); });
}

export function remove(u) { expire(function (e) { return e.uid === u; }); }

// Quita todo sin avisar (nueva partida, menú, desconexión).
export function clear() { active = []; pending = []; recompute(); }

export function onSeconds(h) {
  var any = false;
  active.forEach(function (e) { if (getDef(e.id).unit === "seconds") { e.left -= h; any = true; } });
  if (any) expire(function (e) { return getDef(e.id).unit === "seconds" && e.left <= 1e-9; });
}

// Tras cada devolución del jugador i (después de lanzar la pelota con sus parámetros).
export function onHit(i) {
  active.forEach(function (e) { if (getDef(e.id).unit === "hits" && (e.owner === i || e.owner === -1)) e.left -= 1; });
  expire(function (e) { return getDef(e.id).unit === "hits" && e.left <= 0; });
}

// Al comenzar cada punto (entre puntos): baja los que duran puntos y activa los pendientes.
export function onPoint() {
  active.forEach(function (e) { if (getDef(e.id).unit === "points") e.left -= 1; });
  expire(function (e) { return getDef(e.id).unit === "points" && e.left <= 0; });
  var q = pending; pending = [];
  q.forEach(function (p) { var def = getDef(p.id); if (def) activate(def, p.owner); });
}

// Recalcula P y PP desde los valores por defecto y los efectos activos (en orden de activación, así se componen).
// Los efectos globales/de mesa modifican una copia que luego pasa por setParams, que recalcula los derivados.
export function recompute() {
  resetParams();
  var world = active.filter(function (e) { return getDef(e.id).scope !== "player"; });
  if (world.length) {
    var cur = {}, k;
    for (k in DEFAULTS) cur[k] = P[k];
    world.forEach(function (e) { getDef(e.id).mod(cur); });
    setParams(cur);
  }
  for (var i = 0; i < 2; i++) {
    for (k in PLAYER_DEFAULTS) PP[i][k] = PLAYER_DEFAULTS[k];
  }
  active.forEach(function (e) { var def = getDef(e.id); if (def.scope === "player") def.mod(PP[e.owner]); });
  var sig = TABLE_KEYS.map(function (key) { return P[key]; }).join(",");
  if (sig !== tableSig) { tableSig = sig; FX.tableVer++; }
}

// ---------- Red: el anfitrión envía la lista; el invitado la carga y solo la dibuja ----------
export function snapshot() {
  return active.map(function (e) { return [e.uid, e.id, e.owner, Math.round(e.left * 100) / 100]; });
}

// Reemplaza los efectos activos por los recibidos (descarta lo desconocido o malformado) y avisa de altas y bajas.
export function load(arr) {
  if (!Array.isArray(arr)) return;
  var next = [];
  arr.slice(0, 32).forEach(function (a) {
    if (!Array.isArray(a) || a.length !== 4) return;
    var def = getDef(a[1]);
    if (!def || typeof a[0] !== "number" || typeof a[3] !== "number" || !isFinite(a[3])) return;
    var owner = def.scope === "player" ? (a[2] === 1 ? 1 : 0) : -1;
    next.push({ uid: a[0], id: def.id, owner: owner, left: Math.max(0, a[3]) });
  });
  var before = active;
  active = next;
  var gone = before.filter(function (e) { return !next.some(function (n) { return n.uid === e.uid; }); });
  var added = next.filter(function (n) { return !before.some(function (e) { return e.uid === n.uid; }); });
  if (gone.length || added.length) recompute();
  gone.forEach(function (e) { notice({ k: "fx-off", id: e.id, o: e.owner }); });
  added.forEach(function (e) { notice({ k: "fx-on", id: e.id, o: e.owner }); });
}

recompute();
