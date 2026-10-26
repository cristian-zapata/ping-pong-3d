// Física pura: sin DOM ni Three. Se usa en el navegador y en los tests de Node.
// Unidades en metros. Eje z: el jugador 0 en z positivo, el rival en z negativo. x: derecha. y: arriba.
//
// Todos los parámetros de juego se leen de `P` (parámetros efectivos). `P` parte de DEFAULTS (los valores
// validados) y effects.js lo recalcula cuando hay efectos activos. Sin efectos, P es idéntico a DEFAULTS.
export var DEFAULTS = Object.freeze({
  // mundo
  G: 9.81, R: 0.032, E: 0.88,
  // mesa (medias medidas: ancho HW y largo HL desde el centro) y red
  TOPY: 0.76, HW: 0.7625, HL: 1.37, NET_H: 0.1525, NETW: 0.915,
  // jugadores: plano de golpeo, alcance base de la paleta y rango por donde se mueve
  PZ: 1.55, REACH: 0.27, PAD_X: 1.1, PAD_YMIN: 0.75, PAD_YMAX: 1.75,
  // saque (validado con test/physics.test.js): posición, primer bote (Z1 a los T1 s) y rangos de x
  SERVE_Y: 1.2, SERVE_Z: 1.45, SERVE_Z1: 0.65, SERVE_T1: 0.26, SERVE_X0: 0.6, SERVE_X2: 0.5,
  // golpes: altura mínima de salida, objetivo en x, profundidad, tiempo de vuelo y margen sobre la red
  HIT_YMIN: 0.95, AIM_X: 0.65, DEPTH_MIN: 0.55, DEPTH_RANGE: 0.55, T_BASE: 0.9, T_POWER: 0.45, NET_CLEAR: 0.07,
  // máquina: rango de su paleta, objetivo en x, faltas intencionales y x del saque
  AI_X: 1.3, AI_YMAX: 1.4, AI_AIM_X: 0.62, AI_FAULT_X: 0.95, AI_FAULT_Z: 1.75, AI_SERVE_X: 0.45
});

export var P = {};

// Valores derivados de otros parámetros.
function derive(p) { p.NET_TOP = p.TOPY + p.NET_H; }

export function resetParams() {
  for (var k in DEFAULTS) P[k] = DEFAULTS[k];
  derive(P);
}
// Cambia algunos parámetros (los no listados en DEFAULTS se ignoran). Lo usan effects.js y los tests.
export function setParams(over) {
  for (var k in over) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) P[k] = over[k];
  derive(P);
}
resetParams();

// Velocidad inicial para que la pelota, saliendo de (x0,y0,z0), caiga en (Tx, mesa, Tz) tras tDes segundos
// (o más, si hace falta subir el arco para pasar la red).
export function launchTo(x0, y0, z0, Tx, Tz, tDes) {
  var best = null, t;
  for (t = tDes; t <= tDes + 0.9; t += 0.03) {
    var vz = (Tz - z0) / t, vx = (Tx - x0) / t, vy = (P.TOPY + P.R - y0 + 0.5 * P.G * t * t) / t;
    var tn = (0 - z0) / vz;
    best = { vx: vx, vy: vy, vz: vz, t: t };
    if (tn > 0 && tn < t) {
      var yn = y0 + vy * tn - 0.5 * P.G * tn * tn;
      if (yn > P.NET_TOP + P.R + P.NET_CLEAR) return best;
    }
  }
  return best;
}

// Saque: bota primero en el lado de quien saca (SERVE_Z1) y luego pasa al otro lado, cayendo cerca de x2.
// Parametros comprobados con y0 = SERVE_Y: pasa la red y deja tiempo para devolver antes del segundo bote.
// No cambiar SERVE_T1, SERVE_Z1 ni SERVE_Y/SERVE_Z sin volver a correr `npm test`.
export function serveVel(side, x0, y0, x2) {
  var z0 = side * P.SERVE_Z, z1 = side * P.SERVE_Z1, t1 = P.SERVE_T1;
  var vy = (P.TOPY + P.R - y0 + 0.5 * P.G * t1 * t1) / t1;
  var vyUp = -(vy - P.G * t1) * P.E, t2 = 2 * vyUp / P.G;
  return { x: x0, y: y0, z: z0, vx: (x2 - x0) / (t1 + t2), vy: vy, vz: (z1 - z0) / t1 };
}

// Simula la pelota hasta que cruza el plano z = planeZ. Devuelve {x,y,t} o null.
export function predict(x, y, z, vx, vy, vz, planeZ) {
  var dt = 1 / 240, i, pz;
  for (i = 0; i < 1800; i++) {
    pz = z;
    vy -= P.G * dt; x += vx * dt; y += vy * dt; z += vz * dt;
    if (vy < 0 && y - P.R <= P.TOPY && y - P.R >= P.TOPY - 0.1 && Math.abs(x) <= P.HW && Math.abs(z) <= P.HL) {
      y = P.TOPY + P.R; vy = -vy * P.E;
    }
    if ((planeZ > 0 && pz < planeZ && z >= planeZ) || (planeZ < 0 && pz > planeZ && z <= planeZ)) {
      return { x: x, y: y, t: (i + 1) * dt };
    }
    if (y < 0) return null;
  }
  return null;
}

// ---------- Paso de simulación (b = {x,y,z,vx,vy,vz}) ----------
export function integrate(b, h) {
  b.vy -= P.G * h; b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
}

// ¿El tramo (ox,oy,oz) -> b cruzó z = 0 tocando la red?
export function hitsNet(ox, oy, oz, b) {
  if (!((oz > 0 && b.z <= 0) || (oz < 0 && b.z >= 0))) return false;
  var f = oz / (oz - b.z);
  var yy = oy + (b.y - oy) * f, xx = ox + (b.x - ox) * f;
  return Math.abs(xx) <= P.NETW && yy - P.R < P.NET_TOP && yy + P.R > P.TOPY;
}
export function netDeflect(b, oz) {
  b.z = oz > 0 ? 0.04 : -0.04; b.vz = -b.vz * 0.12; b.vx *= 0.3;
}

export function onTable(b) {
  return b.vy < 0 && b.y - P.R <= P.TOPY && b.y - P.R >= P.TOPY - 0.1 && Math.abs(b.x) <= P.HW && Math.abs(b.z) <= P.HL;
}
export function bounceTable(b) {
  b.y = P.TOPY + P.R; b.vy = -b.vy * P.E;
}

// Punto donde el tramo (ox,oy,oz) -> b cruza el plano de golpeo z = planeZ viniendo hacia él, o null.
export function crossPlane(ox, oy, oz, b, planeZ) {
  var crossed = planeZ > 0 ? (oz < planeZ && b.z >= planeZ && b.vz > 0) : (oz > planeZ && b.z <= planeZ && b.vz < 0);
  if (!crossed) return null;
  var f = (planeZ - oz) / (b.z - oz);
  return { x: ox + (b.x - ox) * f, y: oy + (b.y - oy) * f };
}

// Pelota libre tras el punto: rebota amortiguada en el suelo.
export function bounceFloor(b) {
  if (b.y <= P.R && b.vy < 0) { b.y = P.R; b.vy = -b.vy * 0.5; b.vx *= 0.8; b.vz *= 0.8; }
}

export function isOut(b) {
  return b.y <= P.R * 0.6 || Math.abs(b.z) > 4.5 || Math.abs(b.x) > 4;
}
