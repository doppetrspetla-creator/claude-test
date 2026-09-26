/* LightLab – 3D pohled kamery (Three.js). Půdorys (x,y) → 3D (x, výška, z). */
(function () {
'use strict';
const THREE = window.THREE_LIB.THREE, OrbitControls = window.THREE_LIB.OrbitControls, RectAreaLightUniformsLib = window.THREE_LIB.RectAreaLightUniformsLib;
const S = window.LightSim;
RectAreaLightUniformsLib.init();

let renderer, scene3, camera, orbitCam, controls, wrap, canvas, group, floorRing, orbit = false, camMesh;
let lastScene = null, lastRes = null, lastOpts = {}, selId = null, dirty = false;

function lum(color, nits) { return new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(nits), toneMapped: true }); }
function col3(c) { return new THREE.Color(c[0], c[1], c[2]); }
function kel(k) { const c = S.cctColor(k); const m = Math.max(c[0], c[1], c[2]); return { color: new THREE.Color(c[0] / m, c[1] / m, c[2] / m), gain: m }; }

const MAT = {
  skin: new THREE.MeshStandardMaterial({ color: 0xd9b597, roughness: 0.65 }),
  hair: new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.85 }),
  cloth: new THREE.MeshStandardMaterial({ color: 0x3b3f4a, roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 }),
  flag: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.DoubleSide }),
  wood: new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.85 }),
  gold: new THREE.MeshBasicMaterial({ color: 0xd4b071 })
};
const WALLCOL = { dark: 0x2a2724, normal: 0x8c8378, white: 0xd8d3c8 };
const FLOORCOL = { wood: 0x6b4a2f, grey: 0x5a5a5a, dark: 0x1f1d1b };

function init(cv) {
  canvas = cv; wrap = cv.parentElement;
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene3 = new THREE.Scene(); scene3.background = new THREE.Color(0x000000);
  camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
  orbitCam = new THREE.PerspectiveCamera(50, 1, 0.05, 80);
  controls = new OrbitControls(orbitCam, cv); controls.enabled = false; controls.enableDamping = true;
  controls.addEventListener('change', () => { dirty = true; });
  group = new THREE.Group(); scene3.add(group);
  floorRing = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.26, 40), MAT.gold); floorRing.rotation.x = -Math.PI / 2; floorRing.visible = false; scene3.add(floorRing);
  resize();
  (function loop() { requestAnimationFrame(loop); if (orbit) controls.update(); if (dirty) { dirty = false; render(); } })();
}

function resize() {
  if (!renderer) return;
  const r = wrap.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
  renderer.setSize(r.width, r.height, false); canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
  camera.aspect = orbitCam.aspect = r.width / r.height; camera.updateProjectionMatrix(); orbitCam.updateProjectionMatrix(); dirty = true;
}

function clear(g) { while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } }

function stand(x, z, h, g) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h, 8), MAT.metal); pole.position.set(x, h / 2, z); g.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.02, 12), MAT.metal); base.position.set(x, 0.01, z); g.add(base);
}

