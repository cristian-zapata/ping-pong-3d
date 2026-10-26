// Eventos de mesa: cambian la mesa o la red durante unos puntos. Solo entre puntos (duran "puntos", ver effects.js)
// y solo uno a la vez. Sin DOM. game.js llama a maybeEvent() al empezar cada punto.
import { register, tableBusy } from "./effects.js";

// Números de los eventos (se moverán a balance.js en la fase de equilibrio).
export var EVT = {
  FIRST: 2,          // puntos de la partida antes de que pueda haber un evento
  GAP: 3,            // puntos mínimos entre que termina un evento y empieza otro
  CHANCE: 0.35,      // probabilidad de que empiece uno al comenzar un punto, pasado el mínimo
  LEN: 3             // puntos que dura cada evento
};
// TODO: mesa corta/larga, gravedad y viento. Qué habría que revalidar en cada caso: ver "Pendiente (TODO)" en el README.

// Factores validados con test/physics.test.js (que también comprueba su margen hasta el límite seguro).
export var NARROW = 0.8, WIDE = 1.2, NET_HIGH = 1.5, NET_LOW = 0.5;

// Cambia el ancho de la mesa y, con él, todo lo que depende del ancho: red (sobresale lo mismo de cada lado),
// objetivos de golpe, rangos de saque y las faltas intencionales de la máquina (que deben seguir cayendo fuera).
export function widthMod(f) {
  return function (p) {
    var hw = p.HW * f;
    p.NETW += hw - p.HW;
    p.HW = hw;
    p.AIM_X *= f; p.AI_AIM_X *= f; p.AI_FAULT_X *= f;
    p.SERVE_X0 *= f; p.SERVE_X2 *= f; p.AI_SERVE_X *= f;
  };
}
export function netMod(f) { return function (p) { p.NET_H *= f; }; }

export var EVENTS = [
  { id: "narrow", name: "Mesa angosta", icon: "⇥", color: "#f97316", cat: "event", scope: "table", unit: "points", n: EVT.LEN, mod: widthMod(NARROW) },
  { id: "wide", name: "Mesa ancha", icon: "⇔", color: "#a855f7", cat: "event", scope: "table", unit: "points", n: EVT.LEN, mod: widthMod(WIDE) },
  { id: "nethigh", name: "Red alta", icon: "⬆", color: "#ef4444", cat: "event", scope: "table", unit: "points", n: EVT.LEN, mod: netMod(NET_HIGH) },
  { id: "netlow", name: "Red baja", icon: "⬇", color: "#14b8a6", cat: "event", scope: "table", unit: "points", n: EVT.LEN, mod: netMod(NET_LOW) }
];
EVENTS.forEach(register);

// Al comenzar cada punto (antes de que effects.onPoint active los pendientes). S.evWait: puntos que faltan
// para que pueda empezar otro. give(id, -1) activa el evento (game.giveEffect, que respeta el modo de partida).
// Mientras hay un evento de mesa activo o pendiente no cuenta la espera ni empieza otro.
export function maybeEvent(S, give) {
  if (tableBusy()) return;
  if (S.evWait > 0) { S.evWait--; return; }
  if (Math.random() < EVT.CHANCE) {
    give(EVENTS[Math.floor(Math.random() * EVENTS.length)].id, -1);
    S.evWait = EVT.GAP;
  }
}
