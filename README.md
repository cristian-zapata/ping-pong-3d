# Ping-pong 3D

Juego de ping-pong 3D en tercera persona para el navegador: contra la máquina o contra un amigo en línea
(peer-to-peer con WebRTC, sin servidor propio). Sin bundler ni build: HTML + CSS + módulos ES nativos,
con Three.js y PeerJS cargados desde CDN.

## Cómo correrlo en local

Los módulos ES (`<script type="module">`) **no cargan abriendo `index.html` con doble clic** (`file://`):
el navegador bloquea los `import` por CORS. Hay que servir la carpeta por HTTP. Desde la raíz del proyecto:

```sh
# Opción A: Python 3 (no instala nada)
python -m http.server 8000
# abre http://localhost:8000/

# Opción B: Node (descarga el paquete "serve" la primera vez)
npx serve .
# abre la URL que imprime (normalmente http://localhost:3000/)
```

## Jugar en línea

1. Uno elige **Crear sala** y comparte el código de 4 letras que aparece (no se usan I, L ni O).
2. El otro elige **Unirse a sala** y escribe el código.
3. Quien crea la sala es el **anfitrión**: su navegador ejecuta toda la física y las reglas. El invitado solo envía
   su entrada (posición de la paleta y golpes) y dibuja lo que recibe; su vista está girada 180° para que juegue
   desde su lado igual que el anfitrión.
4. En línea no hay pausa. Al terminar, la revancha empieza cuando **los dos** la aceptan. "Salir de la sala"
   avisa al rival; si la conexión se corta o no llegan datos en 6 s, ambos vuelven al menú con un aviso.