function addLight(L, res) {
  const P = S.lightParams(L); if (L.on === false) return;
  const k = kel(P.cct), dir = new THREE.Vector3(Math.cos(L.rot), 0, Math.sin(L.rot));
  const pos = new THREE.Vector3(L.x, P.h, L.y);
  // cíl: 2 m před světlem ve výšce obličeje (světla se mírně sklánějí)
  const tgt = pos.clone().add(dir.clone().multiplyScalar(2.2)); tgt.y = S.FACE_Z;
  const g = new THREE.Group(); group.add(g);
  const E1 = P.E1 * k.gain;
  if (P.omni) {
    const pl = new THREE.PointLight(k.color, E1, 12, 2); pl.position.copy(pos); pl.castShadow = !!lastOpts.shadows; pl.shadow.mapSize.set(512, 512); pl.shadow.bias = -0.002; g.add(pl);
    if (L.mod === 'tube') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 12), lum(k.color, E1 / 0.15));
      m.position.copy(pos); m.rotation.z = Math.PI / 2; m.rotation.y = -(L.rot + Math.PI / 2); g.add(m); stand(L.x, L.y, P.h, g);
    } else if (L.mod === 'practical') {
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.2, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, emissive: k.color, emissiveIntensity: E1 * 1.5, side: THREE.DoubleSide, roughness: 1 }));
      shade.position.copy(pos); g.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), lum(k.color, E1 * 40)); bulb.position.copy(pos); g.add(bulb);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, P.h - 0.1, 6), MAT.metal); pole.position.set(L.x, (P.h - 0.1) / 2, L.y); g.add(pole);
    } else {
      const m = new THREE.Mesh(new THREE.SphereGeometry(P.size / 2, 16, 12), lum(k.color, E1 / (Math.PI * P.size * P.size / 4))); m.position.copy(pos); g.add(m); stand(L.x, L.y, P.h, g);
    }
    return;
  }
  const w = P.size, h = P.size * (L.mod === 'frame' ? 1.0 : 0.75);
  if (P.soft) {
    const rl = new THREE.RectAreaLight(k.color, E1 * (lastOpts.shadows ? 0.6 : 1) / (w * h), w, h); rl.position.copy(pos); rl.lookAt(tgt); g.add(rl);
    // vizuální panel softboxu
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lum(k.color, E1 / (w * h)));
    panel.position.copy(pos); panel.lookAt(tgt); panel.position.add(dir.clone().multiplyScalar(-0.01)); g.add(panel);
    const back = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, h) * 0.55, 0.45, 4, 1, true), MAT.flag);
    back.position.copy(pos).add(dir.clone().multiplyScalar(-0.22)); back.lookAt(tgt); back.rotateX(-Math.PI / 2); g.add(back);
    // slabé stínové světlo, aby softbox také vrhal (měkký) stín
    if (lastOpts.shadows) { const sp = new THREE.SpotLight(k.color, E1 * 0.4, 14, P.beam / 2 * Math.PI / 180, 0.9, 2); sp.position.copy(pos); sp.target.position.copy(tgt); sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -0.002; sp.shadow.radius = 8; g.add(sp); g.add(sp.target); }
  } else {
    const half = P.beam / 2 * Math.PI / 180;
    const sp = new THREE.SpotLight(k.color, E1, 16, Math.min(half * 1.3, 1.5), L.barn ? 0.15 : (L.diff ? 0.8 : 0.45), 2);
    sp.position.copy(pos); sp.target.position.copy(tgt); sp.castShadow = !!lastOpts.shadows; sp.shadow.mapSize.set(2048, 2048); sp.shadow.bias = -0.0015; sp.shadow.radius = L.diff ? 6 : 2; g.add(sp); g.add(sp.target);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.22, 16), MAT.metal); body.position.copy(pos); body.lookAt(tgt); body.rotateX(-Math.PI / 2); g.add(body);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), lum(k.color, E1 / 0.018)); face.position.copy(pos).add(dir.clone().multiplyScalar(0.115)); face.lookAt(tgt); g.add(face);
    if (L.diff) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), lum(k.color, E1 / 0.35)); d.material.transparent = true; d.material.opacity = 0.7; d.material.side = THREE.DoubleSide; d.position.copy(pos).add(dir.clone().multiplyScalar(0.18)); d.lookAt(tgt); g.add(d); }
  }
  stand(L.x, L.y, P.h, g);
}

