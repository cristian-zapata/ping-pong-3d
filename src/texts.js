// Textos de los mensajes en pantalla. game.js genera descriptores (y viajan así en las snapshots),
// y cada pantalla los convierte en texto desde el punto de vista de su jugador.
// d: null | { k: "serve", s } | { k: "point", w, h, why: "net" | "out" | "own" | "miss" }
import { getDef } from "./effects.js";

export function msgText(d, me, rivalAI) {
  if (!d) return "";
  var R = rivalAI ? "La máquina" : "Tu rival", r = rivalAI ? "la máquina" : "tu rival";
  if (d.k === "serve") return d.s === me ? "Tu saque: haz clic o pulsa Espacio" : "Saque de " + r;
  if (d.k !== "point") return "";
  var mine = d.h === me, why;
  if (d.why === "net") why = mine ? "Tu pelota dio en la red" : R + " dio en la red";
  else if (d.why === "out") why = mine ? "Tu pelota se fue fuera" : R + " se pasó";
  else if (d.why === "own") why = mine ? "Tu pelota no botó donde debía" : R + " falló el bote";
  else why = mine ? R + " no llegó" : "No llegaste a la pelota";   // miss
  return (d.w === me ? "Punto para ti · " : "Punto de " + r + " · ") + why;
}

// ---------- Efectos ----------

// Tiempo restante de un efecto, en su unidad.
export function leftText(def, left) {
  if (def.unit === "seconds") return Math.max(0, Math.ceil(left - 1e-9)) + " s";
  var n = Math.max(0, Math.round(left));
  if (def.unit === "hits") return n === 1 ? "1 golpe" : n + " golpes";
  return n === 1 ? "1 punto" : n + " puntos";
}

// Aviso al empezar o terminar un efecto. ev: { k: "fx-on" | "fx-off", id, o: dueño (0 | 1 | -1 global) }
export function fxText(ev, me, rivalAI) {
  var def = getDef(ev.id);
  if (!def) return "";
  var R = rivalAI ? "La máquina" : "Tu rival", r = rivalAI ? "la máquina" : "tu rival", on = ev.k === "fx-on";
  if (ev.o === -1) return on ? "Evento: " + def.name + " (" + leftText(def, def.n) + ")" : "Termina el evento: " + def.name;
  if (ev.o === me) return on ? "¡" + def.name + "!" + (def.desc ? " " + def.desc : "") : "Se acabó tu " + def.name;
  return on ? R + " consiguió " + def.name : "Se acabó " + def.name + " de " + r;
}