La conexión usa el servidor de señalización público de PeerJS solo para el encuentro inicial; después los datos
van directo entre los dos navegadores. Lee [Limitaciones y riesgos](#limitaciones-y-riesgos) antes de compartirlo.

## Efectos

En el menú se elige el modo de efectos: **Sin efectos** (por defecto), **Solo power-ups**, **Solo eventos** o **Todo**.
Se aplica a la partida contra la máquina y, en línea, lo decide quien crea la sala. **Todos los números de esta sección
están en [`src/balance.js`](src/balance.js)**: cámbialos ahí y corre `npm test` (los tests usan esos mismos valores).

### Power-ups (orbes)

De vez en cuando (no antes de 6 s de partida, al menos 14 s entre uno y otro, y luego un 10 % de probabilidad por
segundo) aparece un orbe flotando sobre la mesa durante 10 s. **Lo recoge quien haga pasar la pelota por él** (el
último que la golpeó); el orbe no desvía la pelota.

| Orbe | Efecto | Para quién | Duración |
|---|---|---|---|
| 🏓 Paleta grande (verde) | Alcance de la paleta ×1.5 (la paleta y el aro guía se ven más grandes) | Quien lo recoge | 8 s |
| ⚡ Pelota rápida (amarillo) | Su siguiente devolución tarda 0.7 de lo normal en llegar | Quien lo recoge | 1 golpe |
| ❄ Congelado (azul) | La paleta del rival se mueve a 0.6 m/s como máximo y se tiñe de azul | El rival de quien lo recoge | 3 s |
| 💥 Cañonazo (rojo) | Su siguiente devolución sale muy rápida (×0.55 del tiempo) y apuntada al cuerpo del rival. Si el rival no la devuelve y la pelota llega al plano de su cuerpo, es **impacto** y punto para quien disparó; si sale fuera o da en la red, falla como cualquier golpe | Quien lo recoge | 1 golpe |

**Impacto de cañonazo:** el avatar del rival sale volando hacia atrás con una voltereta, cae, se queda un instante en
el piso y se levanta antes del siguiente saque (la pausa entre puntos se alarga 1 s). Si el impactado eres tú, la cámara
se sacude, gira un poco y destella, con sonido. El botón **"Movimiento: reducido"** quita la sacudida y el giro (por
defecto sigue la preferencia del sistema operativo). La animación se calcula en cada pantalla a partir del evento
(tipo y jugador); en línea el anfitrión decide el impacto y solo envía ese evento.

La máquina también los recoge (según la dificultad, a veces apunta su devolución para que pase por el orbe) y los
sufre igual que tú. La guía sigue siendo exacta: usa la misma física que la pelota.

### Eventos de mesa

Al empezar un punto (no en los 2 primeros de la partida y con al menos 3 puntos entre uno y otro) hay un 35 % de
probabilidad de que empiece un evento, que dura **3 puntos**. Solo hay uno a la vez y solo cambian entre puntos: la mesa
destella 0.9 s, aparece un aviso y nadie puede sacar hasta que termina la animación.

| Evento | Cambio | Margen comprobado por el test |
|---|---|---|
| ⇥ Mesa angosta | Ancho ×0.8 | Todo sigue válido de ×0.7 a ×1.3 (y se probó hasta ×0.6–×1.5) |
| ⇔ Mesa ancha | Ancho ×1.2 | Ídem |
| ⬆ Red alta | Altura ×1.5 (22.9 cm) | Los saques dejan de pasar con ×1.96; el test exige ≥ 20 % de margen |
| ⬇ Red baja | Altura ×0.5 (7.6 cm) | Válido de ×0.4 hacia arriba |

Al cambiar el ancho también se escalan los objetivos de golpe, los rangos de saque, las faltas intencionales de la
máquina (siguen cayendo fuera), la red (sobresale lo mismo de cada lado), las líneas, las patas y la zona de los orbes.

### Pendiente (TODO): otros eventos y qué habría que revalidar

- **Mesa corta / larga** (cambiar `HL`): el saque está validado con posiciones absolutas (`SERVE_Z` 1.45 y primer bote en
  `SERVE_Z1` 0.65) y el plano de golpeo `PZ` (1.55) debe quedar siempre detrás del final de la mesa. Habría que escalar
  `SERVE_Z`, `SERVE_Z1`, `PZ` (y con él la cámara y la proyección del puntero), la profundidad de los golpes
  (`DEPTH_MIN`/`DEPTH_RANGE`), la falta larga de la máquina (`AI_FAULT_Z` > `HL`), la zona de orbes (`ORB.Z0`/`Z1`) y
  el límite de "fuera" de `isOut`; y volver a barrer saques y devoluciones para cada largo.
- **Gravedad**: cambia el arco de todo. `serveVel` usa un tiempo fijo al primer bote (`SERVE_T1`), así que con otra
  gravedad cambian la altura del bote y el tiempo para devolver; `launchTo` y `predict` ya la leen de `P`. Habría que
  barrer saques (que sigan pasando la red y lleguen a una altura alcanzable entre `PAD_YMIN` y `PAD_YMAX`), devoluciones,
  la altura de los orbes y comprobar que la IA (`AI_YMAX`) sigue llegando.
- **Viento**: es un término nuevo de la física (aceleración lateral o longitudinal). Habría que añadirlo a `integrate`,
  `predict` (para que la guía siga siendo exacta) y a la extrapolación del invitado, decidir si `launchTo` lo compensa
  al apuntar (si no, muchas devoluciones caerían fuera), activarlo solo entre puntos, y barrer saques y devoluciones con
  cada intensidad y dirección permitida.

## Nombre de usuario

Para crear sala o unirse hay que escribir un nombre (2 a 16 letras o números; se guarda en este navegador). Se envía
al rival al conectar y aparece **sobre la cabeza del rival**, en el marcador y en un aviso "Juegas contra …". Se limpia
al escribirlo y al recibirlo (solo letras, números, espacio, `.`, `_` y `-`) y nunca se inserta como HTML. Contra la
máquina no hace falta.

- Todos los parámetros de juego se leen de **parámetros efectivos**: `P` (mundo, mesa, saque, golpes e IA, en
  `physics.js`) y `PP[i]` (por jugador: alcance, rapidez de sus devoluciones y tope de velocidad de su paleta, en
  `effects.js`). Sin efectos valen exactamente lo mismo que antes, y el juego se comporta igual.
- Cada efecto dura **golpes** (devoluciones de su dueño; el saque no cuenta), **segundos** (de juego; se detienen en
  pausa) o **puntos**. Los que duran puntos empiezan al comenzar el siguiente punto.
- Los **eventos de mesa** solo pueden durar puntos, así que solo cambian entre puntos, nunca con la pelota en juego.
  Al cambiar, la mesa destella 0.9 s y durante ese tiempo nadie puede sacar.
- La interfaz muestra chips con icono y tiempo restante (tuyos abajo a la izquierda, del rival arriba a la derecha y
  de mesa arriba a la izquierda) y un aviso cuando un efecto empieza o termina.
- **En línea** solo el anfitrión activa efectos. Las snapshots llevan el modo y la lista de efectos activos; el invitado
  la carga, recalcula `P`/`PP` (para dibujar y extrapolar con la misma física) y la dibuja. La versión de protocolo
  subió a 2: anfitrión e invitado deben tener la misma versión del juego.

## Tests

Requiere Node 20 o superior. No hay dependencias que instalar.

```sh
npm test
```

`test/physics.test.js` comprueba que los valores por defecto son los validados y corre los barridos de `test/sim.js`, que simulan
con el mismo paso (1/120 s) y las mismas funciones de `src/physics.js` que usa el juego, leyendo los rangos de `P`
(así sirven con efectos activos). Verifica:

- **Saques** (ambos lados, toda la franja de x de saque y de destino): botan primero en el lado de quien saca, luego en el contrario, pasan la red y llegan al plano de golpeo del receptor a una altura alcanzable, sin un segundo bote antes.
- **Devoluciones** del jugador y de la máquina (sin el ruido aleatorio ni las faltas intencionales de la IA): cruzan la red y botan primero dentro de la mesa contraria.

Los parámetros del saque (`t1 = 0.26`, `z1 = 0.65`, altura `SERVE_Y = 1.2`) están validados por este test: no los cambies sin volver a correrlo.

`test/game.test.js` prueba las reglas con los dos jugadores simétricos:

- **Simetría:** juega partidas completas y su espejo (papeles intercambiados, misma semilla aleatoria) y exige que la pelota sea el reflejo exacto en cada paso, con los mismos mensajes y el marcador invertido.
- El saque de un jugador remoto solo lo dispara su propia entrada; la máquina saca sola desde cualquier lado.
- Una partida máquina contra máquina termina con un marcador válido.

`test/physics.test.js` además barre **todas las combinaciones de power-ups** del registro: devoluciones de ambos lados con
cada combinación de quien golpea y saques con cada alcance de quien recibe; y comprueba que la pelota rápida de verdad
llega antes (como mucho 0.83 del tiempo normal, aun subiendo el arco para pasar la red).

`test/powerups.test.js` prueba el orbe (primer retraso, vida, separación mínima, posición sobre la mesa, sin orbes ni
azar extra cuando el modo no los permite), la recogida y quién recibe cada efecto, la paleta grande, la pelota rápida,
el congelado en humano y máquina, que la máquina recoge orbes y termina partidas válidas, y que la guía coincide con el
vuelo real con efectos activos.

Para los eventos de mesa, `test/physics.test.js` barre anchos (×0.7 a ×1.3) y alturas de red (×0.4 a ×1.6), busca por
bisección la altura de red en que los saques dejan de pasar y exige un 20 % de margen a la red alta, y prueba **cada
estado de mesa del registro con cada combinación de power-ups**. `test/events.test.js` prueba el registro, la espera
inicial, que solo haya uno a la vez, su duración, la espera entre eventos, el filtro por modo y partidas completas.

`test/effects.test.js` prueba el sistema de efectos con efectos de prueba: validación del registro, valores por defecto
exactos sin efectos, duraciones en segundos, golpes y puntos, composición y renovación, filtro por modo, que en una
partida la mesa solo cambie entre puntos, el bloqueo del saque durante la animación, el tope de velocidad, y la carga
saneada de la lista recibida por red.

## Estructura

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Marcado, carga de Three.js y PeerJS (scripts clásicos) y de `src/main.js` (módulo). |
| `style.css` | Estilos. |
| `src/physics.js` | Parámetros efectivos `P` (y sus `DEFAULTS`), `launchTo`, `serveVel`, `predict` y el paso de simulación (red, mesa, plano de golpeo). Sin DOM ni Three. |
| `src/effects.js` | Sistema de efectos: registro, efectos activos y pendientes, duraciones, cálculo de `P` y `PP[i]`, y lista para la red. |
| `src/powerups.js` | Los tres power-ups y el orbe: aparición, vida y detección de la pelota que pasa por él. |
| `src/events.js` | Los cuatro eventos de mesa (ancho y altura de red) y cuándo empiezan. |
| `src/balance.js` | Todos los números de los efectos (duraciones, probabilidades, multiplicadores) para ajustarlos sin tocar la lógica. |
| `src/game.js` | Estado de la partida, reglas, golpes, saque y puntos. Dos jugadores simétricos (`PL[0]` en z > 0, `PL[1]` en z < 0) con control `local`, `ia` o `remoto`. Sin DOM: avisa a la interfaz mediante `out`. |
| `src/ai.js` | Dificultades y comportamiento de la máquina (para cualquier lado de la mesa). |
| `src/render.js` | Escena Three.js (girada 180° para el jugador 1) y proyección del puntero al plano de la paleta. |
| `src/input.js` | Teclado, puntero y gamepad. |
| `src/ui.js` | Menús, marcador, mensajes y botones. |
| `src/texts.js` | Textos de los mensajes y avisos de efectos desde el punto de vista de cada jugador, y limpieza del nombre de usuario. |
| `src/net.js` | Transporte P2P (lo único que conoce PeerJS): `crearSala`, `unirse`, `enviar`, `onMensaje`, `onEvento`, `cerrar`. |
| `src/online.js` | Protocolo en línea: anfitrión autoritativo, entrada del invitado, snapshots, ping, revancha y desconexión. |
| `src/audio.js` | Efectos de sonido (Web Audio). |
| `src/util.js` | `clamp` y `rnd`. |
| `src/main.js` | Punto de entrada: conecta los módulos y corre el bucle de paso fijo (120 Hz). |

## Dependencias por CDN

- **Three.js r128** (`cdnjs`, con `integrity` SRI). Es la versión con la que se desarrolló y validó el juego;
  la build global `three.min.js` que usa este proyecto está marcada como obsoleta desde r150 y ya no se
  publica desde r161, y cambiar de versión (sobre todo r155+, que cambió la iluminación) podría alterar
  cómo se ve el juego, así que se mantiene fija.
- **PeerJS 1.5.5** (`cdnjs`, con `integrity` SRI). Última versión estable (publicada el 7 de junio de 2025);
  la rama 2.0 sigue en beta. Expone `window.Peer` sin build y trae la configuración por defecto del servidor
  público de señalización. Si no carga, el modo contra la máquina sigue funcionando.

## Controles

Mouse, dedo, WASD/flechas o gamepad para mover la paleta. Clic, toque, Espacio o botón A para sacar y golpear fuerte.
P/Esc pausa (no en línea), M sonido, G guía.

## Publicar en GitHub Pages

El sitio es estático, así que GitHub Pages lo sirve tal cual (con HTTPS, que WebRTC necesita fuera de `localhost`).
El workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) corre `npm test` en cada push y pull request,
y **solo si pasan** publica `index.html`, `style.css` y `src/` desde la rama `main`.

