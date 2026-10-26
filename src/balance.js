// Equilibrio: todos los números de los efectos en un solo lugar, para ajustarlos sin tocar la lógica.
// Después de cambiar algo, corre `npm test`: los tests leen estos mismos valores y comprueban que saques y
// devoluciones sigan siendo válidos (y, para la red alta, que quede margen hasta el límite seguro).
export var BALANCE = {
  // ---------- Orbes de power-up ----------
  orb: {
    R: 0.15,              // radio de recogida en m (la pelota lo toca si su centro pasa a menos de R + su radio)
    FIRST: 6,             // s de juego antes del primer orbe de la partida
    GAP: 14,              // s mínimos entre un orbe y el siguiente (desde que desaparece o se recoge)
    CHANCE: 0.1,          // probabilidad por segundo de que aparezca, pasado el mínimo (0.1: ~10 s más de media)
    LIFE: 10,             // s que flota antes de desaparecer
    X: 0.5,               // |x| máximo en m con la mesa normal (se escala con su ancho)
    Z0: 0.3, Z1: 0.95,    // |z| entre Z0 y Z1 m (en cualquier mitad, lejos de la red)
    Y0: 0.22, Y1: 0.42    // altura sobre la mesa en m (por donde suele pasar la pelota)
  },
  big: { reach: 1.5, secs: 8 },          // paleta grande: multiplica el alcance, durante tantos segundos
  fast: { shotTime: 0.7, hits: 1 },      // pelota rápida: factor del tiempo de vuelo, durante tantas devoluciones
  freeze: { speed: 0.6, secs: 3 },       // congelado: velocidad máxima de la paleta del rival en m/s, durante tantos s
  cannon: {                              // cañonazo: su siguiente devolución va muy rápida al cuerpo del rival
    hits: 1,              // devoluciones que dura
    shotTime: 0.55,       // factor del tiempo de vuelo (se combina con la pelota rápida)
    depth: 1.2,           // m desde la red donde bota en la mesa del rival (cerca del fondo, hacia su cuerpo)
    bodyZ: 2.2,           // m desde la red: plano del cuerpo; si la pelota lo cruza sin ser devuelta, es impacto
    bodyX: 0.55,          // el cuerpo está en x = 0.55 · x de su paleta (como lo dibuja render.js)
    pause: 1.0            // s extra entre puntos tras un impacto, para que se vea la animación
  },
  aiOrbAim: { facil: 0.3, medio: 0.5, dificil: 0.7 },   // probabilidad de que la máquina apunte a un orbe

  // ---------- Eventos de mesa ----------
  events: {
    FIRST: 2,             // puntos de la partida antes de que pueda haber un evento
    GAP: 3,               // puntos mínimos entre que termina un evento y empieza otro
    CHANCE: 0.35,         // probabilidad de que empiece uno al comenzar un punto, pasado el mínimo
    LEN: 3,               // puntos que dura cada evento
    narrow: 0.8,          // mesa angosta: factor del ancho   (validado de 0.7 a 1.3)
    wide: 1.2,            // mesa ancha: factor del ancho
    netHigh: 1.5,         // red alta: factor de la altura  (los saques dejan de pasar hacia 1.96; el test exige 20 % de margen)
    netLow: 0.5           // red baja: factor de la altura  (validado desde 0.4)
  },
  tableAnim: 0.9,         // s que dura la animación de cambio de mesa (y en los que no se puede sacar)
  impactAnim: { fly: 0.8, lie: 0.8, rise: 0.6, shake: 0.7 }   // s de cada fase de la animación de impacto
};
