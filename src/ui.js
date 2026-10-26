// Menús (overlay), marcador, mensajes y botones de la barra superior.
// Todo texto variable (códigos, estados de red) se escribe con textContent, nunca como HTML.
import { DIFF } from "./ai.js";
import { unlockAudio } from "./audio.js";
import { MODES, getDef, registeredIds } from "./effects.js";
import { leftText } from "./texts.js";

var ov = document.getElementById("ov");
var msgEl = document.getElementById("msg");
function $(id) { return document.getElementById(id); }

export function setMsg(t) { msgEl.textContent = t || ""; }

// El marcador siempre pone a quien mira (S.me) a la izquierda.
export function updateHUD(S) {
  var me = S.me, them = 1 - S.me;
  $("sp").textContent = S.score[me];
  $("sa").textContent = S.score[them];
  var inGame = S.mode !== "menu" && S.mode !== "over";
  $("srv0").classList.toggle("on", inGame && S.server === me);
  $("srv1").classList.toggle("on", inGame && S.server === them);
  $("rec").textContent = "Sesión: " + S.wins + " – " + S.losses;
}

export function setMuteLabel(muted) { $("mute").textContent = "Sonido: " + (muted ? "no" : "sí"); }
export function setGuideLabel(on) { $("guide").textContent = "Guía: " + (on ? "sí" : "no"); }
export function setMotionLabel(reduced) {
  var b = $("motion");
  b.textContent = "Movimiento: " + (reduced ? "reducido" : "normal");
  b.setAttribute("aria-pressed", String(reduced));
}

// Modo en línea: nombre del rival, indicador de ping y botón para salir de la sala.
export function setOnline(on) {
  $("rivalName").textContent = on ? "Rival" : "Máquina";
  $("ping").hidden = !on;
  $("leave").hidden = !on;
  if (!on) setPing(null);
}
export function setPing(ms) { $("ping").textContent = "Ping: " + (ms == null ? "–" : Math.round(ms) + " ms"); }

// handlers: { mute(), guide(), leave(), motion() }
export function onToolbar(handlers) {
  $("mute").addEventListener("click", function () { unlockAudio(); handlers.mute(); });
  $("guide").addEventListener("click", function () { handlers.guide(); });
  $("leave").addEventListener("click", function () { handlers.leave(); });
  $("motion").addEventListener("click", function () { handlers.motion(); });
}

export function overlayOpen() { return !ov.hidden; }
export function clickPrimary() { var pb = ov.querySelector(".primary"); if (pb) pb.click(); }

export function hideOverlay() { ov.hidden = true; ov.innerHTML = ""; }

var RIVAL_WAIT = '<p class="hint" id="ovNote"></p>';