1. **Crear el repositorio** en GitHub (por ejemplo `ping-pong-3d`), vacío: sin README, licencia ni `.gitignore`.
   Con GitHub Free, Pages solo funciona en repositorios **públicos**; en privados requiere un plan de pago.
2. **Subir el código** desde esta carpeta:
   ```sh
   git init -b main
   git add .
   git commit -m "Ping-pong 3D"
   git remote add origin https://github.com/<usuario>/<repo>.git
   git push -u origin main
   ```
   La primera vez, Git Credential Manager abre el navegador para iniciar sesión en GitHub.
3. **Activar Pages con Actions:** en el repo, *Settings → Pages → Build and deployment → Source: GitHub Actions*.
4. **Desplegar:** si el primer workflow corrió antes del paso 3, vuelve a lanzarlo en *Actions → Tests y despliegue a Pages → Run workflow*.
5. El juego queda en `https://<usuario>.github.io/<repo>/` (la URL también aparece en el resumen del workflow).

El workflow tiene tres jobs: `test`, `build` (prepara y sube el sitio) y `deploy` (solo publica). Si falla únicamente
la publicación, basta con *Re-run failed jobs*: se repite `deploy` sin volver a subir el sitio.

**Permisos del workflow:** por defecto el token solo lee el código (`contents: read`). Únicamente el job `deploy` pide
`pages: write` (publicar) e `id-token: write` (token OIDC con el que `deploy-pages` demuestra que el despliegue viene
de este repo). Los pull requests ejecutan los tests pero nunca despliegan. El entorno `github-pages` lo crea GitHub y, por
defecto, solo acepta despliegues de `main`. Las acciones están fijadas a un commit (SHA) con su versión en un comentario;
para actualizarlas, cambia el SHA por el de la nueva versión.

