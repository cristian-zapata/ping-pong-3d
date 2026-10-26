// Punto de entrada: conecta los módulos y corre el bucle de paso fijo.
import { PZ } from "./physics.js";
import { S, B, PL, out, tick, trySwing, togglePause, newGame, toMenu, setDiff, setControls } from "./game.js";
import { isMuted, setMuted, playSound } from "./audio.js";
import { initInput, pollInput } from "./input.js";
import { createRenderer } from "./render.js";
import { msgText } from "./texts.js";
import * as online from "./online.js";
import * as ui from "./ui.js";

var stage = document.getElementById("stage");
var canvas = document.getElementById("gl");
var view = null;

out.msg = function (d) { ui.setMsg(msgText(d, S.me, PL[1 - S.me].ctrl === "ia")); };
out.hud = function () { ui.updateHUD(S); };
out.overlay = function (kind, won) { if (kind) ui.showOverlay(kind, S, won); else ui.hideOverlay(); };
out.sound = function (name, arg) { playSound(name, arg, S.me); online.onSound(name, arg); };

// Modo contra la máquina: este navegador controla al jugador 0 y la IA al jugador 1.
setControls("local", "ia", 0);

// Objetivo de la paleta propia en el marco de quien mira (x a su derecha); se pasa al mundo en cada paso.
var aim = { tx: 0, ty: 1.05 };
function applyAim() { var pl = PL[S.me]; pl.tx = pl.side * aim.tx; pl.ty = aim.ty; }

function toggleMute() { setMuted(!isMuted()); ui.setMuteLabel(isMuted()); }
function toggleGuide() { S.guide = !S.guide; ui.setGuideLabel(S.guide); }

initInput({
  canvas: canvas,
  paddle: aim,
  canAim: function () { return S.mode !== "menu" && S.mode !== "over" && S.mode !== "paused"; },
  project: function (nx, ny) { return view ? view.project(nx, ny, PZ) : null; },
  swing: function () { if (online.getRole() === "guest") online.guestSwing(); else trySwing(S.me); },
  pause: togglePause,
  autoPause: function () { if (S.mode === "play" || S.mode === "serve") togglePause(); },
  mute: toggleMute,
  guide: toggleGuide
});
ui.onToolbar({ mute: toggleMute, guide: toggleGuide, leave: online.leave });

function copyCode(btn) {
  var c = online.roomCode();
  if (!c || !navigator.clipboard) return;
  navigator.clipboard.writeText(c).then(function () { btn.textContent = "¡Copiado!"; }, function () { /* sin permiso */ });
}

ui.onOverlayAction(function (a, v) {
  if (a === "diff") setDiff(v);
  else if (a === "start") newGame();
  else if (a === "resume") togglePause();
  else if (a === "menu") { if (online.getRole()) online.leave(); else toMenu(); }
  else if (a === "host") online.startHost();
  else if (a === "join") ui.showOverlay("join", S);
  else if (a === "joinGo") online.startGuest(ui.joinCodeValue());
  else if (a === "copy") copyCode(document.querySelector('#ov [data-a="copy"]'));
  else if (a === "rematch") online.rematch();
  else if (a === "leave") online.leave();
});

view = createRenderer(canvas, stage);
if (!view) {
  ui.showOverlay("error", S);
} else {
  var last = performance.now(), acc = 0, STEP = 1 / 120;
  var frame = function (now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (S.mode !== "paused") {
      acc += dt;
      while (acc >= STEP) {
        pollInput(STEP);
        applyAim();
        if (online.getRole() === "guest") online.guestStep(STEP); else tick(STEP);
        acc -= STEP;
      }
    }
    online.update(dt);
    view.render(S, B, PL, S.me);
    requestAnimationFrame(frame);
  };

  ui.showOverlay("menu", S);
  ui.updateHUD(S);
  requestAnimationFrame(frame);
}
