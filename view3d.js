/* LightLab – 3D pohled kamery (Three.js). Půdorys (x,y) → 3D (x, výška, z). */
(function () {
'use strict';
const THREE = window.THREE_LIB.THREE, OrbitControls = window.THREE_LIB.OrbitControls, RectAreaLightUniformsLib = window.THREE_LIB.RectAreaLightUniformsLib;
const S = window.LightSim;
RectAreaLightUniformsLib.init();

let renderer, scene3, camera, orbitCam, controls, wrap, canvas, group, floorRing, orbit = false, camMesh, grainCv, grainCtx, over = false, keys = {}, lastT = 0, camItem = null, lookDrag = null, onCamera = null;
let lastScene = null, lastRes = null, lastOpts = {}, selId = null, dirty = false;

function lum(color, nits) { return new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(nits), toneMapped: true }); }
function col3(c) { return new THREE.Color(c[0], c[1], c[2]); }
function kel(k) { const c = S.cctColor(k); const m = Math.max(c[0], c[1], c[2]); return { color: new THREE.Color(c[0] / m, c[1] / m, c[2] / m), gain: m }; }

// gobo: procedurální textura (černá = stín, průhledná = světlo), viz SpotLight.map
const goboCache = {};
function goboTexture(name) {
  if (goboCache[name]) return goboCache[name];
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  // SpotLight.map násobí barvu světla RGB texturou: bílá = propouští, černá = stíní
  g.fillStyle = '#fff'; g.fillRect(0, 0, N, N); g.fillStyle = '#000';
  const block = (x, y, w, h) => g.fillRect(x, y, w, h);
  const ring = () => { g.fillStyle = '#000'; g.beginPath(); g.rect(0, 0, N, N); g.arc(N / 2, N / 2, N * 0.48, 0, Math.PI * 2, true); g.fill(); };
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  if (name === 'window4') { block(N * 0.47, 0, N * 0.06, N); block(0, N * 0.47, N, N * 0.06); block(0, 0, N, N * 0.08); block(0, N * 0.92, N, N * 0.08); block(0, 0, N * 0.08, N); block(N * 0.92, 0, N * 0.08, N); }
  else if (name === 'window6') { block(N * 0.31, 0, N * 0.05, N); block(N * 0.64, 0, N * 0.05, N); block(0, N * 0.48, N, N * 0.05); block(0, 0, N, N * 0.07); block(0, N * 0.93, N, N * 0.07); block(0, 0, N * 0.07, N); block(N * 0.93, 0, N * 0.07, N); }
  else if (name === 'blinds') { for (let y = 0; y < N; y += N / 14) block(0, y, N, N / 28); ring(); }
  else if (name === 'slats') { for (let x = 0; x < N; x += N / 12) block(x, 0, N / 24, N); ring(); }
  else if (name === 'leaves') { g.fillRect(0, 0, N, N); g.fillStyle = '#fff'; for (let i = 0; i < 260; i++) { const x = rnd() * N, y = rnd() * N, r = 6 + rnd() * 22; g.beginPath(); g.ellipse(x, y, r, r * 0.55, rnd() * Math.PI, 0, Math.PI * 2); g.fill(); } ring(); }
  else if (name === 'branches') { g.lineCap = 'round'; g.strokeStyle = '#000'; const br = (x, y, a, len, w, d) => { if (d > 5 || len < 8) return; const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke(); const k = 2 + Math.floor(rnd() * 2); for (let i = 0; i < k; i++) br(nx, ny, a + (rnd() - 0.5) * 1.4, len * (0.6 + rnd() * 0.25), w * 0.65, d + 1); }; br(N * 0.1, N * 0.9, -0.9, N * 0.3, 18, 0); br(N * 0.9, N * 0.85, -2.3, N * 0.28, 16, 0); br(N * 0.5, N, -1.6, N * 0.25, 14, 0); }
  else if (name === 'circle') { g.beginPath(); g.rect(0, 0, N, N); g.arc(N / 2, N / 2, N * 0.34, 0, Math.PI * 2, true); g.fill(); }
  else if (name === 'bars') { for (let x = 0; x < N; x += N / 6) block(x, 0, N / 18, N); for (let y = 0; y < N; y += N / 6) block(0, y, N, N / 18); ring(); }
  else if (name === 'dots') { g.fillRect(0, 0, N, N); g.fillStyle = '#fff'; for (let i = 0; i < 90; i++) { const x = rnd() * N, y = rnd() * N, r = 8 + rnd() * 30; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } ring(); }
  else if (name === 'cross') { g.fillRect(0, 0, N, N); g.fillStyle = '#fff'; g.fillRect(N * 0.44, N * 0.1, N * 0.12, N * 0.8); g.fillRect(N * 0.1, N * 0.44, N * 0.8, N * 0.12); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; goboCache[name] = t; return t;
}
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
  // zrno (overlay canvas)
  grainCv = document.createElement('canvas'); grainCv.className = 'grain'; wrap.appendChild(grainCv); grainCtx = grainCv.getContext('2d');
  // FPS ovládání kamery: hover + klávesy + myš
  cv.tabIndex = 0;
  cv.addEventListener('pointerenter', () => { over = true; }); cv.addEventListener('pointerleave', () => { over = false; keys = {}; });
  cv.addEventListener('pointerdown', e => { cv.focus(); if (orbit || e.button !== 0 || !camItem) return; lookDrag = { x: e.clientX, y: e.clientY, rot: camItem.rot, tilt: camItem.tilt || 0 }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (!lookDrag || !camItem) return; const dx = e.clientX - lookDrag.x, dy = e.clientY - lookDrag.y, f = (camItem.focal || 35);
    const k = 0.0025 * 35 / f; camItem.rot = lookDrag.rot + dx * k; camItem.tilt = Math.max(-1.2, Math.min(1.2, lookDrag.tilt - dy * k)); camItem.aim = false; emitCam(false); });
  cv.addEventListener('pointerup', () => { if (lookDrag) { lookDrag = null; emitCam(true); } });
  cv.addEventListener('wheel', e => { if (orbit || !camItem) return; e.preventDefault(); camItem.focal = Math.round(Math.max(14, Math.min(135, (camItem.focal || 35) * (e.deltaY > 0 ? 0.92 : 1.087)))); emitCam(true); }, { passive: false });
  window.addEventListener('keydown', e => { if (!wantsKeys()) return; const k = e.key.toLowerCase(); if ('wasdqe'.includes(k) || e.key.startsWith('Arrow')) { keys[k === ' ' ? k : (e.key.startsWith('Arrow') ? e.key : k)] = true; e.preventDefault(); } });
  window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); delete keys[k]; delete keys[e.key]; });
  resize();
  (function loop(t) { requestAnimationFrame(loop); const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t; if (orbit) controls.update(); if (walk(dt)) dirty = true; if (dirty) { dirty = false; render(); } drawGrain(t); })(0);
}
function wantsKeys() { return !!(camItem && !orbit && (over || document.activeElement === canvas)); }
// pohyb WASD (W/S vpřed/vzad, A/D do stran, Q/E dolů/nahoru), v m/s
function walk(dt) {
  if (!camItem || orbit || !dt) return false; let mv = false; const sp = 1.6 * dt, fx = Math.cos(camItem.rot), fz = Math.sin(camItem.rot), rx = -fz, rz = fx;
  let dx = 0, dz = 0, dy = 0;
  if (keys.w || keys.ArrowUp) { dx += fx; dz += fz; } if (keys.s || keys.ArrowDown) { dx -= fx; dz -= fz; }
  if (keys.d || keys.ArrowRight) { dx += rx; dz += rz; } if (keys.a || keys.ArrowLeft) { dx -= rx; dz -= rz; }
  if (keys.e) dy += 1; if (keys.q) dy -= 1;
  if (dx || dz || dy) { const L = Math.hypot(dx, dz) || 1; camItem.x = Math.max(0.1, Math.min(lastScene.room.w - 0.1, camItem.x + dx / L * sp)); camItem.y = Math.max(0.1, Math.min(lastScene.room.h - 0.1, camItem.y + dz / L * sp)); camItem.h = Math.max(0.2, Math.min((lastScene.room.z || 2.7) - 0.1, (camItem.h == null ? 1.5 : camItem.h) + dy * sp)); mv = true; }
  if (mv) emitCam(false);
  return mv;
}
function emitCam(final) { applyCamera(); dirty = true; if (onCamera) onCamera(camItem, final); }
let walkTimer = null;
function applyCamera() {
  const cam = camItem, sc = lastScene; if (!cam || !sc) return;
  const person = sc.items.find(i => i.kind === 'person'), f = cam.focal || 35, ch = cam.h == null ? 1.5 : cam.h;
  camera.fov = 2 * Math.atan(12 / f) * 180 / Math.PI; camera.updateProjectionMatrix();
  camera.position.set(cam.x, ch, cam.y);
  const tgt = new THREE.Vector3(cam.x + Math.cos(cam.rot) * Math.cos(cam.tilt || 0) * 3, ch + Math.sin(cam.tilt || 0) * 3, cam.y + Math.sin(cam.rot) * Math.cos(cam.tilt || 0) * 3);
  if (cam.aim !== false && person) tgt.set(person.x, S.faceZ(person), person.y);
  camera.lookAt(tgt);
  if (camMesh) { camMesh.position.set(cam.x, 0, cam.y); camMesh.rotation.y = -cam.rot; }
}
function drawGrain(t) {
  const g = lastOpts.grain || 0; if (!grainCv) return;
  if (g <= 0) { if (grainCv.width) { grainCv.width = 0; } return; }
  const r = wrap.getBoundingClientRect(), w = Math.max(2, Math.floor(r.width / 2)), h = Math.max(2, Math.floor(r.height / 2));
  if (grainCv.width !== w || grainCv.height !== h) { grainCv.width = w; grainCv.height = h; }
  if (!drawGrain.last || t - drawGrain.last > 80) { drawGrain.last = t; const img = grainCtx.createImageData(w, h), d = img.data; let sd = (t | 0) + 1;
    for (let i = 0; i < d.length; i += 4) { sd = (sd * 1103515245 + 12345) & 0x7fffffff; const v = 128 + ((sd >> 8) % 256 - 128) * g * 0.45; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    grainCtx.putImageData(img, 0, 0); }
}

function resize() {
  if (!renderer) return;
  const r = wrap.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
  if (grainCv) { grainCv.style.width = r.width + 'px'; grainCv.style.height = r.height + 'px'; }
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
    sp.position.copy(pos); sp.target.position.copy(tgt); sp.castShadow = !!lastOpts.shadows; sp.shadow.mapSize.set(2048, 2048); sp.shadow.bias = -0.0015; sp.shadow.radius = L.diff ? 6 : 2;
    if (L.gobo && L.gobo !== 'none' && S.GOBOS[L.gobo]) { sp.map = goboTexture(L.gobo); sp.castShadow = true; sp.shadow.focus = 1; }
    g.add(sp); g.add(sp.target);
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

function addWindow(sc, w) {
  if (typeof w.wall !== 'string') return;
  const sk = S.SKY[sc.sky] || S.SKY.overcast, k = kel(sk.cct), len = w.to - w.from, mid = (w.from + w.to) / 2, W = sc.room.w, H = sc.room.h;
  let pos, look;
  if (w.wall === 'left') { pos = [0.005, 1.5, mid]; look = [1, 1.5, mid]; } else if (w.wall === 'right') { pos = [W - 0.005, 1.5, mid]; look = [W - 1, 1.5, mid]; }
  else if (w.wall === 'top') { pos = [mid, 1.5, 0.005]; look = [mid, 1.5, 1]; } else { pos = [mid, 1.5, H - 0.005]; look = [mid, 1.5, H - 1]; }
  const bl = S.blindOf(w), openH = 1.2 * (1 - bl), E1 = sk.E * len / 1.2 * k.gain * (1 - bl * 0.97);
  if (openH > 0.01) {
    const rl = new THREE.RectAreaLight(k.color, E1 / (len * openH), len, openH); rl.position.set(pos[0], S.WIN_Z0 + openH / 2, pos[2]); rl.lookAt(look[0], S.WIN_Z0 + openH / 2, look[2]); group.add(rl);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, openH), lum(k.color, sk.E * len / 1.2 * k.gain / (len * 1.2)));
    glass.position.set(pos[0], S.WIN_Z0 + openH / 2, pos[2]); glass.lookAt(look[0], S.WIN_Z0 + openH / 2, look[2]); group.add(glass);
  }
  if (bl > 0) { // roleta: světlý panel shora, propouští trochu světla
    const bh = 1.2 * bl, bm = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 1, emissive: k.color, emissiveIntensity: sk.E * 0.02 });
    const bg = new THREE.Group(); bg.position.set(pos[0], 0, pos[2]); bg.rotation.y = wallFrame(sc, w.wall).ry; group.add(bg);
    box(bg, bm, len, bh, 0.02, 0, S.WIN_Z1 - bh / 2, 0.04);
    for (let y = S.WIN_Z1 - 0.06; y > S.WIN_Z1 - bh; y -= 0.08) box(bg, MAT.hair, len, 0.006, 0.03, 0, y, 0.04);
  }
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.8 }), fg = new THREE.Group(); fg.position.set(pos[0], 0, pos[2]); fg.rotation.y = wallFrame(sc, w.wall).ry; group.add(fg);
  [-1, 1].forEach(sd => box(fg, frameMat, 0.06, 1.3, 0.12, sd * (len / 2 + 0.03), 1.5, 0)); box(fg, frameMat, len + 0.12, 0.06, 0.12, 0, 0.87, 0); box(fg, frameMat, len + 0.12, 0.06, 0.12, 0, 2.13, 0);
  // měkký stín okna
  if (lastOpts.shadows && openH > 0.01) { const sp = new THREE.SpotLight(k.color, E1 * 0.3, 14, 0.9, 1, 2); sp.position.set(pos[0] + (look[0] - pos[0]) * -0.3, S.WIN_Z0 + openH / 2, pos[2] + (look[2] - pos[2]) * -0.3); sp.target.position.set(look[0], 1.2, look[2]); sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.radius = 10; sp.shadow.bias = -0.002; group.add(sp); group.add(sp.target); }
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
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, H), ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.set(W / 2, Z, H / 2); ceil.castShadow = true; group.add(ceil);
  ['top', 'bottom', 'left', 'right'].forEach(side => {
    const fr = wallFrame(sc, side);
    // otvory: [s0, s1, z0, z1]
    const ops = [];
    (sc.windows || []).forEach(w => { if (w.wall === side) ops.push([w.from, w.to, S.WIN_Z0, S.WIN_Z1]); });
    (sc.doors || []).forEach(d => { if (d.wall === side && d.open !== false) ops.push([d.at - d.w / 2, d.at + d.w / 2, 0, 2.05]); });
    ops.sort((a, b) => a[0] - b[0]);
    const pieces = []; let cur = 0;
    ops.forEach(o => { if (o[0] > cur) pieces.push([cur, o[0], 0, Z]); if (o[2] > 0) pieces.push([o[0], o[1], 0, o[2]]); if (o[3] < Z) pieces.push([o[0], o[1], o[3], Z]); cur = Math.max(cur, o[1]); });
    if (cur < fr.len) pieces.push([cur, fr.len, 0, Z]);
    pieces.forEach(pc => { const w = pc[1] - pc[0], h = pc[3] - pc[2]; if (w <= 0.001 || h <= 0.001) return; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat); const c = fr.at((pc[0] + pc[1]) / 2, (pc[2] + pc[3]) / 2); m.position.set(c[0], c[1], c[2]); m.rotation.y = fr.ry; m.receiveShadow = true; m.castShadow = true; group.add(m); });
  });
  const sk = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, 0.001, H)), new THREE.LineBasicMaterial({ color: 0x000000 })); sk.position.set(W / 2, 0.002, H / 2); group.add(sk);
  (sc.doors || []).forEach(d => addDoor(sc, d));
}
// nakreslená zeď (box, tloušťka 0,12 m) s otvory oken
function addWallItem(sc, it) {
  const L = S.wallLen(it); if (L < 0.05) return;
  const Z = sc.room.z || 2.7, mat = new THREE.MeshStandardMaterial({ color: WALLCOL[sc.walls || 'normal'], roughness: 0.95 });
  const g = new THREE.Group(); g.position.set(it.x1, 0, it.y1); g.rotation.y = -Math.atan2(it.y2 - it.y1, it.x2 - it.x1); group.add(g);
  const ops = []; (sc.windows || []).forEach(w => { if (w.wall === it.id) ops.push([w.from, w.to]); }); ops.sort((a, b) => a[0] - b[0]);
  const pieces = []; let cur = 0;
  ops.forEach(o => { if (o[0] > cur) pieces.push([cur, o[0], 0, Z]); pieces.push([o[0], o[1], 0, S.WIN_Z0]); pieces.push([o[0], o[1], S.WIN_Z1, Z]); cur = Math.max(cur, o[1]); });
  if (cur < L) pieces.push([cur, L, 0, Z]);
  pieces.forEach(pc => { const w = pc[1] - pc[0], h = pc[3] - pc[2]; if (w <= 0.001 || h <= 0.001) return; box(g, mat, w, h, 0.12, (pc[0] + pc[1]) / 2, (pc[2] + pc[3]) / 2, 0); });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.8 });
  ops.forEach(o => { const len = o[1] - o[0], mid = (o[0] + o[1]) / 2; [-1, 1].forEach(sd => box(g, frameMat, 0.06, 1.3, 0.14, mid + sd * (len / 2 + 0.03), 1.5, 0)); box(g, frameMat, len + 0.12, 0.06, 0.14, mid, 0.87, 0); box(g, frameMat, len + 0.12, 0.06, 0.14, mid, 2.13, 0); });
}
function addSun(sc) {
  if (!S.sunOn(sc)) return;
  const d = S.sunDir(sc), el = (sc.sun.elev == null ? 35 : sc.sun.elev) * Math.PI / 180, k = kel(S.SUN_CCT), W = sc.room.w, H = sc.room.h, R = Math.max(W, H);
  const sun = new THREE.DirectionalLight(k.color, S.SUN_E * k.gain);
  sun.position.set(W / 2 + d[0] * Math.cos(el) * 25, Math.sin(el) * 25 + 1.5, H / 2 + d[1] * Math.cos(el) * 25); sun.target.position.set(W / 2, 1.2, H / 2);
  sun.castShadow = !!lastOpts.shadows; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  const c = sun.shadow.camera; c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 1; c.far = 60; c.updateProjectionMatrix();
  group.add(sun); group.add(sun.target);
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
  addRoom(sc); (sc.windows || []).forEach(w => addWindow(sc, w)); addSun(sc); sc.items.forEach(it => { if (it.kind === 'wall') addWallItem(sc, it); });
  sc.items.forEach(it => {
    if (it.kind === 'light') addLight(it, res);
    else if (it.kind === 'person') addPerson(it);
    else if (it.kind === 'bounce') addBounce(it, res);
    else if (it.kind === 'flag') { const g = new THREE.Group(); g.position.set(it.x, 0, it.y); g.rotation.y = -it.rot; const m = new THREE.Mesh(new THREE.PlaneGeometry(it.len, 0.9), MAT.flag); m.position.y = 1.5; m.castShadow = true; g.add(m); stand(0, 0, 1.05, g); group.add(g); }
    else if (it.kind === 'box' || it.kind === 'furniture') addFurniture(it);
    else if (it.kind === 'camera') { camMesh = new THREE.Group(); camMesh.position.set(it.x, 0, it.y); camMesh.rotation.y = -it.rot; const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.12), MAT.metal); b.position.y = 1.5; camMesh.add(b); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.12, 12), MAT.metal); l.position.set(0.16, 1.5, 0); l.rotation.z = -Math.PI / 2; camMesh.add(l); stand(0, 0, 1.43, camMesh); group.add(camMesh); }
  });
  // všechny plné objekty přijímají i vrhají stíny (jinak by je slunce prosvítilo skrz strop)
  group.traverse(o => { if (o.isMesh && !o.material.isMeshBasicMaterial) { o.receiveShadow = true; o.castShadow = true; } });
  // rozptýlené světlo od stěn (z půdorysného výpočtu)
  const amb = res ? res.ambCol : [5, 5, 5];
  const hemi = new THREE.HemisphereLight(new THREE.Color(amb[0], amb[1], amb[2]).multiplyScalar(1.2), new THREE.Color(amb[0], amb[1], amb[2]).multiplyScalar(0.6), 1); group.add(hemi);
  // kamera
  const cam = sc.items.find(i => i.kind === 'camera');
  camItem = cam || null;
  if (cam) { applyCamera(); if (camMesh) camMesh.visible = orbit; }
  // mlhostroj: zešednutí (fog v jednotkách scény, barva podle rozptýleného světla) – zrno kreslí overlay
  const haze = lastOpts.haze || 0, refL = lastOpts.ref || 300;
  if (haze > 0) { const ac = res ? res.ambCol : [1, 1, 1], am = Math.max(1e-3, (ac[0] + ac[1] + ac[2]) / 3), fc = new THREE.Color(ac[0] / am, ac[1] / am, ac[2] / am).multiplyScalar(refL * 0.07 * (0.3 + haze)); scene3.fog = new THREE.FogExp2(fc, 0.03 + haze * 0.13); }
  else scene3.fog = null;
  if (!orbitInit) { orbitInit = true; orbitCam.position.set(sc.room.w / 2 + 3, 3.2, sc.room.h + 4); controls.target.set(sc.room.w / 2, 1.2, sc.room.h / 2); }
  // expozice: obličej (albedo ~0,5) při referenční osvětlenosti → střední šeď
  const ref = lastOpts.ref || 300;
  renderer.toneMappingExposure = 2.6 / ref * Math.pow(2, lastOpts.ev || 0);
  drawGrain.last = 0;
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
function shot() { render(); if (!(lastOpts.grain > 0) || !grainCv.width) return canvas.toDataURL('image/png');
  const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; const g = c.getContext('2d'); g.drawImage(canvas, 0, 0); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.85; g.drawImage(grainCv, 0, 0, c.width, c.height); return c.toDataURL('image/png'); }
function setCameraCallback(fn) { onCamera = fn; }
function hasCamera() { return !!(lastScene && lastScene.items.some(i => i.kind === 'camera')); }

window.View3D = { init, resize, sync, setSel, toggleOrbit, isOrbit, render, shot, hasCamera, wantsKeys, setCameraCallback, applyCamera: () => { applyCamera(); dirty = true; }, _dbg: () => ({ scene3, renderer, group, camera }) };
window.dispatchEvent(new Event('view3d-ready'));
})();