function limb(mat, r, len, g, x, y, z, rx, rz) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 10), mat); m.position.set(x, y, z); m.rotation.set(rx || 0, 0, rz || 0); m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
function addPerson(p) {
  const g = new THREE.Group(); g.position.set(p.x, 0, p.y); g.rotation.y = -p.rot; group.add(g);
  const sit = p.pose === 'sit', fz = S.faceZ(p);
  const shoulder = sit ? 1.02 : 1.38, hip = sit ? 0.5 : 0.85;
  // trup
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, shoulder - hip - 0.1, 4, 14), MAT.cloth); torso.position.y = (shoulder + hip) / 2; torso.scale.set(1, 1, 1.45); torso.castShadow = torso.receiveShadow = true; g.add(torso);
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.34), MAT.cloth); pelvis.position.y = hip; pelvis.castShadow = true; g.add(pelvis);
  // ramena + paže (osa Y = dolů/nahoru; local +x = dopředu, ±z = do stran)
  [-1, 1].forEach(side => {
    const z = side * 0.2;
    if (sit) {
      // nadloktí dolů, předloktí dopředu na stehna
      limb(MAT.cloth, 0.045, 0.24, g, 0.02, shoulder - 0.15, z, 0, 0.15);
      limb(MAT.skin, 0.04, 0.22, g, 0.16, shoulder - 0.3, z, 0, Math.PI / 2 - 0.1);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), MAT.skin); hand.position.set(0.3, shoulder - 0.3, z); g.add(hand);
      // stehno dopředu, bérec dolů
      limb(MAT.cloth, 0.07, 0.3, g, 0.2, hip - 0.02, side * 0.1, 0, Math.PI / 2);
      limb(MAT.cloth, 0.055, 0.32, g, 0.4, hip - 0.25, side * 0.1, 0, 0.1);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.09), MAT.hair); foot.position.set(0.47, 0.03, side * 0.1); g.add(foot);
    } else {
      limb(MAT.cloth, 0.045, 0.26, g, 0, shoulder - 0.17, z + side * 0.03, 0, side * 0.06);
      limb(MAT.skin, 0.04, 0.24, g, 0.02, shoulder - 0.45, z + side * 0.05, 0, 0);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), MAT.skin); hand.position.set(0.03, shoulder - 0.62, z + side * 0.05); g.add(hand);
      limb(MAT.cloth, 0.07, 0.32, g, 0, hip - 0.22, side * 0.1, 0, 0);
      limb(MAT.cloth, 0.055, 0.3, g, 0, hip - 0.6, side * 0.1, 0, 0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.09), MAT.hair); foot.position.set(0.05, 0.03, side * 0.1); g.add(foot);
    }
  });
  // krk + hlava
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 10), MAT.skin); neck.position.y = shoulder + 0.03; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 18), MAT.skin); head.position.y = fz; head.scale.set(0.92, 1.12, 1); head.castShadow = head.receiveShadow = true; g.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.118, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.40), MAT.hair); cap.position.set(-0.02, fz + 0.012, 0); cap.scale.set(0.95, 1.12, 1.02); cap.castShadow = true; g.add(cap);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 8), MAT.skin); nose.position.set(0.105, fz - 0.01, 0); nose.rotation.z = -Math.PI / 2; nose.castShadow = true; g.add(nose);
  [-0.04, 0.04].forEach(z => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), MAT.hair); e.position.set(0.1, fz + 0.03, z); g.add(e); });
  [-0.11, 0.11].forEach(z => { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), MAT.skin); ear.position.set(0, fz, z); g.add(ear); });
  if (sit) chairMesh(g, 0.02, 0);
}
// jednoduchá židle (sedák 0,45 m, opěradlo vzadu = -x)
function chairMesh(g, x, z) {
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.45), MAT.wood); seat.position.set(x, 0.45, z); seat.castShadow = seat.receiveShadow = true; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.45), MAT.wood); back.position.set(x - 0.2, 0.7, z); back.castShadow = true; g.add(back);
  [[-0.2, -0.2], [-0.2, 0.2], [0.2, -0.2], [0.2, 0.2]].forEach(o => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.45, 0.035), MAT.wood); l.position.set(x + o[0], 0.225, z + o[1]); g.add(l); });
}
function addBounce(b, res) {
  const g = new THREE.Group(); g.position.set(b.x, 0, b.y); g.rotation.y = -b.rot; group.add(g);
  const mat = new THREE.MeshStandardMaterial({ color: b.black ? 0x050505 : (b.silver ? 0xc9ccd1 : 0xf4f1e8), roughness: b.silver ? 0.3 : 1, metalness: b.silver ? 0.6 : 0, side: THREE.DoubleSide });
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(b.len, 1.0), mat); pl.position.y = 1.5; pl.castShadow = pl.receiveShadow = true; g.add(pl);
  stand(0, 0, 1.0, g);
  const em = res && res.ems.find(e => e.bounce && e.id === b.id);
  if (em && !b.black) {
    const rl = new THREE.RectAreaLight(col3(em.col), em.E1 / (b.len * 1.0), b.len, 1.0);
    rl.position.set(b.x + em.nx * 0.03, 1.5, b.y + em.ny * 0.03); rl.lookAt(b.x + em.nx * 2, 1.5, b.y + em.ny * 2); group.add(rl);
  }
}

