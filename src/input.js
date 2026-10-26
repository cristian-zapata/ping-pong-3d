// Teclado, puntero (mouse/táctil) y gamepad. Mueve el objetivo de la paleta (paddle.tx/ty) y dispara acciones.
// paddle.tx está en el marco de quien mira (x a su derecha); main.js lo pasa al mundo.
import { clamp } from "./util.js";
import { P } from "./physics.js";
import { overlayOpen, clickPrimary } from "./ui.js";
import { unlockAudio } from "./audio.js";

var keys = {}, cfg = null, gpPrevA = false;

// c: { canvas, paddle, canAim(), project(nx, ny) -> {x,y}|null, swing(), pause(), autoPause(), mute(), guide() }
export function initInput(c) {
  cfg = c;
  window.addEventListener("keydown", function (e) {
    if (e.target && e.target.tagName === "INPUT") return;   // escribiendo un código de sala
    var k = e.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].indexOf(k) !== -1 && !overlayOpen()) e.preventDefault();
    unlockAudio();
    if (k === "p" || k === "escape") { cfg.pause(); return; }
    if (k === "m") { cfg.mute(); return; }
    if (k === "g") { cfg.guide(); return; }
    if (k === " " && !overlayOpen()) { if (!e.repeat) cfg.swing(); return; }
    keys[k] = true;
  });
  window.addEventListener("keyup", function (e) { keys[e.key.toLowerCase()] = false; });
  window.addEventListener("blur", function () { keys = {}; cfg.autoPause(); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) cfg.autoPause(); });

  cfg.canvas.addEventListener("pointermove", pointerPos);
  cfg.canvas.addEventListener("pointerdown", function (e) {
    unlockAudio();
    if (overlayOpen()) return;
    pointerPos(e);
    cfg.swing();
  });
}

function pointerPos(e) {
  if (!cfg.canAim()) return;
  var r = cfg.canvas.getBoundingClientRect();
  var nx = clamp((e.clientX - r.left) / r.width, 0, 1);
  var ny = clamp((e.clientY - r.top) / r.height, 0, 1);
  // proyecta el cursor al plano de tu paleta para que quede justo debajo del puntero
  var p = cfg.project(nx, ny);
  if (!p) return;
  cfg.paddle.tx = clamp(p.x, -P.PAD_X, P.PAD_X);
  cfg.paddle.ty = clamp(p.y, P.PAD_YMIN, P.PAD_YMAX);
}

function readGamepad(h) {
  var pad = cfg.paddle;
  var pads = navigator.getGamepads ? navigator.getGamepads() : [], a = false, i;
  for (i = 0; i < pads.length; i++) {
    var g = pads[i]; if (!g) continue;
    var ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    if (Math.abs(ax) > 0.15) pad.tx = clamp(pad.tx + ax * 2.4 * h, -P.PAD_X, P.PAD_X);
    if (Math.abs(ay) > 0.15) pad.ty = clamp(pad.ty - ay * 1.6 * h, P.PAD_YMIN, P.PAD_YMAX);
    if (g.buttons[0] && g.buttons[0].pressed) a = true;
  }
  if (a && !gpPrevA) {
    if (overlayOpen()) clickPrimary();
    else cfg.swing();
  }
  gpPrevA = a;
}

// Se llama en cada paso lógico, antes de game.tick(h).
export function pollInput(h) {
  var pad = cfg.paddle;
  var dx = 0, dy = 0;
  if (keys["a"] || keys["arrowleft"]) dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;
  if (keys["w"] || keys["arrowup"]) dy += 1;
  if (keys["s"] || keys["arrowdown"]) dy -= 1;
  pad.tx = clamp(pad.tx + dx * 2.4 * h, -P.PAD_X, P.PAD_X);
  pad.ty = clamp(pad.ty + dy * 1.6 * h, P.PAD_YMIN, P.PAD_YMAX);
  readGamepad(h);
  pad.tx = clamp(pad.tx, -P.PAD_X, P.PAD_X);
  pad.ty = clamp(pad.ty, P.PAD_YMIN, P.PAD_YMAX);
}