## Limitaciones y riesgos

- **Servidor de señalización público de PeerJS** (`0.peerjs.com`): gratuito y sin garantías de disponibilidad ni de
  servicio. Si está caído o saturado, no se pueden crear salas ni unirse (las partidas ya conectadas siguen, porque los
  datos van directo). El juego muestra "No se pudo conectar". Alternativa futura: alojar un servidor PeerJS propio.
- **Redes que bloquean WebRTC o con NAT estricto:** redes corporativas, escolares o algunas móviles pueden impedir la
  conexión directa. PeerJS trae por defecto servidores TURN públicos (`eu-0`/`us-0.turn.peerjs.com`) que pueden
  retransmitir el tráfico, pero tampoco tienen garantías. Si falla, se ve "Tiempo agotado". Un TURN propio
  o de pago lo resolvería, pero implica un servidor o un servicio externo.
- **Exposición de IP:** WebRTC intercambia candidatos de red, así que **cada jugador puede ver la IP pública del otro**
  (y el servidor de señalización y, si se usa, el TURN también la ven). Juega solo con gente de confianza.
- **El código de sala no es secreto fuerte:** son 4 letras (23⁴ ≈ 280 000 combinaciones). Alguien podría adivinar uno
  activo y entrar antes que tu amigo. La sala acepta un solo invitado y rechaza al resto con "Sala llena".