function box(g, mat, w, h, d, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
function addFurniture(it) {
  const g = new THREE.Group(); g.position.set(it.x, 0, it.y); g.rotation.y = -(it.rot || 0); group.add(g);
  const f = S.FURNITURE[it.type] || S.FURNITURE.block, w = it.w || f.w, d = it.d || f.d, t = it.type;
  const fabric = new THREE.MeshStandardMaterial({ color: 0x4b5568, roughness: 1 }), bedding = new THREE.MeshStandardMaterial({ color: 0xd9d4c7, roughness: 1 });
  if (t === 'sofa' || t === 'armchair') {
    box(g, fabric, w, 0.42, d, 0, 0.21, 0);                       // sedák
    box(g, fabric, 0.22, 0.85, d, -w / 2 + 0.11, 0.425, 0);        // opěradlo (vzadu = -x)
    box(g, fabric, w, 0.6, 0.18, 0, 0.3, -d / 2 + 0.09);           // područky
    box(g, fabric, w, 0.6, 0.18, 0, 0.3, d / 2 - 0.09);
  } else if (t === 'chair') { chairMesh(g, 0, 0); }
  else if (t === 'table' || t === 'coffee') {
    const h = f.h; box(g, MAT.wood, w, 0.04, d, 0, h - 0.02, 0);
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(o => box(g, MAT.wood, 0.05, h - 0.04, 0.05, o[0] * (w / 2 - 0.05), (h - 0.04) / 2, o[1] * (d / 2 - 0.05)));
  } else if (t === 'bed') {
    box(g, MAT.wood, w, 0.25, d, 0, 0.125, 0); box(g, bedding, w - 0.04, 0.22, d - 0.04, 0, 0.36, 0);
    box(g, MAT.wood, 0.05, 0.9, d, -w / 2 + 0.025, 0.45, 0);        // čelo (vzadu = -x)
    box(g, bedding, 0.45, 0.12, d * 0.4, -w / 2 + 0.35, 0.53, 0);   // polštář
  } else if (t === 'wardrobe') {
    box(g, MAT.wood, w, f.h, d, 0, f.h / 2, 0);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.005, f.h - 0.1, 0.01), MAT.hair); line.position.set(w / 2 + 0.003, f.h / 2, 0); g.add(line);
  } else if (t === 'shelf') {
    box(g, MAT.wood, w, f.h, 0.03, 0, f.h / 2, -d / 2 + 0.015);
    [0.03, 0.4, 0.8, 1.2, 1.6, f.h - 0.03].forEach(y => box(g, MAT.wood, w, 0.03, d, 0, y, 0));
    box(g, MAT.wood, 0.03, f.h, d, -w / 2 + 0.015, f.h / 2, 0); box(g, MAT.wood, 0.03, f.h, d, w / 2 - 0.015, f.h / 2, 0);
  } else { const hh = it.tall ? 2.0 : 0.75; box(g, MAT.wood, w, hh, d, 0, hh / 2, 0); }
}

