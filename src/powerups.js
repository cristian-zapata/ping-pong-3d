// Power-ups: los tres efectos que dan los orbes y las reglas del orbe (aparición, vida y recogida).
// Sin DOM. game.js llama a orbStep() en cada paso y a orbTouched() con cada tramo de la pelota.
import { P, DEFAULTS } from "./physics.js";
import { register } from "./effects.js";

// Números del orbe (se moverán a balance.js en la fase de equilibrio).
export var ORB = {
  R: 0.15,              // radio de recogida (la pelota lo toca si su centro pasa a menos de R + radio de la pelota)
  FIRST: 6,             // s de juego antes del primer orbe de la partida
  GAP: 14,              // s mínimos entre un orbe y el siguiente (desde que desaparece o se recoge)
  CHANCE: 0.1,          // probabilidad por segundo de que aparezca, pasado el mínimo (media ~10 s más)
  LIFE: 10,             // s que flota antes de desaparecer
  X: 0.5,               // |x| máximo (con la mesa normal; se escala con su ancho)
  Z0: 0.3, Z1: 0.95,    // |z| entre Z0 y Z1 (en cualquiera de las dos mitades, lejos de la red)
  Y0: 0.22, Y1: 0.42    // altura sobre la mesa (por donde suele pasar la pelota)
};
export var FAST_SHOT = 0.7;   // la pelota rápida tarda 0.7 veces lo normal en llegar

// target: "self" (lo recibe quien recoge el orbe) o "rival" (lo recibe su rival).
// say: textos al empezar/terminar; [si el dueño es quien mira, si es su rival]. {R}/{r}: "La máquina"/"tu rival".
export var POWERUPS = [
  { id: "big", name: "Paleta grande", icon: "🏓", color: "#22c55e", cat: "powerup", scope: "player", unit: "seconds", n: 8,
    target: "self", mod: function (pp) { pp.reachMul *= 1.5; },
    say: { on: ["¡Paleta grande! Alcance ×1.5 durante 8 s", "{R} tiene paleta grande"],
           off: ["Se acabó tu paleta grande", "{R} ya no tiene paleta grande"] } },
  { id: "fast", name: "Pelota rápida", icon: "⚡", color: "#facc15", cat: "powerup", scope: "player", unit: "hits", n: 1,
    target: "self", mod: function (pp) { pp.shotTime *= FAST_SHOT; },
    say: { on: ["¡Pelota rápida! Tu siguiente devolución saldrá más rápida", "{R} tiene pelota rápida: ¡atento!"],
           off: ["¡Ahí va tu pelota rápida!", "¡Cuidado, pelota rápida!"] } },
  { id: "freeze", name: "Congelado", icon: "❄", color: "#38bdf8", cat: "powerup", scope: "player", unit: "seconds", n: 3,
    target: "rival", mod: function (pp) { pp.speedCap = Math.min(pp.speedCap, 0.6); },
    say: { on: ["¡{R} te congeló! Tu paleta va lenta 3 s", "¡Congelaste a {r}!"],
           off: ["Ya no estás congelado", "{R} se descongeló"] } }
];
POWERUPS.forEach(register);
var IDS = POWERUPS.map(function (d) { return d.id; });

export function isOrbKind(id) { return IDS.indexOf(id) !== -1; }

// Avanza el orbe. S.orb: null o { kind, x, y, z, life }; S.orbWait: s hasta que pueda aparecer otro.
// Solo se llama cuando el modo de partida permite power-ups.
export function orbStep(S, h) {
  if (S.orb) {
    S.orb.life -= h;
    if (S.orb.life <= 0) { S.orb = null; S.orbWait = ORB.GAP; }
    return;
  }
  if (S.orbWait > 0) { S.orbWait -= h; return; }
  if (Math.random() < ORB.CHANCE * h) {
    var r = Math.random, side = r() < 0.5 ? 1 : -1;
    S.orb = {
      kind: IDS[Math.floor(r() * IDS.length)],
      x: (r() * 2 - 1) * ORB.X * P.HW / DEFAULTS.HW,
      y: P.TOPY + ORB.Y0 + r() * (ORB.Y1 - ORB.Y0),
      z: side * (ORB.Z0 + r() * (ORB.Z1 - ORB.Z0)),
      life: ORB.LIFE
    };
  }
}

// ¿El tramo (ox,oy,oz) -> b pasó por el orbe? Distancia mínima del segmento al centro.
export function orbTouched(orb, ox, oy, oz, b) {
  var dx = b.x - ox, dy = b.y - oy, dz = b.z - oz;
  var len2 = dx * dx + dy * dy + dz * dz;
  var t = len2 > 0 ? ((orb.x - ox) * dx + (orb.y - oy) * dy + (orb.z - oz) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  var cx = ox + dx * t - orb.x, cy = oy + dy * t - orb.y, cz = oz + dz * t - orb.z;
  var rr = ORB.R + P.R;
  return cx * cx + cy * cy + cz * cz <= rr * rr;
}
