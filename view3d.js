/* Viewfinder Light – 3D pohled kamery (Three.js). Půdorys (x,y) → 3D (x, výška, z). */
(function () {
'use strict';
const THREE = window.THREE_LIB.THREE, OrbitControls = window.THREE_LIB.OrbitControls, RectAreaLightUniformsLib = window.THREE_LIB.RectAreaLightUniformsLib, GLTFLoader = window.THREE_LIB.GLTFLoader, SkeletonUtils = window.THREE_LIB.SkeletonUtils;
const S = window.LightSim;
RectAreaLightUniformsLib.init();
// kompatibilita: path tracer čeká Scene.backgroundRotation / environmentRotation (Three.js ≥ 0.162)
['backgroundRotation', 'environmentRotation'].forEach(k => { if (!(k in THREE.Scene.prototype) && !(k in new THREE.Scene())) Object.defineProperty(THREE.Scene.prototype, k, { configurable: true, get() { return this['_' + k] || (this['_' + k] = new THREE.Euler()); }, set(v) { this['_' + k] = v; } }); });

let renderer, scene3, camera, orbitCam, controls, wrap, canvas, group, floorRing, orbit = false, camMesh, grainCv, grainCtx, over = false, keys = {}, lastT = 0, camItem = null, lookDrag = null, onCamera = null;
let lastScene = null, lastRes = null, lastOpts = {}, selId = null, dirty = false, region = null; // region = {x,y,w,h} v px (viewport formátu)

function lum(color, nits) { const m = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(nits), toneMapped: true }); m.userData.lum = { color: color.clone(), nits: nits }; return m; }
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
// ---------- procedurální textury ----------
const texCache = {};
function noiseCanvas(N, fn) { const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); fn(g, N); return c; }
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function grain(g, N, amount, seed) { const img = g.getImageData(0, 0, N, N), d = img.data, r = mulberry(seed || 1); for (let i = 0; i < d.length; i += 4) { const v = (r() - 0.5) * amount; d[i] += v; d[i + 1] += v; d[i + 2] += v; } g.putImageData(img, 0, 0); }
function blotches(g, N, n, alpha, seed, size) { const r = mulberry(seed); for (let i = 0; i < n; i++) { const x = r() * N, y = r() * N, rad = (0.5 + r()) * size, v = 128 + (r() - 0.5) * 60; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${v},${v},${v},${alpha})`); gr.addColorStop(1, 'rgba(128,128,128,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); } }
function texture(kind) {
  if (texCache[kind]) return texCache[kind];
  const N = 512; let c, rep = [1, 1];
  if (kind === 'plaster') { c = noiseCanvas(N, (g) => { g.fillStyle = '#c8c4bc'; g.fillRect(0, 0, N, N); blotches(g, N, 60, 0.25, 3, 90); grain(g, N, 26, 5); }); rep = [1.5, 1.5]; }
  else if (kind === 'ceiling') { c = noiseCanvas(N, (g) => { g.fillStyle = '#d2cec6'; g.fillRect(0, 0, N, N); blotches(g, N, 30, 0.15, 9, 120); grain(g, N, 14, 7); }); rep = [1.5, 1.5]; }
  else if (kind === 'wood') { c = noiseCanvas(N, (g) => { const r = mulberry(11); const rows = 6, pw = N / rows; for (let i = 0; i < rows; i++) { const off = (i % 2) * N / 3; const tone = 150 + (r() - 0.5) * 50; for (let k = -1; k < 3; k++) { const x0 = off + k * N / 1.5, x1 = x0 + N / 1.5; g.fillStyle = `rgb(${tone + 30},${tone - 10},${tone - 50})`; g.fillRect(x0 + 2, i * pw + 2, x1 - x0 - 4, pw - 4); } g.fillStyle = 'rgba(40,25,10,0.9)'; g.fillRect(0, i * pw, N, 2); }
      // léta dřeva
      g.strokeStyle = 'rgba(60,35,15,0.25)'; g.lineWidth = 1; for (let i = 0; i < 260; i++) { const y = r() * N; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= N; x += 32) g.lineTo(x, y + Math.sin(x / 40 + i) * 3 * r()); g.stroke(); }
      grain(g, N, 18, 13); }); rep = [1, 1]; }
  else if (kind === 'concrete') { c = noiseCanvas(N, (g) => { g.fillStyle = '#8f8f8f'; g.fillRect(0, 0, N, N); blotches(g, N, 90, 0.3, 21, 70); grain(g, N, 34, 23); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(1, 1, N - 2, N - 2); }); rep = [1, 1]; }
  else if (kind === 'darkfloor') { c = noiseCanvas(N, (g) => { g.fillStyle = '#3a3532'; g.fillRect(0, 0, N, N); blotches(g, N, 60, 0.25, 31, 80); grain(g, N, 22, 33); const r = mulberry(35); g.strokeStyle = 'rgba(0,0,0,0.35)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, i * N / 4); g.lineTo(N, i * N / 4); g.stroke(); } }); rep = [1, 1]; }
  else if (kind === 'fabric') { c = noiseCanvas(N, (g) => { g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, N, N); grain(g, N, 40, 41); g.globalAlpha = 0.25; g.fillStyle = '#777'; for (let y = 0; y < N; y += 3) g.fillRect(0, y, N, 1); for (let x = 0; x < N; x += 3) g.fillRect(x, 0, 1, N); g.globalAlpha = 1; }); rep = [4, 4]; }
  else if (kind === 'metal') { c = noiseCanvas(N, (g) => { g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, N, N); grain(g, N, 30, 51); }); rep = [2, 2]; }
  else if (kind === 'cloth') { c = noiseCanvas(N, (g) => { g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, N, N); grain(g, N, 24, 61); }); rep = [6, 6]; }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const b = new THREE.CanvasTexture(c); b.wrapS = b.wrapT = THREE.RepeatWrapping; b.repeat.set(rep[0], rep[1]);
  texCache[kind] = { map: t, bump: b }; return texCache[kind];
}
function texMat(kind, color, opts) { const t = texture(kind); return new THREE.MeshStandardMaterial(Object.assign({ color: color, map: t.map, bumpMap: t.bump, bumpScale: 0.6, roughness: 0.9 }, opts || {})); }
function surfMat(kind, color, repeatX, repeatY, opts) { const m = texMat(kind, color, opts); m.map = m.map.clone(); m.bumpMap = m.bumpMap.clone(); m.map.repeat.set(repeatX, repeatY); m.bumpMap.repeat.set(repeatX, repeatY); m.map.needsUpdate = m.bumpMap.needsUpdate = true; return m; }

const MAT = {
  skin: new THREE.MeshStandardMaterial({ color: 0xdcb59a, roughness: 0.55 }),
  skinDark: new THREE.MeshStandardMaterial({ color: 0xc89b7e, roughness: 0.6 }),
  hair: new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.7 }),
  eyeWhite: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.3 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.2 }),
  mouth: new THREE.MeshStandardMaterial({ color: 0x8a4a44, roughness: 0.6 }),
  shoe: new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.5 }),
  metal: texMat('metal', 0x2b2b2d, { roughness: 0.45, metalness: 0.7, bumpScale: 0.2 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0x8c8c90, roughness: 0.35, metalness: 0.9 }),
  flag: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.DoubleSide }),
  wood: texMat('wood', 0x8a6a4a, { roughness: 0.6, bumpScale: 0.5 }),
  woodDark: texMat('wood', 0x5a4030, { roughness: 0.6, bumpScale: 0.5 }),
  gold: new THREE.MeshBasicMaterial({ color: 0xd4b071 })
};
const HAIRCOL = { dark: 0x2a1c12, brown: 0x5a3a22, blond: 0xc9a25a, red: 0x8a3a1a, grey: 0x9a9a96, black: 0x141210 };
const SKIN = { light: [0xe8c4a6, 0xd4a888], medium: [0xc79c7a, 0xb08464], tan: [0xa8734f, 0x8f5f3f], dark: [0x6b4a34, 0x563a28] };
const OUTFITS = { dark: [0x2f3340, 0x25262b], light: [0xd9d5cc, 0x6b6f78], blue: [0x3a5f9a, 0x2b2b30], red: [0x9a3a34, 0x2b2b30], green: [0x4f6b45, 0x3a3a3c] };
const WALLCOL = { dark: 0x3a3532, normal: 0xa39a8d, white: 0xe6e1d6 };
const FLOORCOL = { wood: 0x8a6444, grey: 0x777777, dark: 0x44403c };
const FLOORTEX = { wood: 'wood', grey: 'concrete', dark: 'darkfloor' };

function init(cv) {
  canvas = cv; wrap = cv.parentElement;
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); curPR = Math.min(devicePixelRatio, 2);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.localClippingEnabled = true;
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
  (function loop(t) { requestAnimationFrame(loop); const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t; if (orbit) controls.update(); if (walk(dt)) { stopPT(); dirty = true; } if (pt.active) { ptStep(); dirty = false; } else if (pt.done) { dirty = false; } else if (dirty) { dirty = false; render(); } drawGrain(t); })(0);
}
// profil kvality: náhled (rychlý), standard, ultra (měkké stíny z více vzorků, jemnější mlha, plné rozlišení)
function Q() { const q = lastOpts.quality || 'mid'; return q === 'low' ? { spot: 512, soft: 0, softMap: 512, winMap: 512, beams: 3, pr: Math.min(devicePixelRatio, 1) * 0.8, sunMap: 1024 }
  : q === 'high' ? { spot: 4096, soft: 4, softMap: 1024, winMap: 2048, beams: 14, pr: Math.min(devicePixelRatio, 2), sunMap: 4096 }
  : { spot: 2048, soft: 1, softMap: 1024, winMap: 1024, beams: 7, pr: Math.min(devicePixelRatio, 2), sunMap: 2048 }; }
let curPR = 0;
function applyQualityRatio() { const pr = Q().pr; if (Math.abs(pr - curPR) > 0.01) { curPR = pr; renderer.setPixelRatio(pr); resize(); } }
function formatAspect() { const f = lastScene && lastScene.format, F = S.FORMATS[f]; return F ? F.a : 0; }
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
  camera.fov = S.fovs(f, region ? region.w / region.h : 1.5).v * 180 / Math.PI; camera.updateProjectionMatrix();
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
  const A = formatAspect(); let w = r.width, h = r.height;
  if (A > 0) { if (w / h > A) w = h * A; else h = w / A; }
  region = { x: Math.round((r.width - w) / 2), y: Math.round((r.height - h) / 2), w: Math.round(w), h: Math.round(h) };
  camera.aspect = region.w / region.h; orbitCam.aspect = r.width / r.height; camera.updateProjectionMatrix(); orbitCam.updateProjectionMatrix(); applyCamera(); dirty = true;
}

function clear(g) { while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } }

// C-stand: „želví“ základna se třemi nohami v různých výškách, sloupek, kolínko
function stand(x, z, h, g) {
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, h, 10), MAT.chrome); col.position.set(x, h / 2, z); g.add(col);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), MAT.metal); hub.position.set(x, 0.12, z); g.add(hub);
  [0, 2.094, 4.189].forEach((a, i) => { const top = 0.06 + i * 0.07, len = 0.5, lx = Math.cos(a), lz = Math.sin(a), L = Math.hypot(len, top);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(L, 0.02, 0.03), MAT.metal); leg.position.set(x + lx * len / 2, top / 2 + 0.01, z + lz * len / 2); leg.rotation.y = -a; leg.rotation.z = Math.atan2(top, len); g.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), MAT.shoe); foot.position.set(x + lx * len, 0.01, z + lz * len); g.add(foot); });
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.06), MAT.metal); knob.position.set(x, h - 0.03, z); g.add(knob);
}
// stativ kamery: tři nohy do rozkroku, středový sloupek, fluidní hlava
function tripod(g, h) {
  const hubH = Math.max(0.5, h - 0.25);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), MAT.metal); hub.position.set(0, hubH, 0); g.add(hub);
  for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + i * 2.094, r = 0.42, lx = Math.cos(a) * r, lz = Math.sin(a) * r, L = Math.hypot(r, hubH);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, L, 8), MAT.metal); leg.position.set(lx / 2, hubH / 2, lz / 2); leg.lookAt(lx, 0, lz); leg.rotateX(Math.PI / 2); g.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), MAT.shoe); foot.position.set(lx, 0.02, lz); g.add(foot); }
  const colm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, h - hubH + 0.1, 10), MAT.chrome); colm.position.set(0, (h + hubH) / 2 - 0.03, 0); g.add(colm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.1), MAT.metal); head.position.set(0, h - 0.04, 0); g.add(head);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 6), MAT.metal); handle.position.set(-0.2, h - 0.12, 0.05); handle.rotation.z = Math.PI / 2 - 0.5; g.add(handle);
}

// světelný kužel v mlze (aditivní, průhledný) – viditelný jen při zapnutém mlhostroji
function beamMat(color, radiance) { return new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(radiance), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, vertexColors: true }); }
// kužel s jasem klesajícím od zdroje (vertex colors) – několik vnořených vrstev dá měkký, „objemový“ dojem
function fadeCone(r, L, near, far) {
  const geo = new THREE.ConeGeometry(r, L, 48, 6, true), pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const t = (pos.getY(i) + L / 2) / L; const v = far + (near - far) * t * t; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo;
}
function addBeam(g, pos, tgt, halfAngle, color, E1, soft) {
  const haze = lastOpts.haze || 0; if (haze <= 0) return;
  const dir = tgt.clone().sub(pos).normalize(), L = 6, r = Math.tan(Math.min(halfAngle, 1.2)) * L, layers = Q().beams;
  for (let i = 0; i < layers; i++) {
    const k = 1 - i / layers * 0.85, geo = fadeCone(r * k, L, 1.0, 0.12);
    const cone = new THREE.Mesh(geo, beamMat(color, E1 * haze * 0.002 / layers * (soft ? 0.4 : 1)));
    cone.position.copy(pos).add(dir.clone().multiplyScalar(L / 2)); cone.lookAt(tgt); cone.rotateX(-Math.PI / 2); cone.renderOrder = 5; cone.userData.beam = true; g.add(cone);
  }
}
function addSunBeams(sc) {
  const haze = lastOpts.haze || 0; if (haze <= 0 || !S.sunOn(sc)) return;
  const d = S.sunDir(sc), el = (sc.sun.elev == null ? 35 : sc.sun.elev) * Math.PI / 180, k = kel(S.SUN_CCT);
  const dirIn = new THREE.Vector3(-d[0] * Math.cos(el), -Math.sin(el), -d[1] * Math.cos(el)); // směr paprsků do místnosti
  (sc.windows || []).forEach(w => {
    if (typeof w.wall !== 'string') return; const fr = wallFrame(sc, w.wall); if (fr.inward[0] * dirIn.x + fr.inward[1] * dirIn.z <= 0.05) return;
    const bl = S.blindOf(w), z1 = S.WIN_Z1 - bl * (S.WIN_Z1 - S.WIN_Z0); if (z1 - S.WIN_Z0 < 0.05) return;
    const c = [fr.at(w.from, z1), fr.at(w.to, z1), fr.at(w.to, S.WIN_Z0), fr.at(w.from, S.WIN_Z0)].map(a => new THREE.Vector3(a[0], a[1], a[2]));
    const far = c.map(v => { const t = v.y / Math.max(0.05, -dirIn.y); return v.clone().add(dirIn.clone().multiplyScalar(Math.min(t, 12))); });
    const verts = [];
    const quad = (a, b, cc, dd) => { verts.push(a, b, cc, a, cc, dd); };
    for (let i = 0; i < 4; i++) quad(c[i], c[(i + 1) % 4], far[(i + 1) % 4], far[i]);
    quad(far[0], far[1], far[2], far[3]);
    const geo = new THREE.BufferGeometry().setFromPoints(verts), col = new Float32Array(verts.length * 3);
    verts.forEach((v, i) => { const t = far.indexOf(v) >= 0 ? 0.35 : 1.0; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = t; });
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(geo, beamMat(k.color, S.SUN_E * haze * 0.00012)); m.renderOrder = 5; m.userData.beam = true; group.add(m);
  });
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
    const pl = new THREE.PointLight(k.color, E1, 12, 2); pl.position.copy(pos); pl.castShadow = !!lastOpts.shadows && Q().soft > 0; pl.shadow.mapSize.set(Q().softMap, Q().softMap); pl.shadow.bias = -0.002; g.add(pl);
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
    const rl = new THREE.RectAreaLight(k.color, E1 * ((lastOpts.shadows && Q().soft > 0) ? 0.6 : 1) / (w * h), w, h); rl.position.copy(pos); rl.lookAt(tgt); g.add(rl); addBeam(g, pos, tgt, P.beam / 2 * Math.PI / 180 * 0.6, k.color, E1, true);
    // vizuální panel softboxu
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lum(k.color, E1 / (w * h)));
    panel.position.copy(pos); panel.lookAt(tgt); panel.position.add(dir.clone().multiplyScalar(-0.01)); g.add(panel);
    const back = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, h) * 0.55, 0.45, 4, 1, true), MAT.flag);
    back.position.copy(pos).add(dir.clone().multiplyScalar(-0.22)); back.lookAt(tgt); back.rotateX(-Math.PI / 2); g.add(back);
    // slabé stínové světlo, aby softbox také vrhal (měkký) stín
    const ns = lastOpts.shadows ? Q().soft : 0;
    if (ns > 0) { // stínová světla rozmístěná po ploše softboxu → měkký polostín (ultra: 4 vzorky)
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, dir).normalize();
      const offs = ns === 1 ? [[0, 0]] : [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]];
      offs.forEach(o => { const sp = new THREE.SpotLight(k.color, E1 * 0.4 / offs.length, 14, P.beam / 2 * Math.PI / 180, 0.9, 2);
        sp.position.copy(pos).add(right.clone().multiplyScalar(o[0] * w)).add(up.clone().multiplyScalar(o[1] * h)); sp.target.position.copy(tgt); sp.castShadow = true; sp.shadow.mapSize.set(Q().softMap, Q().softMap); sp.shadow.bias = -0.002; sp.shadow.radius = 8; g.add(sp); g.add(sp.target); });
    }
  } else {
    const half = P.beam / 2 * Math.PI / 180;
    const sp = new THREE.SpotLight(k.color, E1, 16, Math.min(half * 1.3, 1.5), L.barn ? 0.15 : (L.diff ? 0.8 : 0.45), 2);
    sp.position.copy(pos); sp.target.position.copy(tgt); sp.castShadow = !!lastOpts.shadows; sp.shadow.mapSize.set(Q().spot, Q().spot); sp.shadow.bias = -0.0015; sp.shadow.radius = L.diff ? 6 : 2;
    if (L.gobo && L.gobo !== 'none' && S.GOBOS[L.gobo]) { sp.map = goboTexture(L.gobo); sp.castShadow = true; sp.shadow.focus = 1; }
    g.add(sp); g.add(sp.target); addBeam(g, pos, tgt, half, k.color, E1, false);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.22, 16), MAT.metal); body.position.copy(pos); body.lookAt(tgt); body.rotateX(-Math.PI / 2); g.add(body);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), lum(k.color, E1 / 0.018)); face.position.copy(pos).add(dir.clone().multiplyScalar(0.115)); face.lookAt(tgt); g.add(face);
    if (L.diff) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), lum(k.color, E1 / 0.35)); d.material.transparent = true; d.material.opacity = 0.7; d.material.side = THREE.DoubleSide; d.position.copy(pos).add(dir.clone().multiplyScalar(0.18)); d.lookAt(tgt); g.add(d); }
  }
  stand(L.x, L.y, P.h, g);
}

function limb(mat, r, len, g, x, y, z, rx, rz) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 14), mat); m.position.set(x, y, z); m.rotation.set(rx || 0, 0, rz || 0); m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
// ---------- 3D modely postav (glTF, kostra Renderpeople, klipy idle/sit) ----------
const modelCache = {}; // id -> { gltf } | { loading: true } | { error: true }
function modelFor(id) {
  const m = S.MODELS[id]; if (!m || !m.file) return null;
  const c = modelCache[id]; if (c && c.gltf) return c.gltf; if (c) return null;
  modelCache[id] = { loading: true };
  const onLoad = g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (o.material) { o.material.roughness = Math.max(0.55, o.material.roughness || 0.8); o.material.metalness = 0; } } }); modelCache[id] = { gltf: g }; window.dispatchEvent(new Event('view3d-model')); };
  // některé hostingy .glb neservírují – zkusit náhradní název .glb.wasm (obsah je stejný binární glTF)
  new GLTFLoader().load(m.file, onLoad, undefined, () => { new GLTFLoader().load(m.file + '.wasm', onLoad, undefined, () => { modelCache[id] = { error: true }; }); });
  return null;
}
function addModelPerson(p, gltf) {
  const g = new THREE.Group(); g.position.set(p.x, 0, p.y); g.rotation.y = -p.rot; group.add(g);
  const inst = SkeletonUtils.clone(gltf.scene); inst.rotation.y = Math.PI / 2; // model kouká do +Z → náš směr je +X
  g.add(inst);
  const sit = p.pose === 'sit', clip = gltf.animations.find(a => a.name === (sit ? 'sit' : 'idle'));
  if (clip) { const mixer = new THREE.AnimationMixer(inst); const a = mixer.clipAction(clip); a.play(); mixer.setTime(Math.min(clip.duration - 0.01, sit ? 0.9 : 2.0 + ((p.id || 0) % 5) * 1.3)); }
  inst.updateMatrixWorld(true);
  if (sit) { // posadit: pánev do výšky sedáku + ~13 cm
    let hip = null; inst.traverse(o => { if (o.isBone && o.name === 'hip_02') hip = o; });
    if (hip) { const hy = hip.getWorldPosition(new THREE.Vector3()).y; inst.position.y = (0.45 + 0.13) - hy; }
    if (!S.seatUnder(lastScene, p)) chairMesh(g, 0.02, 0);
  }
}
function addPerson(p) {
  const mid = p.model || 'proc';
  if (mid !== 'proc') { const gl = modelFor(mid); if (gl) { addModelPerson(p, gl); return; } }

  const g = new THREE.Group(); g.position.set(p.x, 0, p.y); g.rotation.y = -p.rot; group.add(g);
  const sit = p.pose === 'sit', fz = S.faceZ(p), outfit = OUTFITS[p.outfit] || OUTFITS.dark, skinC = SKIN[p.skin] || SKIN.light;
  const skin = new THREE.MeshStandardMaterial({ color: skinC[0], roughness: 0.55 }), skinDark = new THREE.MeshStandardMaterial({ color: skinC[1], roughness: 0.6 });
  const hairMat = new THREE.MeshStandardMaterial({ color: HAIRCOL[p.hairColor] || HAIRCOL.dark, roughness: 0.6 });
  const shirt = texMat('cloth', outfit[0], { roughness: 0.95, bumpScale: 0.15 }), pants = texMat('cloth', outfit[1], { roughness: 0.95, bumpScale: 0.15 });
  const shoulder = sit ? 1.02 : 1.38, hip = sit ? 0.5 : 0.85, seatY = sit ? 0.45 : 0;
  // trup: hrudník (širší) + pas + boky
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, shoulder - hip - 0.16, 6, 16), shirt); chest.position.y = (shoulder + hip) / 2 + 0.02; chest.scale.set(1, 1, 1.4); g.add(chest);
  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.1, 6, 16), shirt); belly.position.y = hip + 0.1; belly.scale.set(1, 1, 1.35); g.add(belly);
  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.12, 6, 16), pants); pelvis.position.y = hip - 0.02; pelvis.rotation.x = Math.PI / 2; pelvis.scale.set(1, 1, 1); g.add(pelvis);
  [-1, 1].forEach(side => {
    const z = side * 0.19;
    const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), shirt); shoulderBall.position.set(0, shoulder - 0.04, z + side * 0.01); g.add(shoulderBall);
    if (sit) {
      limb(shirt, 0.045, 0.24, g, 0.03, shoulder - 0.17, z + side * 0.03, 0, 0.12);
      limb(skin, 0.038, 0.22, g, 0.17, shoulder - 0.33, z + side * 0.02, 0, Math.PI / 2 - 0.08);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), skin); hand.position.set(0.31, shoulder - 0.33, z + side * 0.02); hand.scale.set(1.2, 0.7, 0.9); g.add(hand);
      limb(pants, 0.075, 0.3, g, 0.2, hip - 0.02, side * 0.1, 0, Math.PI / 2);
      limb(pants, 0.058, 0.32, g, 0.4, hip - 0.25, side * 0.1, 0, 0.1);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.1), MAT.shoe); foot.position.set(0.48, 0.035, side * 0.1); g.add(foot);
    } else {
      limb(shirt, 0.045, 0.26, g, 0, shoulder - 0.19, z + side * 0.04, 0, side * 0.08);
      limb(skin, 0.038, 0.24, g, 0.02, shoulder - 0.47, z + side * 0.07, 0, side * 0.02);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), skin); hand.position.set(0.03, shoulder - 0.64, z + side * 0.07); hand.scale.set(0.8, 1.2, 0.9); g.add(hand);
      limb(pants, 0.075, 0.32, g, 0, hip - 0.22, side * 0.1, 0, 0);
      limb(pants, 0.058, 0.3, g, 0, hip - 0.6, side * 0.1, 0, 0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.1), MAT.shoe); foot.position.set(0.06, 0.035, side * 0.1); g.add(foot);
    }
  });
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.012, 6, 24), MAT.shoe); belt.position.y = hip + 0.02; belt.rotation.x = Math.PI / 2; belt.scale.set(1, 1.3, 1); g.add(belt);
  // krk + hlava
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.14, 12), skin); neck.position.y = shoulder + 0.03; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 24), skin); head.position.y = fz; head.scale.set(0.92, 1.14, 1); g.add(head);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), skin); jaw.position.set(0.02, fz - 0.07, 0); jaw.scale.set(1, 0.8, 1.05); g.add(jaw);
  // vlasy: koule přes hlavu oříznutá šikmou rovinou (vlasová linie vpředu výš, vzadu níž)
  const style = p.hair || 'short';
  if (style !== 'bald') {
    const hairGeo = new THREE.SphereGeometry(0.1185, 40, 28);
    const hm = hairMat.clone(); hm.clippingPlanes = []; hm.clipShadows = true;
    const hairM = new THREE.Mesh(hairGeo, hm); hairM.position.set(-0.012, fz + 0.018, 0); hairM.scale.set(0.95, 1.14, 1.03); g.add(hairM);
    // rovina v souřadnicích světa: normála nahoru + kousek dopředu → vpředu je linie vysoko (čelo), vzadu nízko (šíje)
    g.updateMatrixWorld(true);
    const c = new THREE.Vector3(0.0, fz + (style === 'long' ? -0.015 : 0.0), 0).applyMatrix4(g.matrixWorld);
    const n = new THREE.Vector3(style === 'long' ? -0.95 : -0.8, 1, 0).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion())).normalize();
    hm.clippingPlanes = [new THREE.Plane(n, -n.dot(c))];
    if (style === 'long') { // dlouhé vlasy: závěs vzadu a po stranách k ramenům
      const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.145, 0.36, 24, 1, true, Math.PI, Math.PI), hairMat); cape.position.set(-0.01, fz - 0.13, 0); cape.material = hairMat.clone(); cape.material.side = THREE.DoubleSide; g.add(cape);
    }
    if (style === 'bun') { const bun = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), hairMat); bun.position.set(-0.1, fz + 0.06, 0); g.add(bun); }
  }
  // obličej
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 10), skinDark); nose.position.set(0.105, fz - 0.015, 0); nose.rotation.z = -Math.PI / 2; g.add(nose);
  [-0.037, 0.037].forEach(z => {
    const ew = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), MAT.eyeWhite); ew.position.set(0.094, fz + 0.025, z); ew.scale.set(0.6, 1, 1); g.add(ew);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 10, 8), new THREE.MeshStandardMaterial({ color: p.hairColor === 'blond' ? 0x4a7aa8 : 0x4a3a2a, roughness: 0.3 })); iris.position.set(0.1035, fz + 0.025, z); g.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), MAT.eye); pupil.position.set(0.109, fz + 0.025, z); g.add(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.007, 0.04), hairMat); brow.position.set(0.098, fz + 0.052, z); brow.rotation.x = z > 0 ? 0.15 : -0.15; g.add(brow);
  });
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.045), MAT.mouth); mouth.position.set(0.1, fz - 0.052, 0); g.add(mouth);
  [-0.106, 0.106].forEach(z => { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), skin); ear.position.set(-0.01, fz + 0.005, z); ear.scale.set(0.5, 1.2, 1); g.add(ear); });
  if (sit && !S.seatUnder(lastScene, p)) chairMesh(g, 0.02, 0);
}
// jednoduchá židle (sedák 0,45 m, opěradlo vzadu = -x)
function chairMesh(g, x, z) {
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.45), MAT.wood); seat.position.set(x, 0.45, z); g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.42), MAT.wood); back.position.set(x - 0.21, 0.7, z); g.add(back);
  [[-0.2, -0.2], [-0.2, 0.2], [0.2, -0.2], [0.2, 0.2]].forEach(o => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.015, 0.45, 8), MAT.woodDark); l.position.set(x + o[0], 0.225, z + o[1]); g.add(l); });
}
function box(g, mat, w, h, d, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
// polštář: kapsle zploštělá do kvádru s oblými hranami
function cushion(g, mat, w, h, d, x, y, z) { const r = Math.min(w, h) / 2; const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, d - 2 * r), 4, 14), mat); m.rotation.x = Math.PI / 2; m.scale.set(w / (2 * r), h / (2 * r), 1); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
function addFurniture(it) {
  const g = new THREE.Group(); g.position.set(it.x, 0, it.y); g.rotation.y = -(it.rot || 0); group.add(g);
  const f = S.FURNITURE[it.type] || S.FURNITURE.block, w = it.w || f.w, d = it.d || f.d, t = it.type;
  const fabric = texMat('fabric', 0x4e5a70, { roughness: 1, bumpScale: 0.3 }), fabric2 = texMat('fabric', 0x5b6780, { roughness: 1, bumpScale: 0.3 }), bedding = texMat('cloth', 0xe4dfd3, { roughness: 1, bumpScale: 0.2 }), blanket = texMat('fabric', 0x7a6a5a, { roughness: 1, bumpScale: 0.3 });
  if (t === 'sofa' || t === 'armchair') {
    box(g, fabric, w, 0.22, d, 0, 0.16, 0);                                   // rám
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(o => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8), MAT.woodDark); l.position.set(o[0] * (w / 2 - 0.06), 0.03, o[1] * (d / 2 - 0.06)); g.add(l); });
    const n = t === 'sofa' ? Math.max(2, Math.round(d / 0.7)) : 1, cw = (d - 0.36) / n;             // sedáky podél délky (délka gauče = d, opěradlo vzadu = -x)
    for (let i = 0; i < n; i++) { const zc = -d / 2 + 0.18 + cw * (i + 0.5); cushion(g, fabric2, w - 0.24, 0.16, cw - 0.03, 0.05, 0.35, zc); cushion(g, fabric2, 0.16, 0.5, cw - 0.03, -w / 2 + 0.2, 0.62, zc).rotation.z = 0.12; }
    box(g, fabric, 0.18, 0.75, d, -w / 2 + 0.09, 0.37, 0);                  // opěradlo
    cushion(g, fabric, w - 0.1, 0.18, 0.2, 0.05, 0.5, -d / 2 + 0.09);      // područky
    cushion(g, fabric, w - 0.1, 0.18, 0.2, 0.05, 0.5, d / 2 - 0.09);
  } else if (t === 'chair') { chairMesh(g, 0, 0); }
  else if (t === 'table' || t === 'coffee') {
    const h = f.h; box(g, MAT.wood, w, 0.035, d, 0, h - 0.018, 0);
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(o => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, h - 0.035, 10), MAT.woodDark); l.position.set(o[0] * (w / 2 - 0.06), (h - 0.035) / 2, o[1] * (d / 2 - 0.06)); l.castShadow = true; g.add(l); });
  } else if (t === 'bed') {
    box(g, MAT.woodDark, w, 0.22, d, 0, 0.11, 0); cushion(g, bedding, w - 0.06, 0.2, d - 0.06, 0, 0.32, 0);
    cushion(g, blanket, w - 0.14, 0.08, d * 0.62, 0.02, 0.43, d * 0.15);   // deka
    box(g, MAT.wood, 0.05, 0.9, d, -w / 2 + 0.025, 0.45, 0);              // čelo (vzadu = -x)
    [-0.22, 0.22].forEach(z => cushion(g, bedding, 0.4, 0.1, Math.min(0.5, d * 0.22), -w / 2 + 0.32, 0.47, z * d));
  } else if (t === 'wardrobe') {
    box(g, MAT.wood, w, f.h, d, 0, f.h / 2, 0);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.006, f.h - 0.1, 0.012), MAT.shoe); line.position.set(w / 2 + 0.003, f.h / 2, 0); g.add(line);
    [-0.06, 0.06].forEach(z => { const kn = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), MAT.chrome); kn.position.set(w / 2 + 0.015, 1.0, z); g.add(kn); });
  } else if (t === 'shelf') {
    box(g, MAT.woodDark, w, f.h, 0.03, 0, f.h / 2, -d / 2 + 0.015);
    [0.03, 0.4, 0.8, 1.2, 1.6, f.h - 0.03].forEach(y => box(g, MAT.wood, w, 0.03, d, 0, y, 0));
    box(g, MAT.wood, 0.03, f.h, d, -w / 2 + 0.015, f.h / 2, 0); box(g, MAT.wood, 0.03, f.h, d, w / 2 - 0.015, f.h / 2, 0);
    const r = mulberry(77); [0.4, 0.8, 1.2, 1.6].forEach(y => { let x = -w / 2 + 0.06; while (x < w / 2 - 0.08) { const bw = 0.025 + r() * 0.03, bh = 0.2 + r() * 0.13; const bk = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, d * 0.7), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(r(), 0.4, 0.3 + r() * 0.3), roughness: 0.8 })); bk.position.set(x + bw / 2, y + bh / 2 + 0.015, 0); g.add(bk); x += bw + 0.004; if (r() < 0.15) x += 0.08; } });
  } else { const hh = it.h == null ? (it.tall ? 2.0 : f.h) : it.h;
    const mats = { wood: MAT.wood, white: texMat('plaster', 0xe8e4dc, { roughness: 0.6, bumpScale: 0.1 }), dark: texMat('plaster', 0x2c2a28, { roughness: 0.7, bumpScale: 0.1 }), metal: MAT.chrome, concrete: texMat('concrete', 0x8a8a8a, { roughness: 0.9 }), fabric: texMat('fabric', 0x6a6f7a, { roughness: 1 }) };
    box(g, mats[it.mat] || MAT.wood, w, hh, d, 0, hh / 2, 0); }
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

function addWindow(sc, w) {
  if (typeof w.wall !== 'string') return;
  const sk = S.SKY[sc.sky] || S.SKY.overcast, k = kel(sk.cct), len = w.to - w.from, mid = (w.from + w.to) / 2, W = sc.room.w, H = sc.room.h;
  let pos, look;
  if (w.wall === 'left') { pos = [0.005, 1.5, mid]; look = [1, 1.5, mid]; } else if (w.wall === 'right') { pos = [W - 0.005, 1.5, mid]; look = [W - 1, 1.5, mid]; }
  else if (w.wall === 'top') { pos = [mid, 1.5, 0.005]; look = [mid, 1.5, 1]; } else { pos = [mid, 1.5, H - 0.005]; look = [mid, 1.5, H - 1]; }
  const bl = S.blindOf(w), openH = 1.2 * (1 - bl), E1 = sk.E * len / 1.2 * k.gain * (1 - bl * 0.97);
  if (openH > 0.01) {
    const rl = new THREE.RectAreaLight(k.color, E1 / (len * openH), len, openH); rl.position.set(pos[0], S.WIN_Z0 + openH / 2, pos[2]); rl.lookAt(look[0], S.WIN_Z0 + openH / 2, look[2]); group.add(rl);
    const exOn = sc.exterior && sc.exterior.on;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, openH), exOn ? new THREE.MeshBasicMaterial({ color: k.color.clone().multiplyScalar(sk.E / Math.PI * 0.15), transparent: true, opacity: 0.35, depthWrite: false }) : lum(k.color, sk.E * len / 1.2 * k.gain / (len * 1.2)));
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
  if (lastOpts.shadows && openH > 0.01) { const sp = new THREE.SpotLight(k.color, E1 * 0.3, 14, 0.9, 1, 2); sp.position.set(pos[0] + (look[0] - pos[0]) * -0.3, S.WIN_Z0 + openH / 2, pos[2] + (look[2] - pos[2]) * -0.3); sp.target.position.set(look[0], 1.2, look[2]); sp.castShadow = true; sp.shadow.mapSize.set(Q().winMap, Q().winMap); sp.shadow.radius = 10; sp.shadow.bias = -0.002; group.add(sp); group.add(sp.target); }
}

// souřadnice na stěně: s = poloha podél stěny (m), y = výška; vrací [x,z] v místnosti a směr dovnitř
function wallFrame(sc, side) {
  const W = sc.room.w, H = sc.room.h;
  if (side === 'top') return { len: W, at: (s, y) => [s, y, 0], inward: [0, 1], ry: 0 };
  if (side === 'bottom') return { len: W, at: (s, y) => [s, y, H], inward: [0, -1], ry: Math.PI };
  if (side === 'left') return { len: H, at: (s, y) => [0, y, s], inward: [1, 0], ry: Math.PI / 2 };
  return { len: H, at: (s, y) => [W, y, s], inward: [-1, 0], ry: -Math.PI / 2 };
}
function addExterior(sc) {
  const ex = sc.exterior; if (!ex || !ex.on) return;
  const sk = S.SKY[sc.sky] || S.SKY.overcast, W = sc.room.w, H = sc.room.h, k = kel(sk.cct), Lsky = sk.E / Math.PI;
  const skyTint = sc.sky === 'sunny' ? new THREE.Color(0.55, 0.72, 1.0) : sc.sky === 'dusk' ? new THREE.Color(0.55, 0.5, 0.75) : new THREE.Color(0.85, 0.87, 0.9);
  scene3.background = skyTint.multiplyScalar(Lsky * 0.45);
  // materiál venku: obloha „zapečená“ do emissive (aby nesvítila dovnitř), slunce navíc přes DirectionalLight
  const ext = (color, kind, rep) => { const m = texMat(kind || 'cloth', color, { roughness: 1, bumpScale: 0.2 }); const c = new THREE.Color(color); m.emissive = c.clone().multiply(k.color); m.emissiveIntensity = Lsky * 0.45; if (rep) { m.map = m.map.clone(); m.map.repeat.set(rep, rep); m.map.needsUpdate = true; } return m; };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), ext(0x4e6b34, 'fabric', 40)); ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, -0.01, H / 2); ground.receiveShadow = true; group.add(ground);
  // obrubník / základová deska domu
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.12, H + 0.6), ext(0x8c8880, 'concrete', 4)); slab.position.set(W / 2, -0.06, H / 2); group.add(slab);
  const trunkMat = ext(0x5a4030, 'wood', 1), leafMat = ext(0x3f7a33, 'fabric', 3), conMat = ext(0x2f5a2c, 'fabric', 3);
  S.exteriorTrees(sc).forEach(t => {
    const g = new THREE.Group(); g.position.set(t.x, 0, t.y); group.add(g);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, t.h * 0.45, 8), trunkMat); trunk.position.y = t.h * 0.225; g.add(trunk);
    if (t.kind === 'conifer') { [0, 1, 2].forEach(i => { const c = new THREE.Mesh(new THREE.ConeGeometry(t.r * (1 - i * 0.25), t.h * 0.35, 10), conMat); c.position.y = t.h * 0.35 + i * t.h * 0.2; g.add(c); }); }
    else { [[0, t.h * 0.62, 0, 1], [t.r * 0.5, t.h * 0.75, t.r * 0.2, 0.75], [-t.r * 0.45, t.h * 0.7, -t.r * 0.3, 0.7], [0, t.h * 0.85, 0, 0.6]].forEach(o => { const b = new THREE.Mesh(new THREE.SphereGeometry(t.r * o[3], 12, 10), leafMat); b.position.set(o[0], o[1], o[2]); b.scale.y = 0.85; g.add(b); }); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  });
  // vzdálený horizont (pás keřů/lesa), aby nebyla obloha úplně prázdná
  const hedge = new THREE.Mesh(new THREE.CylinderGeometry(38, 38, 2.2, 48, 1, true), ext(0x35592a, 'fabric', 30)); hedge.position.set(W / 2, 1.1, H / 2); hedge.material.side = THREE.BackSide; group.add(hedge);
}
function addRoom(sc) {
  const W = sc.room.w, H = sc.room.h, Z = sc.room.z || 2.7;
  const wallMat = surfMat('plaster', WALLCOL[sc.walls || 'normal'], W / 2.5, Z / 2.5, { roughness: 0.95, bumpScale: 0.35 });
  const floorMat = surfMat(FLOORTEX[sc.floor || 'wood'], FLOORCOL[sc.floor || 'wood'], W / 2, H / 2, { roughness: sc.floor === 'wood' ? 0.55 : 0.85, bumpScale: 0.5 });
  const ceilMat = surfMat('ceiling', 0xd0cbc2, W / 2.5, H / 2.5, { roughness: 1, bumpScale: 0.2 });
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
  const Z = sc.room.z || 2.7, mat = surfMat('plaster', WALLCOL[sc.walls || 'normal'], L / 2.5, Z / 2.5, { roughness: 0.95, bumpScale: 0.35 });
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
  const R2 = (sc.exterior && sc.exterior.on) ? R + 8 : R; const c = sun.shadow.camera; c.left = -R2; c.right = R2; c.top = R2; c.bottom = -R2; c.near = 1; c.far = 60; c.updateProjectionMatrix(); sun.shadow.mapSize.set(Q().sunMap, Q().sunMap);
  group.add(sun); group.add(sun.target);
}
function addDoor(sc, d) {
  const fr = wallFrame(sc, d.wall), L = S.DOORLIGHT[d.light] || S.DOORLIGHT.none, k = kel(L.cct), open = d.open !== false;
  const inX = fr.inward[0], inZ = fr.inward[1], c = fr.at(d.at, 1.025);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.8 }), leafMat = texMat('wood', 0xcdbba0, { roughness: 0.6, bumpScale: 0.3 });
  const g = new THREE.Group(); g.position.set(c[0], 0, c[2]); g.rotation.y = fr.ry; group.add(g);
  // zárubeň (lokálně: x podél stěny, z = dovnitř místnosti)
  [-1, 1].forEach(sd => box(g, frameMat, 0.06, 2.1, 0.14, sd * (d.w / 2 + 0.03), 1.05, 0));
  box(g, frameMat, d.w + 0.12, 0.06, 0.14, 0, 2.08, 0);
  if (open) {
    // křídlo otevřené o 85° do místnosti, závěs na levé straně
    const leaf = new THREE.Group(); leaf.position.set(-d.w / 2, 0, 0.05); leaf.rotation.y = -Math.PI * 0.47; g.add(leaf);
    box(leaf, leafMat, d.w, 2.02, 0.04, d.w / 2, 1.01, 0);
    // prostor za dveřmi: podlaha + stěny chodby, na konci svítící / tmavá stěna
    const hallMat = texMat('plaster', WALLCOL[sc.walls || 'normal'], { roughness: 1, side: THREE.DoubleSide, bumpScale: 0.3 });
    const hf = new THREE.Mesh(new THREE.PlaneGeometry(d.w + 0.6, 1.6), texMat(FLOORTEX[sc.floor || 'wood'], FLOORCOL[sc.floor || 'wood'], { roughness: 0.8 })); hf.rotation.x = -Math.PI / 2; hf.position.set(0, 0.001, -0.8); g.add(hf);
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
  stopPT();
  applyQualityRatio();
  clear(group);
  scene3.background = new THREE.Color(0x000000); addExterior(sc); addRoom(sc); (sc.windows || []).forEach(w => addWindow(sc, w)); addSun(sc); addSunBeams(sc); sc.items.forEach(it => { if (it.kind === 'wall') addWallItem(sc, it); });
  sc.items.forEach(it => {
    if (it.kind === 'light') addLight(it, res);
    else if (it.kind === 'person') addPerson(it);
    else if (it.kind === 'bounce') addBounce(it, res);
    else if (it.kind === 'flag') { const g = new THREE.Group(); g.position.set(it.x, 0, it.y); g.rotation.y = -it.rot; const m = new THREE.Mesh(new THREE.PlaneGeometry(it.len, 0.9), MAT.flag); m.position.y = 1.5; m.castShadow = true; g.add(m); stand(0, 0, 1.05, g); group.add(g); }
    else if (it.kind === 'box' || it.kind === 'furniture') addFurniture(it);
    else if (it.kind === 'camera') { camMesh = new THREE.Group(); camMesh.position.set(it.x, 0, it.y); camMesh.rotation.y = -it.rot; const ch = it.h == null ? 1.5 : it.h; const b = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.15, 0.13), MAT.metal); b.position.y = ch + 0.07; camMesh.add(b); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.047, 0.14, 14), MAT.metal); l.position.set(0.18, ch + 0.07, 0); l.rotation.z = -Math.PI / 2; camMesh.add(l); const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), MAT.eye); lens.position.set(0.251, ch + 0.07, 0); lens.rotation.y = Math.PI / 2; camMesh.add(lens); const mon = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.14), MAT.metal); mon.position.set(-0.1, ch + 0.2, 0.05); camMesh.add(mon); tripod(camMesh, ch); group.add(camMesh); }
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
  if (haze > 0) { const ac = res ? res.ambCol : [1, 1, 1], am = Math.max(1e-3, (ac[0] + ac[1] + ac[2]) / 3), fc = new THREE.Color(ac[0] / am, ac[1] / am, ac[2] / am).multiplyScalar(refL * 0.03 * (0.1 + haze)); scene3.fog = new THREE.FogExp2(fc, 0.01 + haze * 0.06); }
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
function toggleOrbit() { stopPT(); orbit = !orbit; controls.enabled = orbit; if (camMesh) camMesh.visible = orbit; setSel(selId); dirty = true; return orbit; }
function isOrbit() { return orbit; }
function render() { if (!renderer || !lastScene) return;
  const pr = renderer.getPixelRatio(), cw = canvas.width, ch = canvas.height;
  if (orbit || !region || formatAspect() <= 0) { renderer.setScissorTest(false); renderer.setViewport(0, 0, cw / pr, ch / pr); renderer.render(scene3, orbit ? orbitCam : camera); return; }
  renderer.setScissorTest(false); renderer.setClearColor(0x000000, 1); renderer.clear();
  const bg = scene3.background; // letterbox: černé okolí, obloha jen uvnitř záběru
  renderer.setViewport(region.x, ch / pr - region.y - region.h, region.w, region.h); renderer.setScissor(region.x, ch / pr - region.y - region.h, region.w, region.h); renderer.setScissorTest(true);
  renderer.render(scene3, camera); renderer.setScissorTest(false); }
function shot() { if (!pt.done && !pt.active) render();
  const pr = renderer.getPixelRatio(), crop = (!orbit && region && formatAspect() > 0) ? { x: region.x * pr, y: region.y * pr, w: region.w * pr, h: region.h * pr } : { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const c = document.createElement('canvas'); c.width = crop.w; c.height = crop.h; const g = c.getContext('2d'); g.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  if (lastOpts.grain > 0 && grainCv.width) { g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.85; g.drawImage(grainCv, crop.x / pr / 2, crop.y / pr / 2, crop.w / pr / 2, crop.h / pr / 2, 0, 0, crop.w, crop.h); }
  return c.toDataURL('image/png'); }
function setCameraCallback(fn) { onCamera = fn; }
function hasCamera() { return !!(lastScene && lastScene.items.some(i => i.kind === 'camera')); }

// ---------- path tracing (three-gpu-pathtracer) – render snímku na tlačítko ----------
const pt = { active: false, done: false, tracer: null, samples: 0, target: 0, onProgress: null, restore: null, loading: null };
function ptSupported() { try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); return !!(gl && gl.getExtension('EXT_color_buffer_float')); } catch (e) { return false; } }
function loadPTLib() { if (window.PT_LIB) return Promise.resolve(); if (pt.loading) return pt.loading; pt.loading = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'vendor/pathtracer-bundle.js'; sc.onload = res; sc.onerror = () => rej(new Error('load')); document.head.appendChild(sc); }); return pt.loading; }
// scéna pro tracer: bez mlhových kuželů a pomocných objektů, svítící panely jako emisivní materiály, bez mlhy
function ptPrepare() {
  const removed = [], swapped = [];
  group.traverse(o => { if (o.userData.beam) removed.push([o, o.parent]); });
  removed.forEach(([o, par]) => par.remove(o));
  group.traverse(o => { if (o.isMesh && o.material && o.material.userData.lum) { const L = o.material.userData.lum; const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: L.color, emissiveIntensity: L.nits * 0.12, roughness: 1 }); swapped.push([o, o.material]); o.material = m; } });
  const ring = floorRing.visible; floorRing.visible = false; const cm = camMesh ? camMesh.visible : false; if (camMesh) camMesh.visible = false;
  const fog = scene3.fog; scene3.fog = null;
  const hidden = []; group.traverse(o => { if (o.isMesh && o.material && (o.material.transparent && o.material.blending === THREE.AdditiveBlending)) { hidden.push([o, o.parent]); } });
  hidden.forEach(([o, par]) => par.remove(o));
  return () => { removed.concat(hidden).forEach(([o, par]) => par.add(o)); swapped.forEach(([o, m]) => { o.material = m; }); floorRing.visible = ring; if (camMesh) camMesh.visible = cm; scene3.fog = fog; };
}
async function startPT(opts) {
  if (!lastScene || orbit) return false;
  stopPT();
  await loadPTLib();
  if (!pt.tracer) { pt.tracer = new window.PT_LIB.WebGLPathTracer(renderer); pt.tracer.tiles.set(2, 2); pt.tracer.textureSize.set(1024, 1024); pt.tracer.filterGlossyFactor = 0.5; pt.tracer.renderToCanvas = false; }
  const q = (opts && opts.quality) || 'mid';
  pt.tracer.bounces = q === 'low' ? 3 : q === 'high' ? 8 : 5; pt.tracer.renderScale = (opts && opts.scale) || (q === 'low' ? 0.5 : 1);
  pt.target = (opts && opts.samples) || (q === 'low' ? 32 : q === 'high' ? 512 : 128);
  pt.onProgress = opts && opts.onProgress;
  pt.restore = ptPrepare();
  try { pt.tracer.setScene(scene3, camera); } catch (e) { pt.restore(); pt.restore = null; throw e; }
  pt.samples = 0; pt.active = true; pt.done = false; return true;
}
function ptDraw() { const t = pt.tracer.target; const pr = renderer.getPixelRatio(), cw = canvas.width / pr, ch = canvas.height / pr; renderer.setScissorTest(false); renderer.setViewport(0, 0, cw, ch); renderer.setClearColor(0x000000, 1); renderer.clear();
  const rg = (!orbit && region && formatAspect() > 0) ? region : { x: 0, y: 0, w: cw, h: ch }; renderer.setViewport(rg.x, ch - rg.y - rg.h, rg.w, rg.h); renderer.setScissor(rg.x, ch - rg.y - rg.h, rg.w, rg.h); renderer.setScissorTest(true);
  if (!pt.quad) { pt.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: t.texture, transparent: false })); pt.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); pt.quadScene = new THREE.Scene(); pt.quadScene.add(pt.quad); }
  pt.quad.material.map = t.texture; renderer.render(pt.quadScene, pt.quadCam); renderer.setScissorTest(false); }
function ptStep() { if (!pt.active) return; if (pt.tracer.isCompiling) { if (pt.onProgress) pt.onProgress({ compiling: true }); return; }
  const t0 = performance.now(); do { pt.tracer.renderSample(); pt.samples = pt.tracer.samples; } while (performance.now() - t0 < 40 && pt.samples < pt.target);
  ptDraw(); if (pt.onProgress) pt.onProgress({ samples: Math.floor(pt.samples), target: pt.target });
  if (pt.samples >= pt.target) { pt.active = false; pt.done = true; if (pt.restore) { pt.restore(); pt.restore = null; } if (pt.onProgress) pt.onProgress({ done: true, samples: Math.floor(pt.samples) }); } }
function stopPT() { if (!pt.active && !pt.done) return; const was = pt.active; pt.active = false; pt.done = false; if (pt.restore) { pt.restore(); pt.restore = null; } if (was && pt.onProgress) pt.onProgress({ stopped: true }); dirty = true; }
function ptState() { return { active: pt.active, done: pt.done, samples: Math.floor(pt.samples), target: pt.target, supported: ptSupported() }; }

window.View3D = { init, resize, sync, startPT, stopPT, ptState, region: () => region, setSel, toggleOrbit, isOrbit, render, shot, hasCamera, wantsKeys, setCameraCallback, applyCamera: () => { applyCamera(); dirty = true; }, _dbg: () => ({ scene3, renderer, group, camera }) };
window.dispatchEvent(new Event('view3d-ready'));
})();