// kind: menu | pause | over | error | join | hosting | connecting | neterror
// extra: en "over", si ganó; en "hosting", el código; en "connecting", el texto; en "neterror", {title, text}.
export function showOverlay(kind, S, extra) {
  ov.hidden = false;
  var html = "";
  if (kind === "menu") {
    var segs = Object.keys(DIFF).map(function (k) {
      return '<button type="button" role="radio" data-a="diff" data-v="' + k + '" aria-checked="' + (S.diff === k) + '">' + DIFF[k].label + "</button>";
    }).join("");
    var fxSegs = Object.keys(MODES).map(function (k) {
      return '<button type="button" role="radio" data-a="fxmode" data-v="' + k + '" aria-checked="' + (S.fxMode === k) + '">' + MODES[k].label + "</button>";
    }).join("");
    html = '<div class="card"><h2>Ping-pong 3D</h2>' +
      "<p>Juega contra la máquina o contra un amigo en línea. Gana quien llegue primero a 11 puntos con 2 de diferencia.</p>" +
      '<div class="seg-label">Dificultad de la máquina</div>' +
      '<div class="seg" role="radiogroup" aria-label="Dificultad">' + segs + "</div>" +
      '<div class="seg-label">Efectos (contra la máquina o al crear sala)</div>' +
      '<div class="seg seg-wrap" role="radiogroup" aria-label="Efectos">' + fxSegs + "</div>" +
      (registeredIds().length ? "" : '<p class="hint fx-none">Todavía no hay efectos disponibles: llegan en la próxima versión.</p>') + "<br>" +
      '<button type="button" class="btn primary" data-a="start">Contra la máquina</button>' +
      '<div class="seg-label name-label">Tu nombre (lo verá tu rival en línea)</div>' +
      '<input class="name-in" id="nameIn" maxlength="16" autocomplete="nickname" spellcheck="false" aria-label="Tu nombre" placeholder="Escribe tu nombre">' +
      '<div class="row"><button type="button" class="btn ghost" data-a="host">Crear sala</button>' +
      '<button type="button" class="btn ghost" data-a="join">Unirse a sala</button></div>' + RIVAL_WAIT +
      '<p class="hint">Coloca la paleta en el aro blanco y haz clic justo cuando llegue la pelota para pegar fuerte. Cuanto más fuerte pegues, más riesgo de fallar.</p></div>';
  } else if (kind === "pause") {
    html = '<div class="card"><h2>Pausa</h2><p>El juego espera.</p>' +
      '<button type="button" class="btn primary" data-a="resume">Continuar</button>' +
      '<button type="button" class="btn ghost" data-a="menu">Salir al menú</button></div>';
  } else if (kind === "over") {
    var res = "<p>Resultado final: " + S.score[S.me] + " a " + S.score[1 - S.me] + ". Sesión: " + S.wins + " – " + S.losses + ".</p>";
    html = '<div class="card"><h2>' + (extra ? "¡Ganaste!" : "Perdiste") + "</h2>" + res +
      (S.online
        ? '<button type="button" class="btn primary" data-a="rematch">Revancha</button>' +
          '<button type="button" class="btn ghost" data-a="leave">Salir</button>' + RIVAL_WAIT
        : '<button type="button" class="btn primary" data-a="start">Revancha</button>' +
          '<button type="button" class="btn ghost" data-a="menu">Cambiar dificultad</button>') + "</div>";
  } else if (kind === "error") {
    html = '<div class="card"><h2>No se pudo iniciar</h2><p>Este juego necesita WebGL y la librería 3D, y no se cargaron. Prueba en otro navegador o revisa tu conexión.</p></div>';
  } else if (kind === "join") {
    html = '<div class="card"><h2>Unirse a sala</h2><p>Escribe el código de 4 letras que te compartieron.</p>' +
      '<input class="code-in" id="codeIn" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Código de sala"><br>' +
      '<button type="button" class="btn primary" data-a="joinGo">Unirse</button>' +
      '<button type="button" class="btn ghost" data-a="menu">Cancelar</button>' + RIVAL_WAIT + "</div>";
  } else if (kind === "hosting") {
    html = '<div class="card"><h2>Sala creada</h2><p>Comparte este código con tu rival:</p>' +
      '<div class="code" id="roomCode"></div><p id="ovStatus">Esperando jugador…</p>' +
      '<p class="hint">Efectos: ' + MODES[S.fxMode].label + "</p>" +
      '<button type="button" class="btn ghost" data-a="copy">Copiar código</button>' +
      '<button type="button" class="btn ghost" data-a="leave">Cancelar</button></div>';
  } else if (kind === "connecting") {
    html = '<div class="card"><h2>Conectando…</h2><p id="ovStatus"></p>' +
      '<button type="button" class="btn ghost" data-a="leave">Cancelar</button></div>';
  } else if (kind === "neterror") {
    html = '<div class="card"><h2 id="ovTitle"></h2><p id="ovStatus"></p>' +
      '<button type="button" class="btn primary" data-a="menu">Volver al menú</button></div>';
  }
  ov.innerHTML = html;
  if (kind === "menu") $("nameIn").value = S.myName || "";        // como propiedad, nunca dentro del HTML
  if (kind === "hosting") $("roomCode").textContent = extra;
  if (kind === "connecting") $("ovStatus").textContent = extra || "";
  if (kind === "neterror") { $("ovTitle").textContent = extra.title; $("ovStatus").textContent = extra.text; }
  if (kind === "join") {
    var inp = $("codeIn");
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") clickPrimary(); });
    inp.focus({ preventScroll: true });
    return;
  }
  var pb = ov.querySelector(".primary");
  if (pb) pb.focus({ preventScroll: true });
}

// Nota bajo los botones del overlay actual (errores al unirse, aviso de revancha).
export function setOverlayNote(t) { var n = $("ovNote"); if (n) n.textContent = t || ""; }
export function joinCodeValue() { var i = $("codeIn"); return i ? i.value : ""; }
export function nameValue() { var i = $("nameIn"); return i ? i.value : null; }
// Nombre del rival en el marcador (en línea).
export function setRivalName(name) { $("rivalName").textContent = name; }

// fn(action, value) recibe el data-a y data-v del botón pulsado en el overlay.
export function onOverlayAction(fn) {
  ov.addEventListener("click", function (e) {
    var el = e.target.closest("[data-a]");
    if (!el) return;
    unlockAudio();
    fn(el.getAttribute("data-a"), el.getAttribute("data-v"));
  });
}

// ---------- Efectos: chips con icono y tiempo restante, y avisos ----------
var fxSig = "";
// list: efectos activos [{ uid, id, owner, left }]. Los del jugador `me` van abajo a la izquierda,
// los del rival arriba a la derecha y los globales/de mesa arriba a la izquierda.
export function updateFx(list, me) {
  var groups = { fxMe: [], fxThem: [], fxAll: [] };
  list.forEach(function (e) {
    var def = getDef(e.id);
    if (!def) return;
    var g = e.owner === -1 ? "fxAll" : (e.owner === me ? "fxMe" : "fxThem");
    groups[g].push({ def: def, left: leftText(def, e.left) });
  });
  var sig = JSON.stringify(Object.keys(groups).map(function (g) { return groups[g].map(function (c) { return c.def.id + c.left; }); }));
  if (sig === fxSig) return;
  fxSig = sig;
  Object.keys(groups).forEach(function (g) {
    var box = $(g);
    box.textContent = "";
    groups[g].forEach(function (c) {
      var chip = document.createElement("span");
      chip.className = "fx-chip";
      chip.style.setProperty("--fx", c.def.color);
      chip.title = c.def.name;
      var ic = document.createElement("b"); ic.textContent = c.def.icon;
      var tx = document.createElement("span"); tx.textContent = c.def.name + " · " + c.left;
      chip.appendChild(ic); chip.appendChild(tx);
      box.appendChild(chip);
    });
  });
}

// Aviso breve bajo el mensaje principal (máximo 3 a la vez).
export function toast(text) {
  if (!text) return;
  var box = $("toasts"), el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(function () { el.classList.add("out"); }, 2200);
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2700);
}