function addWindow(sc) {
  const w = sc.window; if (!w || !w.on) return;
  const sk = S.SKY[w.sky] || S.SKY.overcast, k = kel(sk.cct), len = w.to - w.from, mid = (w.from + w.to) / 2, W = sc.room.w, H = sc.room.h;
  let pos, look;
  if (w.wall === 'left') { pos = [0.005, 1.5, mid]; look = [1, 1.5, mid]; } else if (w.wall === 'right') { pos = [W - 0.005, 1.5, mid]; look = [W - 1, 1.5, mid]; }
  else if (w.wall === 'top') { pos = [mid, 1.5, 0.005]; look = [mid, 1.5, 1]; } else { pos = [mid, 1.5, H - 0.005]; look = [mid, 1.5, H - 1]; }
  const E1 = sk.E * len / 1.2 * k.gain;
  const rl = new THREE.RectAreaLight(k.color, E1 / (len * 1.2), len, 1.2); rl.position.set(...pos); rl.lookAt(...look); group.add(rl);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.2), lum(k.color, E1 / (len * 1.2)));
  glass.position.set(...pos); glass.lookAt(...look); group.add(glass);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.8 }), fg = new THREE.Group(); fg.position.set(pos[0], 0, pos[2]); fg.rotation.y = wallFrame(sc, w.wall).ry; group.add(fg);
  [-1, 1].forEach(sd => box(fg, frameMat, 0.06, 1.3, 0.12, sd * (len / 2 + 0.03), 1.5, 0)); box(fg, frameMat, len + 0.12, 0.06, 0.12, 0, 0.87, 0); box(fg, frameMat, len + 0.12, 0.06, 0.12, 0, 2.13, 0);
  // měkký stín okna
  if (lastOpts.shadows) { const sp = new THREE.SpotLight(k.color, E1 * 0.3, 14, 0.9, 1, 2); sp.position.set(pos[0] + (look[0] - pos[0]) * -0.3, 1.5, pos[2] + (look[2] - pos[2]) * -0.3); sp.target.position.set(look[0], 1.2, look[2]); sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.radius = 10; sp.shadow.bias = -0.002; group.add(sp); group.add(sp.target); }
}

