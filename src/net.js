// Transporte P2P con PeerJS (global window.Peer, cargado en index.html). Es lo único que conoce PeerJS:
// el resto del juego usa esta interfaz, así que el transporte se puede cambiar sin tocar la lógica.
//
//   crearSala()      -> Promise<código>   (anfitrión; avisa "conectado" cuando entra el invitado)
//   unirse(código)   -> Promise<void>     (invitado; rechaza con Error cuyo .code es el motivo)
//   enviar(msg, fiable)                   (fiable: canal ordenado y fiable; si no, canal desordenado)
//   onMensaje(fn)    fn(msg)
//   onEvento(fn)     fn("conectado") · fn("desconectado")
//   cerrar()
//
// Se abren dos canales por partida: "ctl" (fiable: saludo, sonidos, revancha, salida) y
// "rt" (no fiable y sin orden: entrada y snapshots; lo viejo se descarta por número de secuencia).
// Nota: PeerJS 1.5.5 crea el canal "no fiable" con ordered:false pero sin maxRetransmits, así que
// todavía retransmite; lo que se evita es que un paquete perdido bloquee a los siguientes.

var PREFIX = "ppn3d-v1-";                       // prefijo propio para no chocar con otros IDs del servidor público
var ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";       // sin I, L ni O (ni dígitos): nada ambiguo
var PROTO = 2;                                  // versión del protocolo; anfitrión e invitado deben coincidir (2: efectos)
var JOIN_TIMEOUT = 12000;

var peer = null, ctl = null, rt = null, guestId = null;
var onMsg = function () {}, onEv = function () {};

export function onMensaje(fn) { onMsg = fn; }
export function onEvento(fn) { onEv = fn; }

export function disponible() { return typeof window.Peer === "function"; }

export function normalizarCodigo(s) { return String(s || "").trim().toUpperCase(); }
export function codigoValido(c) { return new RegExp("^[" + ALPHABET + "]{4}$").test(c); }

function nuevoCodigo() {
  var a = new Uint32Array(4), c = "", i;
  crypto.getRandomValues(a);
  for (i = 0; i < 4; i++) c += ALPHABET[a[i] % ALPHABET.length];
  return c;
}

function fail(code) { var e = new Error(code); e.code = code; return e; }

// ---------- Anfitrión ----------
export function crearSala() {
  cerrar();
  if (!disponible()) return Promise.reject(fail("sin-libreria"));
  return new Promise(function (resolve, reject) {
    var tries = 0;
    function attempt() {
      var code = nuevoCodigo(), p = new window.Peer(PREFIX + code);
      peer = p;
      p.on("open", function () { resolve(code); });
      p.on("error", function (err) {
        if (p !== peer) return;
        if (err.type === "unavailable-id" && ++tries < 6) { p.destroy(); attempt(); return; }   // código en uso: otro
        if (!ctl) { cerrar(); reject(fail(err.type === "unavailable-id" ? "sin-codigo" : "servidor")); }
      });
      // Si se pierde el servidor de señalización, la partida P2P sigue; reintentamos solo para nuevas uniones.
      p.on("disconnected", function () { if (p === peer && !p.destroyed) { try { p.reconnect(); } catch (e) { /* nada */ } } });
      p.on("connection", acceptGuest);
    }
    attempt();
  });
}

function acceptGuest(conn) {
  var ch = conn.metadata && conn.metadata.ch;
  if ((guestId && conn.peer !== guestId) || (ch !== "ctl" && ch !== "rt")) {
    // Sala llena (u otra cosa): avisar y cerrar esa conexión sin tocar la partida.
    conn.on("open", function () {
      if (ch === "ctl") conn.send({ t: "llena" });
      setTimeout(function () { conn.close(); }, 500);
    });
    return;
  }
  guestId = conn.peer;
  conn.on("open", function () {
    if (ch === "ctl") { ctl = conn; ctl.send({ t: "hola", v: PROTO }); }
    else rt = conn;
    wire(conn);
    if (ctl && rt) onEv("conectado");
  });
}

// ---------- Invitado ----------
export function unirse(code) {
  cerrar();
  if (!disponible()) return Promise.reject(fail("sin-libreria"));
  return new Promise(function (resolve, reject) {
    var done = false, p = new window.Peer(), timer;
    peer = p;
    function finish(err) {
      if (done) return;
      done = true; clearTimeout(timer);
      if (err) { if (p === peer) cerrar(); reject(err); } else resolve();
    }
    timer = setTimeout(function () { if (p === peer) finish(fail("tiempo")); }, JOIN_TIMEOUT);
    p.on("error", function (err) {
      if (p !== peer) return;
      if (err.type === "peer-unavailable") finish(fail("inexistente"));
      else if (!done) finish(fail("servidor"));
    });
    p.on("open", function () {
      var c = p.connect(PREFIX + code, { reliable: true, serialization: "json", metadata: { ch: "ctl" } });
      var r = p.connect(PREFIX + code, { reliable: false, serialization: "json", metadata: { ch: "rt" } });
      var hello = false;
      function ready() { if (hello && r.open) { ctl = c; rt = r; wire(c); wire(r); finish(null); } }
      c.on("data", function first(m) {
        if (done || !m || typeof m !== "object") return;
        if (m.t === "llena") finish(fail("llena"));
        else if (m.t === "hola") { if (m.v !== PROTO) finish(fail("version")); else { hello = true; ready(); } }
      });
      r.on("open", ready);
    });
  });
}

// ---------- Común ----------
function wire(conn) {
  conn.on("data", function (m) { if (conn === ctl || conn === rt) onMsg(m); });
  conn.on("close", function () { if (conn === ctl || conn === rt) lost(); });
  conn.on("iceStateChanged", function (s) { if ((s === "failed" || s === "closed") && (conn === ctl || conn === rt)) lost(); });
}

function lost() {
  if (!ctl && !rt) return;
  ctl = rt = null;
  onEv("desconectado");
}

export function enviar(msg, fiable) {
  var c = fiable ? ctl : rt;
  if (c && c.open) { try { c.send(msg); } catch (e) { /* canal cerrándose */ } }
}

export function cerrar() {
  var p = peer;
  peer = ctl = rt = guestId = null;
  if (p) { try { p.destroy(); } catch (e) { /* nada */ } }
}
