// Escena Three.js. Three se carga como script clásico (global THREE) desde index.html.
import { P, DEFAULTS, predict } from "./physics.js";
import { PP, FX, TABLE_ANIM, getDef } from "./effects.js";
import { ORB } from "./powerups.js";
import { clamp } from "./util.js";

// Devuelve { render(S, B, PL, me), project(nx, ny, planeZ) } o null si no hay Three/WebGL.
export function createRenderer(canvas, stage) {
  var THREE = window.THREE;
  if (typeof THREE === "undefined") return null;

  var renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); }
  catch (err) { return null; }

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe4f7);
  scene.fog = new THREE.Fog(0xcfe4f7, 12, 30);
  var camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 60);
  camera.position.set(0, 1.55, 3.45);
  camera.lookAt(0, 0.8, -0.7);
  // La mesa y todo lo del juego cuelgan de `world`; para el jugador 1 se gira 180° (x -> -x, z -> -z) y así
  // su cámara y la proyección del puntero son las mismas que las del jugador 0. La sala (suelo, paredes,
  // carteles) y las luces quedan fuera para que ambos vean la misma sala desde su lado.
  var world = new THREE.Group();
  scene.add(world);
  var ndc = new THREE.Vector2();
  var ray = new THREE.Raycaster();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa7bd, 0.95));
  var sun = new THREE.DirectionalLight(0xffffff, 0.55);
  sun.position.set(2, 6, 4);
  scene.add(sun);

  function mat(c, o) { var m = new THREE.MeshLambertMaterial({ color: c }); if (o !== undefined) { m.transparent = true; m.opacity = o; } return m; }
  function box(w, h, d, c, x, y, z, parent) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.set(x, y, z); (parent || world).add(m); return m;
  }

  // sala
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat(0xb98b5a));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  var mats = new THREE.Mesh(new THREE.PlaneGeometry(7, 10), mat(0x1f3b52));
  mats.rotation.x = -Math.PI / 2; mats.position.y = 0.004; scene.add(mats);
  box(24, 8, 0.2, 0xf1e9da, 0, 4, -7.5, scene);
  box(0.2, 8, 20, 0xe8dfcc, -9, 4, 0, scene);
  box(0.2, 8, 20, 0xe8dfcc, 9, 4, 0, scene);
  box(3.2, 0.9, 0.05, 0xd7263d, -3, 3.4, -7.35, scene);
  box(3.2, 0.9, 0.05, 0xffb020, 0, 3.4, -7.35, scene);
  box(3.2, 0.9, 0.05, 0x2a6fdb, 3, 3.4, -7.35, scene);

  // mesa y red: se construyen desde P y se reconstruyen cuando un efecto cambia su geometría (FX.tableVer).
  // Las medidas se escriben como "valor original + (P - DEFAULTS)" para que, sin efectos, sean idénticas.
  var table = null, tableTop = null, tableVer = -1, flash = 0, lastT = 0;
  function buildTable() {
    if (table) {
      world.remove(table);
      table.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    table = new THREE.Group();
    var D = DEFAULTS, TOPY = P.TOPY, HW = P.HW, HL = P.HL, NETW = P.NETW;
    var dW = HW - D.HW, dL = HL - D.HL, dN = P.NET_H - D.NET_H;
    tableTop = box(HW * 2, 0.04, HL * 2, 0x2a6fdb, 0, TOPY - 0.02, 0, table);
    var lineY = TOPY + 0.002;
    box(HW * 2, 0.003, 0.02, 0xffffff, 0, lineY, HL - 0.01, table);
    box(HW * 2, 0.003, 0.02, 0xffffff, 0, lineY, -HL + 0.01, table);
    box(0.02, 0.003, HL * 2, 0xffffff, -HW + 0.01, lineY, 0, table);
    box(0.02, 0.003, HL * 2, 0xffffff, HW - 0.01, lineY, 0, table);
    box(0.006, 0.003, HL * 2, 0xffffff, 0, lineY, 0, table);
    var lx = 0.68 + dW, lz = 1.25 + dL;
    [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].forEach(function (p) {
      box(0.06, TOPY - 0.04, 0.06, 0x333a4d, p[0], (TOPY - 0.04) / 2, p[1], table);
    });
    // red
    var net = new THREE.Mesh(new THREE.PlaneGeometry(NETW * 2, P.NET_H), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    net.position.set(0, TOPY + 0.076 + dN / 2, 0); table.add(net);
    box(NETW * 2, 0.012, 0.012, 0xffffff, 0, P.NET_TOP, 0, table);
    box(0.02, 0.17 + dN, 0.02, 0x333a4d, -NETW, TOPY + 0.085 + dN / 2, 0, table);
    box(0.02, 0.17 + dN, 0.02, 0x333a4d, NETW, TOPY + 0.085 + dN / 2, 0, table);
    world.add(table);
  }
  buildTable(); tableVer = FX.tableVer;

  // pelota y sombra
  var ballMesh = new THREE.Mesh(new THREE.SphereGeometry(P.R * 1.25, 20, 16), new THREE.MeshLambertMaterial({ color: 0xff9a1f, emissive: 0x552200 }));
  world.add(ballMesh);
  var shadow = new THREE.Mesh(new THREE.CircleGeometry(P.R * 1.6, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
  shadow.rotation.x = -Math.PI / 2; world.add(shadow);

  // paletas
  function makePaddle(bladeColor, rimColor, opacity) {
    var g = new THREE.Group();
    var blade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.014, 28), mat(bladeColor, opacity));
    blade.rotation.x = Math.PI / 2; g.add(blade);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.007, 8, 32), mat(rimColor, opacity));
    g.add(rim);
    var handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.02), mat(0xc79a62));
    handle.position.y = -0.2; g.add(handle);
    world.add(g);
    return g;
  }
  var myPaddle = makePaddle(0xe03045, 0xffd3d9, 0.8);   // la de quien mira (semitransparente)
  var rivalPaddle = makePaddle(0x15151d, 0xd9dde8, 1);
  myPaddle.userData.color = 0xe03045; rivalPaddle.userData.color = 0x15151d;

  // orbe de power-up: esfera translúcida del color del efecto, con su icono dentro (sprite dibujado en un canvas)
  var orbGroup = new THREE.Group();
  var orbShell = new THREE.Mesh(new THREE.SphereGeometry(ORB.R, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
  orbGroup.add(orbShell);
  orbGroup.visible = false; world.add(orbGroup);
  var orbIcons = {}, orbIcon = null;
  function iconSprite(kind) {
    if (orbIcons[kind]) return orbIcons[kind];
    var def = getDef(kind), c = document.createElement("canvas");
    c.width = c.height = 128;
    var g = c.getContext("2d");
    g.fillStyle = def.color; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
    g.lineWidth = 8; g.strokeStyle = "#ffffff"; g.stroke();
    g.font = "64px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#14182c";
    g.fillText(def.icon, 64, 70);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false }));
    sp.scale.setScalar(ORB.R * 1.25);
    orbIcons[kind] = sp;
    return sp;
  }

  // rival
  var rival = new THREE.Group();
  var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.62, 16), mat(0xffcc33)); torso.position.y = 1.0; rival.add(torso);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), mat(0xf2c9a0)); head.position.y = 1.47; rival.add(head);
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.175, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd7263d)); cap.position.y = 1.5; rival.add(cap);
  var legL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 10), mat(0x2d3350)); legL.position.set(-0.1, 0.35, 0); rival.add(legL);
  var legR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 10), mat(0x2d3350)); legR.position.set(0.1, 0.35, 0); rival.add(legR);
  rival.position.z = -2.4;
  world.add(rival);

  // nombre del rival sobre su cabeza (solo en línea): texto dibujado en un canvas, nunca HTML
  var nameTag = null, nameTagText = "";
  function setNameTag(text) {
    if (text === nameTagText) return;
    nameTagText = text;
    if (nameTag) { rival.remove(nameTag); nameTag.material.map.dispose(); nameTag.material.dispose(); nameTag = null; }
    if (!text) return;
    var c = document.createElement("canvas"), g = c.getContext("2d"), font = "700 56px 'Bricolage Grotesque', system-ui, sans-serif";
    g.font = font;
    var w = Math.ceil(g.measureText(text).width) + 56;
    c.width = w; c.height = 96;
    g.font = font;
    g.fillStyle = "rgba(10, 14, 32, 0.78)";
    g.beginPath(); g.moveTo(24, 8); g.arcTo(w - 8, 8, w - 8, 88, 24); g.arcTo(w - 8, 88, 8, 88, 24); g.arcTo(8, 88, 8, 8, 24); g.arcTo(8, 8, w - 8, 8, 24); g.fill();
    g.fillStyle = "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, w / 2, 50);
    var tex = new THREE.CanvasTexture(c);
    nameTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false }));
    nameTag.renderOrder = 11;
    nameTag.scale.set(0.34 * w / 96, 0.34, 1);
    nameTag.position.y = 1.98;
    rival.add(nameTag);
  }
  var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 10), mat(0xf2c9a0));
  world.add(arm);

  // guía: aro donde llegará la pelota
  var ring = new THREE.Mesh(new THREE.TorusGeometry(DEFAULTS.REACH, 0.011, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthTest: false }));
  ring.renderOrder = 10; ring.position.z = P.PZ; ring.visible = false; world.add(ring);

  var UP = new THREE.Vector3(0, 1, 0), tv = new THREE.Vector3();
  function link(mesh, ax, ay, az, bx, by, bz) {
    tv.set(bx - ax, by - ay, bz - az);
    var len = tv.length();
    mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(UP, tv.normalize());
  }

  function swingFactor(t) { return t > 0 ? Math.sin(Math.PI * (1 - t / 0.25)) : 0; }

  // Escala visual del alcance del jugador i (1 sin efectos): la paleta y el aro guía crecen con él.
  function reachScale(i) { return P.REACH * PP[i].reachMul / DEFAULTS.REACH; }

  // Paleta del jugador pl en su lado (side = ±1); al golpear avanza hacia la red.
  function placePaddle(mesh, pl) {
    var sf = swingFactor(pl.swing), s = pl.side;
    mesh.position.set(pl.x, pl.y, s * (P.PZ - sf * 0.28));
    mesh.rotation.set(-s * sf * 0.9, 0, pl.ctrl === "ia" ? -pl.x * 0.1 : -pl.vx * 0.05);
    mesh.scale.setScalar(reachScale(pl.i));
    // congelado (tope de velocidad): la pala se tiñe de azul hielo
    mesh.children[0].material.color.setHex(PP[pl.i].speedCap < Infinity ? 0x8fd3ff : mesh.userData.color);
    return sf;
  }

  // PL: los dos jugadores; me: índice de quien mira esta pantalla.
  function render(S, B, PL, me) {
    var mine = PL[me], other = PL[1 - me];
    world.rotation.y = mine.side > 0 ? 0 : Math.PI;

    // mesa: si cambió su geometría, se reconstruye y destella brevemente (TABLE_ANIM; mientras, no se puede sacar)
    var t = performance.now() / 1000, dt = lastT ? Math.min(0.1, t - lastT) : 0;
    lastT = t;
    if (tableVer !== FX.tableVer) { tableVer = FX.tableVer; buildTable(); flash = TABLE_ANIM; }
    if (flash > 0) {
      flash = Math.max(0, flash - dt);
      tableTop.material.emissive.setHex(0xffffff);
      tableTop.material.emissiveIntensity = 0.45 * Math.abs(Math.sin(flash / TABLE_ANIM * Math.PI * 3));
    }

    // pelota
    var showBall = S.mode !== "menu" && S.mode !== "over";
    ballMesh.visible = showBall; shadow.visible = showBall;
    ballMesh.position.set(B.x, B.y, B.z);
    var overTable = Math.abs(B.x) <= P.HW && Math.abs(B.z) <= P.HL && B.y > P.TOPY;
    var sy = overTable ? P.TOPY + 0.004 : 0.008;
    shadow.position.set(B.x, sy, B.z);
    var hgt = Math.max(0.05, B.y - sy);
    shadow.scale.setScalar(clamp(1.3 - hgt * 0.5, 0.5, 1.3));

    // paletas
    placePaddle(myPaddle, mine);
    var sa = placePaddle(rivalPaddle, other);

    // rival: de frente a la red, con el brazo hasta su paleta
    var os = other.side;
    rival.position.set(other.x * 0.55, 0, os * 2.4);
    rival.rotation.y = os > 0 ? Math.PI : 0;
    setNameTag(S.online && S.rivalName && S.mode !== "menu" ? S.rivalName : "");
    link(arm, rival.position.x - os * 0.22, 1.2, rival.position.z - os * 0.05, other.x, other.y - 0.05, os * (P.PZ - sa * 0.28));

    // orbe: flota con un leve vaivén (solo visual; la recogida usa su posición exacta)
    if (S.orb && S.mode !== "menu" && S.mode !== "over") {
      var icon = iconSprite(S.orb.kind);
      if (icon !== orbIcon) { if (orbIcon) orbGroup.remove(orbIcon); orbGroup.add(icon); orbIcon = icon; }
      orbShell.material.color.set(getDef(S.orb.kind).color);
      orbShell.material.opacity = 0.28 + 0.1 * Math.sin(t * 4);
      orbGroup.position.set(S.orb.x, S.orb.y + 0.015 * Math.sin(t * 2.5), S.orb.z);
      orbGroup.visible = true;
    } else orbGroup.visible = false;

    // guía: dónde cruzará la pelota el plano de golpeo de quien mira
    var showGuide = false, pz = mine.side * P.PZ;
    if (S.guide && B.live && B.vz * mine.side > 0 && (S.mode === "play")) {
      var pr = predict(B.x, B.y, B.z, B.vx, B.vy, B.vz, pz);
      if (pr) { ring.position.set(pr.x, pr.y, pz); ring.scale.setScalar(reachScale(me)); showGuide = true; }
    }
    ring.visible = showGuide;

    // cámara
    renderer.render(scene, camera);
  }

  // Punto donde el rayo de cámara por (nx, ny) [0..1 en el canvas] corta el plano z = planeZ, o null.
  // Coordenadas en el marco de quien mira (antes de girar `world`).
  function project(nx, ny, planeZ) {
    ndc.set(nx * 2 - 1, -(ny * 2 - 1));
    ray.setFromCamera(ndc, camera);
    var o = ray.ray.origin, d = ray.ray.direction;
    if (Math.abs(d.z) < 1e-6) return null;
    var t = (planeZ - o.z) / d.z;
    return { x: o.x + d.x * t, y: o.y + d.y * t };
  }

  function resize() {
    var r = stage.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1.5 ? 68 : 52;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  resize();

  return { render: render, project: project };
}
