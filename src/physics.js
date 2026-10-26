// Física pura: sin DOM ni Three. Se usa en el navegador y en los tests de Node.
// Unidades en metros. Eje z: el jugador 0 en z positivo, el rival en z negativo. x: derecha. y: arriba.
export var G = 9.81, R = 0.032, TOPY = 0.76, HW = 0.7625, HL = 1.37;
export var NET_TOP = TOPY + 0.1525, NETW = 0.915, E = 0.88, PZ = 1.55, REACH = 0.27;
// Posición de la pelota al sacar (validada con test/physics.test.js junto con serveVel).
export var SERVE_Y = 1.2, SERVE_Z = 1.45;

// Velocidad inicial para que la pelota, saliendo de (x0,y0,z0), caiga en (Tx, mesa, Tz) tras tDes segundos
// (o más, si hace falta subir el arco para pasar la red).
export function launchTo(x0, y0, z0, Tx, Tz, tDes) {
  var best = null, t;
  for (t = tDes; t <= tDes + 0.9; t += 0.03) {
    var vz = (Tz - z0) / t, vx = (Tx - x0) / t, vy = (TOPY + R - y0 + 0.5 * G * t * t) / t;
    var tn = (0 - z0) / vz;
    best = { vx: vx, vy: vy, vz: vz, t: t };
    if (tn > 0 && tn < t) {
      var yn = y0 + vy * tn - 0.5 * G * tn * tn;
      if (yn > NET_TOP + R + 0.07) return best;
    }
  }
  return best;
}

// Saque: bota primero en el lado de quien saca (z1) y luego pasa al otro lado, cayendo cerca de x2.
// Parametros comprobados con y0 = 1.2: pasa la red y deja tiempo para devolver antes del segundo bote.
// No cambiar t1, z1 ni SERVE_Y/SERVE_Z sin volver a correr `npm test`.
export function serveVel(side, x0, y0, x2) {
  var z0 = side * SERVE_Z, z1 = side * 0.65, t1 = 0.26;
  var vy = (TOPY + R - y0 + 0.5 * G * t1 * t1) / t1;
  var vyUp = -(vy - G * t1) * E, t2 = 2 * vyUp / G;
  return { x: x0, y: y0, z: z0, vx: (x2 - x0) / (t1 + t2), vy: vy, vz: (z1 - z0) / t1 };
}

// Simula la pelota hasta que cruza el plano z = planeZ. Devuelve {x,y,t} o null.
export function predict(x, y, z, vx, vy, vz, planeZ) {
  var dt = 1 / 240, i, pz;
  for (i = 0; i < 1800; i++) {
    pz = z;
    vy -= G * dt; x += vx * dt; y += vy * dt; z += vz * dt;
    if (vy < 0 && y - R <= TOPY && y - R >= TOPY - 0.1 && Math.abs(x) <= HW && Math.abs(z) <= HL) {
      y = TOPY + R; vy = -vy * E;
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
  b.vy -= G * h; b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
}

// ¿El tramo (ox,oy,oz) -> b cruzó z = 0 tocando la red?
export function hitsNet(ox, oy, oz, b) {
  if (!((oz > 0 && b.z <= 0) || (oz < 0 && b.z >= 0))) return false;
  var f = oz / (oz - b.z);
  var yy = oy + (b.y - oy) * f, xx = ox + (b.x - ox) * f;
  return Math.abs(xx) <= NETW && yy - R < NET_TOP && yy + R > TOPY;
}
export function netDeflect(b, oz) {
  b.z = oz > 0 ? 0.04 : -0.04; b.vz = -b.vz * 0.12; b.vx *= 0.3;
}

export function onTable(b) {
  return b.vy < 0 && b.y - R <= TOPY && b.y - R >= TOPY - 0.1 && Math.abs(b.x) <= HW && Math.abs(b.z) <= HL;
}
export function bounceTable(b) {
  b.y = TOPY + R; b.vy = -b.vy * E;
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
  if (b.y <= R && b.vy < 0) { b.y = R; b.vy = -b.vy * 0.5; b.vx *= 0.8; b.vz *= 0.8; }
}

export function isOut(b) {
  return b.y <= R * 0.6 || Math.abs(b.z) > 4.5 || Math.abs(b.x) > 4;
}