// souřadnice na stěně: s = poloha podél stěny (m), y = výška; vrací [x,z] v místnosti a směr dovnitř
function wallFrame(sc, side) {
  const W = sc.room.w, H = sc.room.h;
  if (side === 'top') return { len: W, at: (s, y) => [s, y, 0], inward: [0, 1], ry: 0 };
  if (side === 'bottom') return { len: W, at: (s, y) => [s, y, H], inward: [0, -1], ry: Math.PI };
  if (side === 'left') return { len: H, at: (s, y) => [0, y, s], inward: [1, 0], ry: Math.PI / 2 };
  return { len: H, at: (s, y) => [W, y, s], inward: [-1, 0], ry: -Math.PI / 2 };
}
function addRoom(sc) {
  const W = sc.room.w, H = sc.room.h, Z = sc.room.z || 2.7;
  const wallMat = new THREE.MeshStandardMaterial({ color: WALLCOL[sc.walls || 'normal'], roughness: 0.95 });
  const floorMat = new THREE.MeshStandardMaterial({ color: FLOORCOL[sc.floor || 'wood'], roughness: 0.8 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xbdb8ae, roughness: 1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); floor.receiveShadow = true; group.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, H), ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.set(W / 2, Z, H / 2); group.add(ceil);
  ['top', 'bottom', 'left', 'right'].forEach(side => {
    const fr = wallFrame(sc, side), win = sc.window;
    // otvory: [s0, s1, z0, z1]
    const ops = [];
    if (win && win.on && win.wall === side) ops.push([win.from, win.to, 0.9, 2.1]);
    (sc.doors || []).forEach(d => { if (d.wall === side && d.open !== false) ops.push([d.at - d.w / 2, d.at + d.w / 2, 0, 2.05]); });
    ops.sort((a, b) => a[0] - b[0]);
    const pieces = []; let cur = 0;
    ops.forEach(o => { if (o[0] > cur) pieces.push([cur, o[0], 0, Z]); if (o[2] > 0) pieces.push([o[0], o[1], 0, o[2]]); if (o[3] < Z) pieces.push([o[0], o[1], o[3], Z]); cur = Math.max(cur, o[1]); });
    if (cur < fr.len) pieces.push([cur, fr.len, 0, Z]);
    pieces.forEach(pc => { const w = pc[1] - pc[0], h = pc[3] - pc[2]; if (w <= 0.001 || h <= 0.001) return; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat); const c = fr.at((pc[0] + pc[1]) / 2, (pc[2] + pc[3]) / 2); m.position.set(c[0], c[1], c[2]); m.rotation.y = fr.ry; m.receiveShadow = true; group.add(m); });
  });
  const sk = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, 0.001, H)), new THREE.LineBasicMaterial({ color: 0x000000 })); sk.position.set(W / 2, 0.002, H / 2); group.add(sk);
  (sc.doors || []).forEach(d => addDoor(sc, d));
}
function addDoor(sc, d) {
  const fr = wallFrame(sc, d.wall), L = S.DOORLIGHT[d.light] || S.DOORLIGHT.none, k = kel(L.cct), open = d.open !== false;
  const inX = fr.inward[0], inZ = fr.inward[1], c = fr.at(d.at, 1.025);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.8 }), leafMat = new THREE.MeshStandardMaterial({ color: 0xd8cfbf, roughness: 0.7 });
  const g = new THREE.Group(); g.position.set(c[0], 0, c[2]); g.rotation.y = fr.ry; group.add(g);
  // zárubeň (lokálně: x podél stěny, z = dovnitř místnosti)
  [-1, 1].forEach(sd => box(g, frameMat, 0.06, 2.1, 0.14, sd * (d.w / 2 + 0.03), 1.05, 0));
  box(g, frameMat, d.w + 0.12, 0.06, 0.14, 0, 2.08, 0);
  if (open) {
    // křídlo otevřené o 85° do místnosti, závěs na levé straně
    const leaf = new THREE.Group(); leaf.position.set(-d.w / 2, 0, 0.05); leaf.rotation.y = -Math.PI * 0.47; g.add(leaf);
    box(leaf, leafMat, d.w, 2.02, 0.04, d.w / 2, 1.01, 0);
    // prostor za dveřmi: podlaha + stěny chodby, na konci svítící / tmavá stěna
    const hallMat = new THREE.MeshStandardMaterial({ color: WALLCOL[sc.walls || 'normal'], roughness: 1, side: THREE.DoubleSide });
    const hf = new THREE.Mesh(new THREE.PlaneGeometry(d.w + 0.6, 1.6), new THREE.MeshStandardMaterial({ color: FLOORCOL[sc.floor || 'wood'], roughness: 0.9 })); hf.rotation.x = -Math.PI / 2; hf.position.set(0, 0.001, -0.8); g.add(hf);
    [-1, 1].forEach(sd => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.6), hallMat); m.position.set(sd * (d.w / 2 + 0.3), 1.3, -0.8); m.rotation.y = Math.PI / 2; g.add(m); });
    const ceilH = new THREE.Mesh(new THREE.PlaneGeometry(d.w + 0.6, 1.6), hallMat); ceilH.rotation.x = Math.PI / 2; ceilH.position.set(0, 2.6, -0.8); g.add(ceilH);
    if (L.E > 0) {
      const E1 = L.E * d.w / 0.9 * k.gain;
      const end = new THREE.Mesh(new THREE.PlaneGeometry(d.w + 0.6, 2.6), lum(k.color, E1 / (d.w * 2.0) * 0.5)); end.position.set(0, 1.3, -1.6); g.add(end);
      const rl = new THREE.RectAreaLight(k.color, E1 / (d.w * 2.0), d.w, 2.0); rl.position.set(0, 1.0, -0.02); rl.lookAt(0, 1.0, 2); g.add(rl);
      if (lastOpts.shadows) { const sp = new THREE.SpotLight(k.color, E1 * 0.35, 12, 1.0, 1, 2); sp.position.set(0, 1.4, -0.6); sp.target.position.set(0, 1.0, 3); sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.radius = 8; sp.shadow.bias = -0.002; g.add(sp); g.add(sp.target); }
    } else { const end = new THREE.Mesh(new THREE.PlaneGeometry(d.w + 0.6, 2.6), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 })); end.position.set(0, 1.3, -1.6); g.add(end); }
  } else { box(g, leafMat, d.w, 2.02, 0.04, 0, 1.01, 0); }
}

