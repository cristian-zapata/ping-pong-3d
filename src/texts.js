// Textos de los mensajes en pantalla. game.js genera descriptores (y viajan así en las snapshots),
// y cada pantalla los convierte en texto desde el punto de vista de su jugador.
// d: null | { k: "serve", s } | { k: "point", w, h, why: "net" | "out" | "own" | "miss" }
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