- **Latencia en el golpe:** el anfitrión decide todo. El invitado ve su paleta al instante, pero si golpea o no
  lo resuelve el anfitrión con su posición más reciente, así que con ~100 ms de ping el invitado puede sentir el golpe
  tardío o fallar por poco. El anfitrión juega sin latencia: tiene ventaja.
- **Confianza en el anfitrión:** el anfitrión valida al invitado, pero nadie valida al anfitrión; con el código
  modificado podría hacer trampa. Es un juego entre amigos, no hay árbitro.
- **Pestaña del anfitrión en segundo plano:** el navegador detiene el bucle del juego y la partida se congela para ambos.
  Si no llegan datos en 6 s, el invitado vuelve al menú con "Se perdió la conexión".
- **Canal "no fiable":** PeerJS 1.5.5 crea el canal sin orden pero con retransmisiones (no permite ajustar
  `maxRetransmits`). Se descartan paquetes viejos por número de secuencia, pero no es UDP puro.
- **Dependencias externas en tiempo de ejecución:** cdnjs (Three.js, PeerJS, con SRI) y Google Fonts. Si no cargan,
  el juego no arranca (Three.js) o el modo en línea queda desactivado (PeerJS). Google Fonts recibe la IP de quien abre la página.
- **Versiones distintas:** si cada jugador tiene una versión diferente (caché), la conexión se rechaza con
  "Versiones distintas"; basta con recargar.
- **No probado fuera de la máquina de desarrollo:** la conexión se probó con dos navegadores en el mismo equipo
  (ping de 2 a 6 ms). No se ha medido con latencia real de internet, NAT estricto, táctil o gamepad en línea.