function sync(sc, res, meas, opts) {
  if (!renderer) return;
  lastScene = sc; lastRes = res; lastOpts = opts || {};
  clear(group);
  addRoom(sc); addWindow(sc);
  sc.items.forEach(it => {
    if (it.kind === 'light') addLight(it, res);
    else if (it.kind === 'person') addPerson(it);
    else if (it.kind === 'bounce') addBounce(it, res);
    else if (it.kind === 'flag') { const g = new THREE.Group(); g.position.set(it.x, 0, it.y); g.rotation.y = -it.rot; const m = new THREE.Mesh(new THREE.PlaneGeometry(it.len, 0.9), MAT.flag); m.position.y = 1.5; m.castShadow = true; g.add(m); stand(0, 0, 1.05, g); group.add(g); }
    else if (it.kind === 'box' || it.kind === 'furniture') addFurniture(it);
    else if (it.kind === 'camera') { camMesh = new THREE.Group(); camMesh.position.set(it.x, 0, it.y); camMesh.rotation.y = -it.rot; const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.12), MAT.metal); b.position.y = 1.5; camMesh.add(b); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.12, 12), MAT.metal); l.position.set(0.16, 1.5, 0); l.rotation.z = -Math.PI / 2; camMesh.add(l); stand(0, 0, 1.43, camMesh); group.add(camMesh); }
  });
  // rozptýlené světlo od stěn (z půdorysného výpočtu)
  const amb = res ? res.ambCol : [5, 5, 5];
  const hemi = new THREE.HemisphereLight(new THREE.Color(amb[0], amb[1], amb[2]).multiplyScalar(1.2), new THREE.Color(amb[0], amb[1], amb[2]).multiplyScalar(0.6), 1); group.add(hemi);
  // kamera
  const cam = sc.items.find(i => i.kind === 'camera'), person = sc.items.find(i => i.kind === 'person');
  if (cam) {
    const f = cam.focal || 35, ch = cam.h == null ? 1.5 : cam.h;
    camera.fov = 2 * Math.atan(12 / f) * 180 / Math.PI; camera.updateProjectionMatrix();
    camera.position.set(cam.x, ch, cam.y);
    const tgt = new THREE.Vector3(cam.x + Math.cos(cam.rot) * 3, ch + (cam.tilt || 0) * 3, cam.y + Math.sin(cam.rot) * 3);
    if (cam.aim !== false && person) { tgt.set(person.x, S.faceZ(person), person.y); }
    camera.lookAt(tgt);
    if (camMesh) camMesh.visible = orbit;
  }
  if (!orbitInit) { orbitInit = true; orbitCam.position.set(sc.room.w / 2 + 3, 3.2, sc.room.h + 4); controls.target.set(sc.room.w / 2, 1.2, sc.room.h / 2); }
  // expozice: obličej (albedo ~0,5) při referenční osvětlenosti → střední šeď
  const ref = lastOpts.ref || 300;
  renderer.toneMappingExposure = 2.6 / ref * Math.pow(2, lastOpts.ev || 0);
  setSel(selId); dirty = true;
}
let orbitInit = false;

function setSel(id) {
  selId = id;
  const it = lastScene && lastScene.items.find(i => i.id === id);
  floorRing.visible = !!it && orbit; if (it) floorRing.position.set(it.x, 0.005, it.y); dirty = true;
}
function toggleOrbit() { orbit = !orbit; controls.enabled = orbit; if (camMesh) camMesh.visible = orbit; setSel(selId); dirty = true; return orbit; }
function isOrbit() { return orbit; }
function render() { if (!renderer || !lastScene) return; renderer.render(scene3, orbit ? orbitCam : camera); }
function shot() { render(); return canvas.toDataURL('image/png'); }
function hasCamera() { return !!(lastScene && lastScene.items.some(i => i.kind === 'camera')); }

window.View3D = { init, resize, sync, setSel, toggleOrbit, isOrbit, render, shot, hasCamera };
window.dispatchEvent(new Event('view3d-ready'));
})();
