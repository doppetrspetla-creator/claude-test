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
// barva světla: RGB režim (P.rgb, lineární, max = 1; gain vrací lux zpět na „bílý“ výkon) nebo teplota chromatičnosti
function kelL(P) { return P.rgb ? { color: new THREE.Color(P.rgb[0], P.rgb[1], P.rgb[2]), gain: 1 / P.Y } : kel(P.cct); }
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
  else if (kind === 'asphalt') { c = noiseCanvas(N, (g) => { g.fillStyle = '#6e6e6c'; g.fillRect(0, 0, N, N); blotches(g, N, 70, 0.35, 71, 60); const r = mulberry(73); // kamínky drti
      for (let i = 0; i < 9000; i++) { const v = r() < 0.5 ? 40 + r() * 40 : 140 + r() * 70, a = 0.35 + r() * 0.5, x = r() * N, y = r() * N, sz = 0.8 + r() * 1.8; g.fillStyle = `rgba(${v},${v},${v - 4},${a})`; g.fillRect(x, y, sz, sz); }
      g.strokeStyle = 'rgba(30,30,30,0.35)'; g.lineWidth = 1.2; for (let i = 0; i < 3; i++) { let x = r() * N, y = r() * N; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 14; k++) { x += (r() - 0.5) * 40; y += (r() - 0.3) * 30; g.lineTo(x, y); } g.stroke(); } // drobné praskliny
      grain(g, N, 30, 75); }); rep = [1, 1]; }
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
const FLOORCOL = { wood: 0x8a6444, grey: 0x777777, dark: 0x44403c, asphalt: 0x8a8a8a, grass: 0x4e6b34 };
const FLOORTEX = { wood: 'wood', grey: 'concrete', dark: 'darkfloor', asphalt: 'asphalt', grass: 'fabric' };

function init(cv) {
  canvas = cv; wrap = cv.parentElement;
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); curPR = Math.min(devicePixelRatio, 2);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.localClippingEnabled = true;
  scene3 = new THREE.Scene(); scene3.background = new THREE.Color(0x000000);
  camera = new THREE.PerspectiveCamera(40, 1, 0.05, 400); // daleko: kupole oblohy velkého exteriéru
  orbitCam = new THREE.PerspectiveCamera(50, 1, 0.05, 250);
  controls = new OrbitControls(orbitCam, cv); controls.enabled = false; controls.enableDamping = true;
  controls.addEventListener('change', () => { dirty = true; });
  group = new THREE.Group(); scene3.add(group);
  floorRing = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.26, 40), MAT.gold); floorRing.rotation.x = -Math.PI / 2; floorRing.visible = false; scene3.add(floorRing);
  // zrno (overlay canvas)
  grainCv = document.createElement('canvas'); grainCv.className = 'grain'; wrap.appendChild(grainCv); grainCtx = grainCv.getContext('2d');
  // hotový render se drží jako 2D kopie – Safari po dokončení může obsah WebGL plátna zahodit
  hq.result = document.createElement('canvas'); hq.result.className = 'ptResult'; hq.result.style.display = 'none'; wrap.insertBefore(hq.result, grainCv);
  pose.cv = document.createElement('canvas'); pose.cv.className = 'poseOverlay'; pose.cv.style.display = 'none'; wrap.appendChild(pose.cv); pose.ctx = pose.cv.getContext('2d');
  // FPS ovládání kamery: hover + klávesy + myš
  cv.tabIndex = 0;
  cv.addEventListener('pointerenter', () => { over = true; }); cv.addEventListener('pointerleave', () => { over = false; keys = {}; });
  // dotyk: dva prsty = ohnisko (sevřít / roztáhnout); registrováno dřív, aby druhý prst nespustil rozhlížení
  const touches = new Map(); let pinch = null;
  const pinchDist = () => { const v = [...touches.values()]; return Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]) || 1; };
  cv.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2 && camItem && !orbit) { if (lookDrag) { camItem.rot = lookDrag.rot; camItem.tilt = lookDrag.tilt; lookDrag = null; } if (objDrag) objUp(); pinch = { d0: pinchDist(), f0: camItem.focal || 35 }; e.stopImmediatePropagation(); } });
  cv.addEventListener('pointermove', e => { if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && touches.size >= 2) { camItem.focal = Math.round(Math.max(14, Math.min(135, pinch.f0 * pinchDist() / pinch.d0))); emitCam(false); e.stopImmediatePropagation(); } });
  const touchEnd = e => { touches.delete(e.pointerId); if (pinch && touches.size < 2) { pinch = null; emitCam(true); e.stopImmediatePropagation(); } };
  cv.addEventListener('pointerup', touchEnd); cv.addEventListener('pointercancel', touchEnd);
  cv.addEventListener('pointerdown', e => { cv.focus(); if (e.button === 0 && poseDown(e)) { cv.setPointerCapture(e.pointerId); if (orbit) controls.enabled = false; return; }
    if (ctrlMode === 'object') { if (e.button === 0 && objDown(e)) { cv.setPointerCapture(e.pointerId); if (orbit) controls.enabled = false; } return; } // OVLÁDÁNÍ OBJEKTU: chycení objektu → posun po podlaze
    // OVLÁDÁNÍ KAMERY: objekty se ignorují, levé tlačítko kdekoli = rozhlížení
    if (orbit || e.button !== 0 || !camItem) return; lookDrag = { x: e.clientX, y: e.clientY, rot: camItem.rot, tilt: camItem.tilt || 0 }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (pose.drag) { poseMove(e); return; } if (objDrag) { objMove(e); return; } if (pose.on && !lookDrag) { cv.style.cursor = poseHoverAt(e) ? 'grab' : 'crosshair'; } if (!lookDrag || !camItem) return; const dx = e.clientX - lookDrag.x, dy = e.clientY - lookDrag.y, f = (camItem.focal || 35);
    const k = 0.0025 * 35 / f; camItem.rot = lookDrag.rot + dx * k; camItem.tilt = Math.max(-1.2, Math.min(1.2, lookDrag.tilt - dy * k)); camItem.aim = false; emitCam(false); });
  cv.addEventListener('pointerup', () => { if (pose.drag) { poseUp(); if (orbit) controls.enabled = true; return; } if (objDrag) { objUp(); if (orbit) controls.enabled = true; return; } if (lookDrag) { lookDrag = null; emitCam(true); } });
  cv.addEventListener('wheel', e => { if (ctrlMode === 'object' && !camSel()) { if (!orbit) e.preventDefault(); if (!selItem()) return; e.preventDefault(); objRotate((e.deltaY > 0 ? 1 : -1) * (e.shiftKey ? 1 : 5) * Math.PI / 180); return; }
    if (orbit || !camItem) return; e.preventDefault(); camItem.focal = Math.round(Math.max(14, Math.min(135, (camItem.focal || 35) * (e.deltaY > 0 ? 0.92 : 1.087)))); emitCam(true); }, { passive: false });
  window.addEventListener('keydown', e => { if (!wantsKeys()) return; const k = e.key.toLowerCase(); if ('wasdqe'.includes(k) || e.key.startsWith('Arrow')) { keys[k === ' ' ? k : (e.key.startsWith('Arrow') ? e.key : k)] = true; e.preventDefault(); } });
  window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); delete keys[k]; delete keys[e.key]; });
  resize();
  (function loop(t) { requestAnimationFrame(loop); const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t; if (orbit) controls.update(); if (walk(dt)) { stopHQ(); dirty = true; } if (hq.active) { hqStep(); dirty = false; } else if (hq.done) { dirty = false; } else if (dirty) { dirty = false; render(); } drawGrain(t); drawPose(); })(0);
}
// profil kvality: náhled (rychlý), standard, ultra (měkké stíny z více vzorků, jemnější mlha, plné rozlišení)
function Q() { const q = lastOpts.quality || 'mid'; return q === 'low' ? { spot: 512, soft: 0, softMap: 512, winMap: 512, beams: 3, pr: Math.min(devicePixelRatio, 1) * 0.8, sunMap: 1024 }
  : q === 'high' ? { spot: 4096, soft: 4, softMap: 1024, winMap: 2048, beams: 14, pr: Math.min(devicePixelRatio, 2), sunMap: 4096 }
  : { spot: 2048, soft: 1, softMap: 1024, winMap: 1024, beams: 7, pr: Math.min(devicePixelRatio, 2), sunMap: 2048 }; }
let curPR = 0;
const rigs = {}; // id postavy -> { inst, bones: {name: Bone} } pro editor pózy
const pose = { on: false, drag: null, handles: [], onChange: null, cv: null, ctx: null };
// HQ render: náhodné posuny zdrojů světla v každém průchodu → po zprůměrování měkké stíny podle velikosti zdroje
const hq = { active: false, done: false, building: false, pass: 0, passes: 0, acc: null, result: null, onProgress: null, savedQuality: null };
function jit() { return hq.active ? (Math.random() - 0.5) : 0; }
function applyQualityRatio() { const pr = Q().pr; if (Math.abs(pr - curPR) > 0.01) { curPR = pr; renderer.setPixelRatio(pr); resize(); } }
function formatAspect() { const f = lastScene && lastScene.format, F = S.FORMATS[f]; return F ? F.a : 0; }
function wantsKeys() { if (!(over || document.activeElement === canvas)) return false; if (ctrlMode === 'object' && !camSel()) return !!selItem(); return !!(camItem && !orbit); }
// režim ovládání pohledu kamery: 'camera' = myš/klávesy vždy ovládají kameru (objekty se ignorují), 'object' = myš/klávesy ovládají objekty
let ctrlMode = 'camera', onCtrlMode = null;
try { if (localStorage.getItem('viewfinder-ctrlmode') === 'object') ctrlMode = 'object'; } catch (e) {}
function setCtrlMode(m) { ctrlMode = m === 'object' ? 'object' : 'camera'; keys = {}; lookDrag = null; try { localStorage.setItem('viewfinder-ctrlmode', ctrlMode); } catch (e) {} updCtrl(); if (onCtrlMode) onCtrlMode(ctrlMode); return ctrlMode; }
function updCtrl() { if (!canvas) return; const it = selItem(); canvas.style.cursor = ctrlMode === 'object' ? 'default' : 'crosshair'; if (controls) controls.enableZoom = !(ctrlMode === 'object' && it); } // v OVLÁDÁNÍ OBJEKTU kolečko otáčí vybraným objektem
function camSel() { const it = selItem(); return !!(it && it.kind === 'camera' && !orbit); } // vybraná kamera v pohledu kamery → WASD/kolečko dál ovládají kameru
function selItem() { const it = lastScene && selId != null ? lastScene.items.find(i => i.id === selId) : null; return it && it.kind !== 'wall' && it.kind !== 'road' ? it : null; }
// OVLÁDÁNÍ OBJEKTU: WASD posun vybraného objektu vůči směru pohledu, Q/E výška (světla, kamera, rámy), kolečko otáčení
let objKeyT = 0;
function objWalk(dt) {
  const it = selItem(); if (!it || !dt) return false;
  let yaw; if (orbit) { const d = new THREE.Vector3(); orbitCam.getWorldDirection(d); yaw = Math.atan2(d.z, d.x); } else yaw = camItem ? camItem.rot : 0;
  const sp = 1.0 * dt, fx = Math.cos(yaw), fz = Math.sin(yaw), rx = -fz, rz = fx; let dx = 0, dz = 0, dy = 0;
  if (keys.w || keys.ArrowUp) { dx += fx; dz += fz; } if (keys.s || keys.ArrowDown) { dx -= fx; dz -= fz; }
  if (keys.d || keys.ArrowRight) { dx += rx; dz += rz; } if (keys.a || keys.ArrowLeft) { dx -= rx; dz -= rz; }
  if (keys.e) dy += 1; if (keys.q) dy -= 1;
  if (!dx && !dz && !dy) return false;
  const L = Math.hypot(dx, dz) || 1, W = lastScene.room.w, H = lastScene.room.h;
  const nx = Math.max(0.05, Math.min(W - 0.05, it.x + dx / L * sp)), ny = Math.max(0.05, Math.min(H - 0.05, it.y + dz / L * sp)), mx = nx - it.x, mz = ny - it.y;
  let my = 0; if (dy && it.h != null && it.kind !== 'furniture') { const nh = Math.max(0.2, Math.min((lastScene.room.z || 2.7) + 3, it.h + dy * sp * 0.8)); my = nh - it.h; it.h = nh; }
  it.x = nx; it.y = ny;
  group.children.forEach(o => { if (o.userData.itemId === it.id) { o.position.x += mx; o.position.z += mz; o.position.y += my; } });
  if (it.kind === 'camera') applyCamera();
  floorRing.position.set(it.x, 0.005, it.y); dirty = true;
  if (onMove) onMove(it.id, it.x, it.y, 'move');
  clearTimeout(objKeyT); objKeyT = setTimeout(() => { if (onMove) onMove(it.id, it.x, it.y, 'end'); }, 250);
  return true;
}
function objRotate(a) { const it = selItem(); if (!it) return; it.rot = (it.rot || 0) + a; if (it.kind === 'light' || it.kind === 'camera') it.aim = false; clearTimeout(objKeyT); if (onMove) onMove(it.id, it.x, it.y, 'end'); }
// pohyb WASD (W/S vpřed/vzad, A/D do stran, Q/E dolů/nahoru), v m/s
function walk(dt) {
  if (ctrlMode === 'object' && !camSel()) return objWalk(dt);
  if (!camItem || orbit || !dt) return false; let mv = false; const sp = 1.6 * dt, fx = Math.cos(camItem.rot), fz = Math.sin(camItem.rot), rx = -fz, rz = fx;
  let dx = 0, dz = 0, dy = 0;
  if (keys.w || keys.ArrowUp) { dx += fx; dz += fz; } if (keys.s || keys.ArrowDown) { dx -= fx; dz -= fz; }
  if (keys.d || keys.ArrowRight) { dx += rx; dz += rz; } if (keys.a || keys.ArrowLeft) { dx -= rx; dz -= rz; }
  if (keys.e) dy += 1; if (keys.q) dy -= 1;
  if (dx || dz || dy) { const L = Math.hypot(dx, dz) || 1; camItem.x = Math.max(-15, Math.min(lastScene.room.w + 15, camItem.x + dx / L * sp)); camItem.y = Math.max(-15, Math.min(lastScene.room.h + 15, camItem.y + dz / L * sp)); camItem.h = Math.max(0.2, Math.min(12, (camItem.h == null ? 1.5 : camItem.h) + dy * sp)); mv = true; }
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
  if (hq.result) { hq.result.style.width = r.width + 'px'; hq.result.style.height = r.height + 'px'; }
  if (pose.cv) { pose.cv.width = r.width; pose.cv.height = r.height; pose.cv.style.width = r.width + 'px'; pose.cv.style.height = r.height + 'px'; }
  renderer.setSize(r.width, r.height, false); canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
  const A = formatAspect(); let w = r.width, h = r.height;
  if (A > 0) { if (w / h > A) w = h * A; else h = w / A; }
  region = { x: Math.round((r.width - w) / 2), y: Math.round((r.height - h) / 2), w: Math.round(w), h: Math.round(h) };
  camera.aspect = region.w / region.h; orbitCam.aspect = r.width / r.height; camera.updateProjectionMatrix(); orbitCam.updateProjectionMatrix(); applyCamera(); dirty = true;
}

function clear(g) { while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } }

// C-stand: „želví“ základna se třemi nohami v různých výškách, sloupek, kolínko
// stativ světla: 3D model (nohy beze změny, tyč natažená na výšku h)
let standProto = null;
function standModel() {
  if (standProto) return standProto; const gl = modelFor('stand'); if (!gl) return null;
  const legs = gl.scene.getObjectByName('legs'), pole = gl.scene.getObjectByName('pole'); if (!legs || !pole) return null;
  const pb = new THREE.Box3().setFromObject(pole); standProto = { legs, pole, y0: pb.min.y, len: pb.max.y - pb.min.y }; return standProto;
}
function stand(x, z, h, g, base) {
  if (base > 0.01) { const bg = new THREE.Group(); bg.position.y = base; g.add(bg); stand(x, z, Math.max(0.15, h - base), bg); return; } // světlo na desce stolu (magnet): stativ od desky
  const P = standModel();
  if (P) { const sg = new THREE.Group(); sg.position.set(x, 0, z); g.add(sg); const top = P.y0 + P.len;
    if (h < top * 0.7) { const k = h / top; const a = P.legs.clone(true), b = P.pole.clone(true); a.scale.setScalar(k); b.scale.setScalar(k); sg.add(a, b); return; }
    sg.add(P.legs.clone(true)); const pw = new THREE.Group(); pw.position.y = P.y0; const pc = P.pole.clone(true); pc.position.y = -P.y0; pw.add(pc); pw.scale.y = Math.max(0.2, (h - P.y0) / P.len); sg.add(pw); return; }
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
  const d = S.sunDir(sc), el = (sc.sun.elev == null ? 35 : sc.sun.elev) * Math.PI / 180, k = kel(S.sunCCT(sc));
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
    const m = new THREE.Mesh(geo, beamMat(k.color, S.sunE(sc) * haze * 0.00012)); m.renderOrder = 5; m.userData.beam = true; group.add(m);
  });
}
function addLight(L, res) {
  const P = S.lightParams(L);
  if (L.on === false) { if (P.fx.ceil) { const g0 = new THREE.Group(); group.add(g0); ceilLight(L, P, null, 0, null, g0); } return; } // vypnuté stropní svítidlo zůstane vidět
  const lumL = (c, v) => lum(c, P.rgb ? Math.min(v, 0.7 * (lastOpts.ref || 300) * Math.pow(2, -(lastOpts.ev || 0))) : v); // barevná tělesa nepřepálit do bíla (strop ≈ jasná, ale sytá barva)
  const k = kelL(P), dir = new THREE.Vector3(Math.cos(L.rot), 0, Math.sin(L.rot));
  const pos = new THREE.Vector3(L.x, P.h, L.y);
  // cíl: 2 m před světlem ve výšce obličeje (světla se mírně sklánějí)
  const tgt = pos.clone().add(dir.clone().multiplyScalar(2.2)); tgt.y = S.FACE_Z;
  if (L.tiltDeg != null) { const t = L.tiltDeg * Math.PI / 180; tgt.copy(pos).add(dir.clone().multiplyScalar(2.2 * Math.cos(t))); tgt.y = pos.y + 2.2 * Math.sin(t); } // ruční náklon
  const g = new THREE.Group(); group.add(g);
  const E1 = P.E1 * k.gain;
  envGlow(L, k, E1);
  if (P.fx.ceil) { ceilLight(L, P, k, E1, lumL, g); return; }
  if (P.omni) {
    const pl = new THREE.PointLight(k.color, E1, 12, 2); pl.position.copy(pos); if (hq.active) pl.position.add(new THREE.Vector3(jit(), jit(), jit()).multiplyScalar(P.size)); pl.castShadow = !!lastOpts.shadows && Q().soft > 0; pl.shadow.mapSize.set(Q().softMap, Q().softMap); pl.shadow.bias = -0.002; g.add(pl);
    if (L.mod === 'tube') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 12), lumL(k.color, E1 / 0.15));
      m.position.copy(pos); m.rotation.z = Math.PI / 2; m.rotation.y = -(L.rot + Math.PI / 2); g.add(m); stand(L.x, L.y, P.h, g, L.base);
    } else if (L.mod === 'practical') {
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.2, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, emissive: k.color, emissiveIntensity: E1 * 1.5, side: THREE.DoubleSide, roughness: 1 }));
      shade.position.copy(pos); g.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), lumL(k.color, E1 * 40)); bulb.position.copy(pos); g.add(bulb);
      const b0 = L.base || 0, ph = Math.max(0.05, P.h - 0.1 - b0); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, ph, 6), MAT.metal); pole.position.set(L.x, b0 + ph / 2, L.y); g.add(pole);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 16), MAT.metal); foot.position.set(L.x, b0 + 0.01, L.y); g.add(foot); // podstavec lampy
    } else {
      const m = new THREE.Mesh(new THREE.SphereGeometry(P.size / 2, 16, 12), lumL(k.color, E1 / (Math.PI * P.size * P.size / 4))); m.position.copy(pos); g.add(m); stand(L.x, L.y, P.h, g, L.base);
    }
    return;
  }
  const w = P.size, h = P.size * (P.aspect || 0.75);
  const headG = P.fx.model && L.mod === P.fx.defMod ? modelFor(P.fx.model) : null; // 3D model hlavy světla (SkyPanel, ARRI 650, Kino Flo)
  if (headG) lightHead(g, headG, pos, tgt, P.fx.headOff || 0);
  const sbG = !headG && /^(softbox\d+|octa120)$/.test(L.mod) ? modelFor('sbhead') : null; // softbox (3D model), rozměr podle modifikátoru
  const cobG = !headG && !P.soft && !P.omni ? modelFor('cobhead') : null; // COB s reflektorem a klapkami (3D model)
  if (P.soft) {
    const rl = new THREE.RectAreaLight(k.color, E1 * ((lastOpts.shadows && Q().soft > 0) ? 0.6 : 1) / (w * h), w, h); rl.position.copy(pos); rl.lookAt(tgt); g.add(rl); addBeam(g, pos, tgt, P.beam / 2 * Math.PI / 180 * 0.6, k.color, E1, true);
    // vizuální panel softboxu
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lumL(k.color, E1 / (w * h)));
    panel.position.copy(pos); panel.lookAt(tgt); panel.position.add(sbG ? tgt.clone().sub(pos).normalize().multiplyScalar(0.012) : dir.clone().multiplyScalar(-0.01)); g.add(panel);
    if (sbG) { const hd = new THREE.Group(); hd.position.copy(pos); hd.lookAt(tgt); const inst = sbG.scene.clone(true); inst.rotation.y = -Math.PI / 2; inst.scale.set(Math.max(0.35, w * 0.55), h / 0.93, w / 0.93); hd.add(inst); g.add(hd); }
    else if (headG) { /* tělo = 3D model */ }
    else if (P.mod.panel) { // LED panel: tenké tělo s rámečkem místo kužele softboxu
      const body = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, h + 0.03, 0.04), MAT.shoe);
      body.position.copy(pos).add(dir.clone().multiplyScalar(-0.035)); body.lookAt(tgt); g.add(body);
    } else {
      const back = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, h) * 0.55, 0.45, 4, 1, true), MAT.flag);
      back.position.copy(pos).add(dir.clone().multiplyScalar(-0.22)); back.lookAt(tgt); back.rotateX(-Math.PI / 2); g.add(back);
    }
    // slabé stínové světlo, aby softbox také vrhal (měkký) stín
    const ns = lastOpts.shadows ? Q().soft : 0;
    if (ns > 0) { // stínová světla rozmístěná po ploše softboxu → měkký polostín (ultra: 4 vzorky)
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, dir).normalize();
      const offs = hq.active ? [[jit() * 0.9, jit() * 0.9]] : (ns === 1 ? [[0, 0]] : [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]);
      offs.forEach(o => { const sp = new THREE.SpotLight(k.color, E1 * 0.4 / offs.length, 14, P.beam / 2 * Math.PI / 180, 0.9, 2);
        sp.position.copy(pos).add(right.clone().multiplyScalar(o[0] * w)).add(up.clone().multiplyScalar(o[1] * h)); sp.target.position.copy(tgt); sp.castShadow = true; sp.shadow.mapSize.set(Q().softMap, Q().softMap); sp.shadow.bias = -0.002; sp.shadow.radius = 8; g.add(sp); g.add(sp.target); });
    }
  } else {
    const half = P.beam / 2 * Math.PI / 180;
    const sp = new THREE.SpotLight(k.color, E1, 16, Math.min(half * 1.3, 1.5), L.barn ? 0.15 : (L.diff ? 0.8 : 0.45), 2);
    sp.position.copy(pos); if (hq.active) { const rr = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize(), uu = new THREE.Vector3().crossVectors(rr, dir).normalize(); sp.position.add(rr.multiplyScalar(jit() * P.size)).add(uu.multiplyScalar(jit() * P.size)); } sp.target.position.copy(tgt); sp.castShadow = !!lastOpts.shadows; sp.shadow.mapSize.set(Q().spot, Q().spot); sp.shadow.bias = -0.0015; sp.shadow.radius = L.diff ? 6 : 2;
    if (L.gobo && L.gobo !== 'none' && S.GOBOS[L.gobo]) { sp.map = goboTexture(L.gobo); sp.castShadow = true; sp.shadow.focus = 1; }
    g.add(sp); g.add(sp.target); addBeam(g, pos, tgt, half, k.color, E1, false);
    const fOff = headG ? (P.fx.faceOff || 0.115) : cobG ? 0.035 : 0.115, fR = headG ? (P.fx.faceR || 0.075) : cobG ? 0.065 : 0.075, tdir = tgt.clone().sub(pos).normalize();
    if (cobG) lightHead(g, cobG, pos, tgt, 0);
    if (!headG && !cobG) { const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.22, 16), MAT.metal); body.position.copy(pos); body.lookAt(tgt); body.rotateX(-Math.PI / 2); g.add(body); }
    const face = new THREE.Mesh(new THREE.CircleGeometry(fR, 24), lumL(k.color, E1 / (0.018 * fR * fR / 0.0056))); face.position.copy(pos).add((headG || cobG ? tdir : dir).clone().multiplyScalar(fOff)); face.lookAt(tgt); g.add(face);
    if (L.diff) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), lumL(k.color, E1 / 0.35)); d.material.transparent = true; d.material.opacity = 0.7; d.material.side = THREE.DoubleSide; d.position.copy(pos).add(dir.clone().multiplyScalar(0.18)); d.lookAt(tgt); g.add(d); }
  }
  // u plochých hlav (SkyPanel, Kino Flo) končí stojan pod spodní hranou, aby tyč nešla přes svítící plochu
  const hb = headG && P.soft ? headBox(headG) : null;
  stand(L.x, L.y, hb ? Math.max(0.3, P.h - hb.y * 0.9) : sbG ? Math.max(0.3, P.h - 0.08) : cobG ? Math.max(0.3, P.h - 0.17) : P.h, g, L.base);
}

// ---------- stropní a závěsná praktická světla (Light Pack: zářivkové těleso, kruhové LED, žárovka; závěsná zářivka) ----------
// s = měřítko modelu → metry, flip = model stojí (svítící stranou nahoru) → otočit dolů, hide = vlastní lanka modelu (kreslíme podle výšky stropu),
// cable = body závěsu (x v m podél tělesa), nits = svítící plocha (m²) pro jas tělesa
const CEIL3D = {
  'rode_0': { s: 0.36, flip: true, area: 0.15 },
  'light-circle_8': { s: 0.36, flip: true, area: 0.09 },
  'bulb_12': { s: 0.36, flip: true, area: 0.004, cable: [0] },
  hangfluo: { s: 0.107, flip: false, area: 0.3, hide: ['Cylinder001', 'Cylinder002'], cable: [-0.53, 0.53], solid: true }
};
function ceilLight(L, P, k, E1, lumL, g) {
  const sc = lastScene, fx = P.fx, cfg = CEIL3D[fx.part || fx.model] || { s: 1, area: 0.1 };
  const Z = sc.outdoor ? P.h + 1.2 : (sc.room.z || 2.7), pos = new THREE.Vector3(L.x, P.h, L.y);
  if (k) { // světlo míří dolů (holá žárovka a trubice svítí do všech stran)
    const shadows = !!lastOpts.shadows && Q().soft > 0;
    if (P.omni) {
      const pl = new THREE.PointLight(k.color, E1, 12, 2); pl.position.copy(pos).add(new THREE.Vector3(0, -0.05, 0)); if (hq.active) pl.position.add(new THREE.Vector3(jit(), 0, jit()).multiplyScalar(P.size * 0.5));
      pl.castShadow = shadows; pl.shadow.mapSize.set(Q().softMap, Q().softMap); pl.shadow.bias = -0.003; g.add(pl);
    } else {
      const sp = new THREE.SpotLight(k.color, E1, 16, Math.min(1.5, P.beam / 2 * Math.PI / 180), 1, 2); sp.position.copy(pos).add(new THREE.Vector3(0, -0.05, 0));
      if (hq.active) sp.position.add(new THREE.Vector3(jit(), 0, jit()).multiplyScalar(P.size * 0.5));
      sp.target.position.set(L.x, 0, L.y); sp.castShadow = shadows; sp.shadow.mapSize.set(Q().softMap, Q().softMap); sp.shadow.bias = -0.003; g.add(sp); g.add(sp.target);
    }
  }
  // těleso z modelu, vycentrované na polohu světla, otočené podle L.rot (u trubic = směr trubice)
  const gl = modelFor(fx.model), holder = new THREE.Group(); holder.position.copy(pos); holder.rotation.y = -L.rot; g.add(holder);
  let top = 0.04;
  if (gl) {
    gl.scene.updateMatrixWorld(true);
    const src = fx.part ? gl.scene.getObjectByName(fx.part) : gl.scene;
    if (src) {
      const body = src.clone(true); if (fx.part) src.matrixWorld.decompose(body.position, body.quaternion, body.scale);
      (cfg.hide || []).forEach(n => { const o = body.getObjectByName(n); if (o) o.visible = false; });
      const inner = new THREE.Group(); inner.add(body); if (cfg.flip) inner.rotation.x = Math.PI; inner.scale.setScalar(cfg.s); inner.updateMatrixWorld(true);
      const bb = new THREE.Box3(); body.traverse(o => { if (o.isMesh && o.visible) bb.expandByObject(o); });
      const c = bb.getCenter(new THREE.Vector3()); inner.position.set(-c.x, -c.y, -c.z); top = bb.max.y - c.y; holder.add(inner);
      body.traverse(o => { if (!o.isMesh) return; o.castShadow = false; o.userData.noCast = true; o.receiveShadow = true; const m = o.material = o.material.clone();
        if (cfg.solid && m.transparent) { m.transparent = false; m.depthWrite = true; m.alphaTest = 0.5; }
        const glows = m.emissiveMap || (m.emissive && m.emissive.getHex() !== 0);
        if (glows && m.emissive) { if (k) { m.emissive = k.color.clone(); m.emissiveIntensity = E1 / cfg.area; } else { m.emissive.setHex(0x222222); m.emissiveIntensity = 1; } } });
    }
  } else if (fx.ceil === 'pole') { // pouliční lampa: svítící sklo pod stínidlem; sloup s ramenem jen mimo model prostředí (tam je vlastní)
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), k ? lumL(k.color, E1 / 0.09) : MAT.metal); glass.rotation.x = Math.PI / 2; glass.position.y = -0.02; holder.add(glass);
    if (!L.envBody) {
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.28, 20, 1, true), MAT.metal); shade.material = shade.material.clone(); shade.material.side = THREE.DoubleSide; shade.position.y = 0.12; holder.add(shade); shade.userData.noCast = true; glass.userData.noCast = true;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, P.h + 0.45, 10), MAT.metal); pole.position.set(-0.9, (0.45 - P.h) / 2, 0); holder.add(pole); // sloup od země do výšky ramene
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.05), MAT.metal); arm.position.set(-0.45, 0.4, 0); holder.add(arm);
    }
  } else { // model ještě není načtený → jednoduché těleso
    const w = fx.defMod === 'ceilpanel' ? 0.36 : P.size, d = fx.defMod === 'ceilpanel' ? 0.36 : 0.08;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), k ? lumL(k.color, E1 / cfg.area) : MAT.metal); holder.add(m);
  }
  // závěs: kabel(y) od tělesa ke stropu
  (cfg.cable || []).forEach(x => { const len = Z - (P.h + top); if (len <= 0.02) return;
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, len, 6), MAT.metal); cab.position.set(x, top + len / 2, 0); holder.add(cab); });
}

// filmová kamera na dřevěném stativu: objektiv ve výšce ch (stativ se natáhne / zkrátí)
const FILMCAM_LENS = 1.22, FILMCAM_TOP = 1.085;
function filmCamera(parent, gltf, ch) {
  const src = gltf.scene, trip = src.getObjectByName('tripod'), cam = src.getObjectByName('cam'); if (!trip || !cam) return;
  const t = trip.clone(true); t.scale.y = Math.max(0.1, (ch - (FILMCAM_LENS - FILMCAM_TOP)) / FILMCAM_TOP); parent.add(t);
  const c = cam.clone(true); c.position.y = ch - FILMCAM_LENS; parent.add(c);
}
const headBoxes = new WeakMap();
function headBox(gltf) { let b = headBoxes.get(gltf); if (!b) { const bb = new THREE.Box3().setFromObject(gltf.scene); b = { y: (bb.max.y - bb.min.y) / 2 }; headBoxes.set(gltf, b); } return b; }
// 3D model hlavy světla: model má přední stranu na +x, střed v počátku; natočí se k cíli, off = posun podél osy světla (m)
function lightHead(g, gltf, pos, tgt, off) {
  const d = tgt.clone().sub(pos).normalize(), holder = new THREE.Group(); holder.position.copy(pos).add(d.multiplyScalar(off)); holder.lookAt(tgt);
  const inst = gltf.scene.clone(true); inst.rotation.y = -Math.PI / 2; holder.add(inst); g.add(holder);
}
function limb(mat, r, len, g, x, y, z, rx, rz) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 14), mat); m.position.set(x, y, z); m.rotation.set(rx || 0, 0, rz || 0); m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
// adresa souboru aplikace: na e-shopu se servíruje přes PHP (?svhvl_app=…), jinak relativně
function assetUrl(p) { const V = window.SVH_VIEWFINDER; return (V && V.asset) ? V.asset.replace('__FILE__', V.assetPath ? encodeURI(p) : encodeURIComponent(p)) : p; } // assetPath: adresa /viewfinder-app/<soubor> (lomítka nekódovat)
// ---------- 3D modely postav (glTF, kostra Renderpeople, klipy idle/sit) ----------
const modelCache = {}; // id -> { gltf } | { loading: true } | { error: true }
const EXTRA_MODELS = { car: { file: 'models/car.glb' }, bed: { file: 'models/bed.glb' }, ldesk: { file: 'models/ldesk.glb' }, pc: { file: 'models/pc.glb' }, kitchen: { file: 'models/kitchen.glb' }, tree: { file: 'models/tree.glb' }, pcdesk: { file: 'models/pcdesk.glb' }, skypanel: { file: 'models/skypanel.glb' }, lightpack: { file: 'models/lightpack.glb' }, hangfluo: { file: 'models/hangfluo.glb' }, camp: { file: 'models/camp.glb' }, plane: { file: 'models/plane.glb' }, gas: { file: 'models/gas.glb' }, apt1: { file: 'models/apt1.glb' }, apt2: { file: 'models/apt2.glb' }, classroom: { file: 'models/classroom.glb' }, shed: { file: 'models/shed.glb' }, glamping: { file: 'models/glamping.glb' }, arri650: { file: 'models/arri650.glb' }, kinoflo: { file: 'models/kinoflo.glb' }, filmcam: { file: 'models/filmcam.glb' }, photostudio: { file: 'models/photostudio.glb' }, cyclorama: { file: 'models/cyclorama.glb' }, window: { file: 'models/window.glb' }, door: { file: 'models/door.glb' }, fence: { file: 'models/fence.glb' }, skybox: { file: 'models/skybox.glb' }, sofa: { file: 'models/sofa.glb' }, cobhead: { file: 'models/cobhead.glb' }, sbhead: { file: 'models/sbhead.glb' }, stand: { file: 'models/stand.glb' } };
// usazení modelu do rozměrů Š×H×V: rot = otočení modelu tak, aby jeho „přední“ strana mířila na lokální +x (šipka otočení v půdorysu)
const MODEL_FIT = { bed: { rot: -Math.PI / 2 }, ldesk: { rot: 0 }, pc: { rot: Math.PI / 2 }, kitchen: { rot: 0, tile: 1.49 }, tree: { rot: 0 }, pcdesk: { rot: Math.PI / 2 }, sofa: { rot: Math.PI / 2 }, plane: { rot: Math.PI / 2 } }; // letadlo: příď (+z modelu) → +x
// strom: soubor obsahuje dva stromy – rozdělit na dvě varianty postavené na zem
function treeProto(gltf, v) {
  if (!gltf.userData.protos) {
    gltf.scene.updateMatrixWorld(true); const list = [];
    gltf.scene.traverse(o => { if (o.isMesh) list.push(o); });
    list.sort((a, b) => a.name < b.name ? -1 : 1);
    gltf.userData.protos = list.map(m => { const c = m.clone(); m.matrixWorld.decompose(c.position, c.quaternion, c.scale);
      c.material = m.material.clone(); c.material.transparent = false; c.material.alphaTest = 0.45; c.material.side = THREE.DoubleSide; c.material.depthWrite = true;
      const g = new THREE.Group(); g.add(c); const bb = new THREE.Box3().setFromObject(g, true), ctr = bb.getCenter(new THREE.Vector3()); c.position.x -= ctr.x; c.position.z -= ctr.z; c.position.y -= bb.min.y; return g; });
  }
  const P = gltf.userData.protos; return P[(v || 0) % P.length];
}
// usazení: pevná tabulka nebo nábytek z balíčku (rot v katalogu)
function fitCfg(t) { return MODEL_FIT[t] || (S.FURNITURE[t] && S.FURNITURE[t].glb ? { rot: S.FURNITURE[t].rot || 0 } : null); }
function fitModelInto(g, gltf, key, w, d, h, elev, it) {
  const cfg = fitCfg(key), src = key === 'tree' ? treeProto(gltf, it && it.variant) : gltf.scene;
  const n = cfg.tile ? Math.max(1, Math.round(d / cfg.tile)) : 1, segD = d / n;
  for (let i = 0; i < n; i++) {
    const inst = src.clone(true); inst.traverse(o => { if (o.isMesh && o.material && o.material.transparent) o.material.depthWrite = false; });
    const outer = new THREE.Group(), rotG = new THREE.Group(); rotG.rotation.y = cfg.rot; rotG.add(inst); outer.add(rotG); outer.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(rotG, true), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    rotG.position.set(-c.x, -bb.min.y, -c.z); outer.scale.set(w / sz.x, h / sz.y, segD / sz.z); outer.position.set(0, elev || 0, -d / 2 + segD * (i + 0.5)); g.add(outer);
  }
}
function modelFor(id) {
  const m = S.MODELS[id] || EXTRA_MODELS[id] || (S.FURNITURE[id] && S.FURNITURE[id].glb ? { file: 'models/' + id + '.glb' } : null); if (!m || !m.file) return null;
  const c = modelCache[id]; if (c && c.gltf) return c.gltf; if (c) return null;
  modelCache[id] = { loading: true };
  const solid = !!(S.MODELS[id] && S.MODELS[id].solid);
  // model má celé oblečení i tělo omylem jako „alpha blend“ (Muž 3) → kreslí se bez zápisu hloubky a kalhoty i vnitřek úst prosvítají přes kabát a obličej; převést na ořez alfou
  const onLoad = g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (o.material) { o.material.roughness = Math.max(0.55, o.material.roughness || 0.8); o.material.metalness = 0;
    if (solid && o.material.transparent) { o.material.transparent = false; o.material.depthWrite = true; o.material.alphaTest = 0.5; } } } }); modelCache[id] = { gltf: g }; window.dispatchEvent(new Event('view3d-model')); };
  // Model je zabalený ve skriptu (models/<id>.glb.js, base64) – funguje i z disku (file://), kde fetch .glb selže.
  const fail = () => { modelCache[id] = { error: true }; };
  const fromB64 = b64 => { const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); new GLTFLoader().parse(u8.buffer, '', onLoad, fail); };
  if (window.VF_MODEL_DATA && window.VF_MODEL_DATA[id]) { fromB64(window.VF_MODEL_DATA[id]); return null; }
  const sc = document.createElement('script'); sc.src = assetUrl(m.file + '.js');
  sc.onload = () => { if (window.VF_MODEL_DATA && window.VF_MODEL_DATA[id]) fromB64(window.VF_MODEL_DATA[id]); else fail(); };
  sc.onerror = () => { new GLTFLoader().load(assetUrl(m.file), onLoad, undefined, fail); };
  document.head.appendChild(sc);
  return null;
}
function addModelPerson(p, gltf) {
  const g = new THREE.Group(); g.position.set(p.x, 0, p.y); g.rotation.y = -p.rot; if (p.mirror) g.scale.z = -1; group.add(g); // zrcadlení: levá ↔ pravá
  const inst = SkeletonUtils.clone(gltf.scene); inst.rotation.y = Math.PI / 2; // model kouká do +Z → náš směr je +X
  g.add(inst);
  const PS = S.POSES[p.pose] || S.POSES.stand, sit = !!PS.sit, clip = gltf.animations.find(a => a.name === PS.clip) || gltf.animations.find(a => a.name === 'idle');
  if (clip) { const mixer = new THREE.AnimationMixer(inst); const a = mixer.clipAction(clip); a.play(); const t = (p.t == null) ? (PS.sit && PS.clip !== 'type' ? 0.8 : ((0.15 + ((p.id || 0) % 5) * 0.17) % 1)) : Math.max(0, Math.min(1, p.t)); mixer.setTime(Math.min(clip.duration - 0.01, t * clip.duration)); }
  const bones = {}; inst.traverse(o => { if (o.isBone) bones[o.name] = o; }); rigs[p.id] = { inst: inst, bones: bones, group: g };
  if (p.bones) { for (const bn in p.bones) { const b = bones[bn], q = p.bones[bn]; if (b && q && q.length === 4) b.quaternion.set(q[0], q[1], q[2], q[3]); } }
  inst.updateMatrixWorld(true);
  if (PS.clip === 'carin') { // klip je „na místě“: v závěrečné fázi (usedání) postavu dosunout dozadu na sedadlo auta
    const tt = p.t == null ? 0.3 : p.t, k = Math.max(0, Math.min(1, (tt - 0.5) / 0.3)), sl = S.carSlide(lastScene, p) * (k * k * (3 - 2 * k));
    if (sl > 0) { inst.position.z += sl; inst.updateMatrixWorld(true); }
    // po usednutí (klip končí bokem, čelem ze dveří) postavu otočit o 90° čelem dopředu na sedadle – kolem pánve
    const k2 = Math.max(0, Math.min(1, (tt - 0.78) / 0.2)), a = Math.PI / 2 * k2 * k2 * (3 - 2 * k2);
    if (a > 0 && sl > 0) { let hip = null; inst.traverse(o => { if (!hip && o.isBone && o.name === 'hip_02') hip = o; });
      if (hip) { const hw = g.worldToLocal(hip.getWorldPosition(new THREE.Vector3())), pv = new THREE.Group(); pv.position.set(hw.x, 0, hw.z); g.add(pv); g.remove(inst); inst.position.x -= hw.x; inst.position.z -= hw.z; pv.add(inst); pv.rotation.y = a; pv.updateMatrixWorld(true); } } }
  if (!sit) { // položit na zem: nejnižší bod napózované sítě (dřep, leh, opření…)
    let minY = Infinity; inst.traverse(o => { if (o.isSkinnedMesh) { o.computeBoundingBox(); const bb = o.boundingBox.clone().applyMatrix4(o.matrixWorld); minY = Math.min(minY, bb.min.y); } });
    if (isFinite(minY) && Math.abs(minY) > 0.01) { inst.position.y -= minY; inst.updateMatrixWorld(true); }
    if (PS.clip === 'carin' && S.carSlide(lastScene, p) > 0) { // v autě: pánev postupně do výšky sedadla (jako póza Sedí v autě)
      const kk = Math.max(0, Math.min(1, ((p.t == null ? 0.3 : p.t) - 0.6) / 0.3)); let hip = null; inst.traverse(o => { if (!hip && o.isBone && o.name === 'hip_02') hip = o; });
      if (hip && kk > 0) { const hy = hip.getWorldPosition(new THREE.Vector3()).y, dy = (hy - 0.49) * kk * kk * (3 - 2 * kk); if (dy > 0) { inst.position.y -= dy; inst.updateMatrixWorld(true); } } }
  }
  if (sit) { // posadit: pánev do výšky sedáku + ~13 cm
    let hip = null; inst.traverse(o => { if (o.isBone && o.name === 'hip_02') hip = o; });
    const seatIt = S.seatUnder(lastScene, p), seatH = seatIt && seatIt.type === 'car' ? 0.36 : seatIt && seatIt.type === 'sofa' && modelFor('sofa') ? 0.56 * (seatIt.h || 0.85) / 0.92 : 0.45;
    if (hip) { const hy = hip.getWorldPosition(new THREE.Vector3()).y; inst.position.y = (seatH + 0.13) - hy; }
    if (!S.seatUnder(lastScene, p)) chairMesh(g, 0.02, 0);
    if (!p.bones) pendingLift.push([inst, bones, p.pose === 'type']);
  }
}
// ruce sedící postavy nad deskou stolu: když by se zanořily do desky, zvedne paže (CCD přes rameno a loket).
// Deska se hledá paprskem dolů na skutečné síti nábytku (funguje pro stůl, rohový stůl, linku, box…), proto až po sestavení celé scény.
let pendingLift = [];
const liftRay = new THREE.Raycaster();
function surfaceBelow(pt) {
  const furn = group.children.filter(o => o.userData.furn); if (!furn.length) return null;
  liftRay.set(new THREE.Vector3(pt.x, pt.y + 0.25, pt.z), new THREE.Vector3(0, -1, 0)); liftRay.far = 0.6;
  const hit = liftRay.intersectObjects(furn, true)[0]; return hit ? hit.point.y : null;
}
function liftHands(inst, bones, typing) {
  const V = THREE.Vector3, Qt = THREE.Quaternion, names = Object.keys(bones);
  inst.updateMatrixWorld(true);
  ['l', 'r'].forEach(sd => {
    const f = pre => bones[names.find(n => n.indexOf(pre + '_' + sd + '_') === 0)];
    const hand = f('hand'), lo = f('lowerarm'), up = f('upperarm'); if (!hand || !lo || !up) return;
    const hp = hand.getWorldPosition(new V()), top = surfaceBelow(hp); if (top == null) return;
    const want = top + 0.06; // zápěstí nad deskou (tloušťka dlaně)
    if (hp.y >= want || (!typing && hp.y < top - 0.1)) return; // ruce v klíně pod stolem nechat
    const tgt = hp.clone(); tgt.y = want;
    for (let i = 0; i < 8; i++) for (const b of [up, lo]) {
      const bp = b.getWorldPosition(new V()), cur = hand.getWorldPosition(new V()).sub(bp).normalize(), des = tgt.clone().sub(bp).normalize();
      const dq = new Qt().setFromUnitVectors(cur, des), wq = b.getWorldQuaternion(new Qt()), pq = b.parent.getWorldQuaternion(new Qt()).invert();
      b.quaternion.copy(pq.multiply(dq.multiply(wq))); b.updateMatrixWorld(true);
    }
  });
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
  const g = new THREE.Group(); g.position.set(it.x, 0, it.y); g.rotation.y = -(it.rot || 0); g.userData.furn = true; group.add(g);
  const f = S.FURNITURE[it.type] || S.FURNITURE.block, w = it.w || f.w, d = it.d || f.d, t = it.type;
  if (fitCfg(t)) { const gl = modelFor(t); if (gl) { fitModelInto(g, gl, t, w, d, it.h != null ? it.h : f.h, it.elev != null ? it.elev : (f.elev || 0), it); return; } }
  const fabric = texMat('fabric', 0x4e5a70, { roughness: 1, bumpScale: 0.3 }), fabric2 = texMat('fabric', 0x5b6780, { roughness: 1, bumpScale: 0.3 }), bedding = texMat('cloth', 0xe4dfd3, { roughness: 1, bumpScale: 0.2 }), blanket = texMat('fabric', 0x7a6a5a, { roughness: 1, bumpScale: 0.3 });
  if (t === 'sofa' || t === 'armchair') {
    box(g, fabric, w, 0.22, d, 0, 0.16, 0);                                   // rám
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(o => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8), MAT.woodDark); l.position.set(o[0] * (w / 2 - 0.06), 0.03, o[1] * (d / 2 - 0.06)); g.add(l); });
    const n = t === 'sofa' ? Math.max(2, Math.round(d / 0.7)) : 1, cw = (d - 0.36) / n;             // sedáky podél délky (délka gauče = d, opěradlo vzadu = -x)
    for (let i = 0; i < n; i++) { const zc = -d / 2 + 0.18 + cw * (i + 0.5); cushion(g, fabric2, w - 0.24, 0.16, cw - 0.03, 0.05, 0.35, zc); cushion(g, fabric2, 0.16, 0.5, cw - 0.03, -w / 2 + 0.2, 0.62, zc).rotation.z = 0.12; }
    box(g, fabric, 0.18, 0.75, d, -w / 2 + 0.09, 0.37, 0);                  // opěradlo
    cushion(g, fabric, w - 0.1, 0.18, 0.2, 0.05, 0.5, -d / 2 + 0.09);      // područky
    cushion(g, fabric, w - 0.1, 0.18, 0.2, 0.05, 0.5, d / 2 - 0.09);
  } else if (t === 'car' && modelFor('car')) {
    const src = modelFor('car').scene, inst = src.clone(true);
    inst.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = o.material.clone(); if (o.material.name === 'Material' && it.color) o.material.color.set(it.color); if (o.material.transparent) { o.material.depthWrite = false; o.castShadow = false; } } });
    const bb = new THREE.Box3().setFromObject(inst), sz = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3()), k = w / sz.z;
    const holder = new THREE.Group(); holder.rotation.y = Math.PI / 2; holder.scale.setScalar(k); inst.position.set(-ctr.x, -bb.min.y, -ctr.z); holder.add(inst); g.add(holder);
  } else if (t === 'car') {
    const paint = new THREE.MeshStandardMaterial({ color: it.color ? parseInt(it.color.replace('#', ''), 16) : 0x9a2a2a, roughness: 0.35, metalness: 0.6 }), glass = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55 }), tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    const L = w, Wd = d; // délka podél x, šířka podél z
    box(g, paint, L, 0.5, Wd, 0, 0.55, 0);                                   // karoserie
    box(g, paint, L * 0.55, 0.45, Wd * 0.92, -L * 0.05, 1.02, 0);           // kabina
    box(g, glass, L * 0.53, 0.32, Wd * 0.93, -L * 0.05, 1.05, 0);           // skla
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(o => { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 20), tire); wh.rotation.x = Math.PI / 2; wh.position.set(o[0] * L * 0.32, 0.32, o[1] * (Wd / 2 - 0.1)); wh.castShadow = true; g.add(wh); });
    [-1, 1].forEach(sd => { const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 0.6 })); hl.position.set(L / 2 + 0.01, 0.62, sd * (Wd / 2 - 0.3)); g.add(hl); const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.25), new THREE.MeshStandardMaterial({ color: 0x660000, emissive: 0xaa0000, emissiveIntensity: 0.4 })); tl.position.set(-L / 2 - 0.01, 0.62, sd * (Wd / 2 - 0.3)); g.add(tl); });
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
  } else if (t === 'tree') { const hh = it.h || f.h; const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, hh * 0.45, 8), MAT.wood); tr.position.y = hh * 0.225; g.add(tr); const cr = new THREE.Mesh(new THREE.SphereGeometry(w / 2, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3f7a33, roughness: 1 })); cr.position.y = hh * 0.65; g.add(cr);
  } else { const hh = it.h == null ? (it.tall ? 2.0 : f.h) : it.h; const el = it.elev != null ? it.elev : (f.elev || 0);
    const mats = { wood: MAT.wood, white: texMat('plaster', 0xe8e4dc, { roughness: 0.6, bumpScale: 0.1 }), dark: texMat('plaster', 0x2c2a28, { roughness: 0.7, bumpScale: 0.1 }), metal: MAT.chrome, concrete: texMat('concrete', 0x8a8a8a, { roughness: 0.9 }), fabric: texMat('fabric', 0x6a6f7a, { roughness: 1 }) };
    box(g, mats[it.mat] || MAT.wood, w, hh, d, 0, el + hh / 2, 0); }
}

// odrazka / difuzní rám: deska na stojanu + plošné světlo s jasem ze simulace (černá = záporný zdroj, ubírá rozptyl)
function addBounce(b, res) {
  const dif = b.kind === 'diffuser', P = S.boardParams(b), hh = P.hgt, cy = P.z;
  const g = new THREE.Group(); g.position.set(b.x, 0, b.y); g.rotation.y = -b.rot; group.add(g);
  const ems = res ? res.ems.filter(e => e.bounce && e.id === b.id) : [], em = ems.find(e => !e.neg);
  let mat;
  if (dif) { const Lum = em ? em.E1 / P.area : 0; mat = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 1, transparent: true, opacity: 0.88, side: THREE.DoubleSide, emissive: em ? col3(em.col) : new THREE.Color(0), emissiveIntensity: Lum * 0.9 }); }
  else mat = new THREE.MeshStandardMaterial({ color: b.black ? 0x050505 : (b.silver ? 0xd8dce2 : 0xf4f1e8), roughness: b.silver ? 0.35 : 1, metalness: b.silver ? 0.45 : 0, side: THREE.DoubleSide });
  const tl = (b.tiltDeg || 0) * Math.PI / 180, tg = new THREE.Group(); tg.position.y = cy; tg.rotation.x = b.flip ? tl : -tl; g.add(tg); // náklon desky kolem vodorovné osy
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(b.len, hh), mat); pl.castShadow = !dif; pl.receiveShadow = true; tg.add(pl);
  if (dif) { const fm = MAT.metal, t = 0.025; [[b.len + t, t, 0, hh / 2], [b.len + t, t, 0, -hh / 2]].forEach(q => box(tg, fm, q[0], q[1], t, 0, q[3], 0)); [-1, 1].forEach(sd => box(tg, fm, t, hh + t, t, sd * b.len / 2, 0, 0)); }
  stand(0, 0, Math.max(0.4, cy - hh / 2), g);
  ems.forEach(e => { if (Math.abs(e.E1) < 1e-6) return;
    const rl = new THREE.RectAreaLight(col3(e.col), e.E1 / P.area * 1.7, b.len, hh); // ×1,7: plošné světlo three.js na krátkou vzdálenost vychází slabší než výpočet v simulaci
    const et = e.tilt || 0; rl.position.set(b.x + e.nx * 0.03, cy, b.y + e.ny * 0.03); rl.lookAt(b.x + e.nx * 2 * Math.cos(et), cy + 2 * Math.sin(et), b.y + e.ny * 2 * Math.cos(et)); group.add(rl); });
}

function addWindow(sc, w) {
  if (typeof w.wall !== 'string' || sc.outdoor) return;
  const envW = !!(w.envWin && sc.env); // okno je v 3D modelu prostředí → jen světlo zvenku, bez rámu a skla
  const sk = S.SKY[sc.sky] || S.SKY.overcast, k = kel(sk.cct), len = w.to - w.from, mid = (w.from + w.to) / 2, W = sc.room.w, H = sc.room.h;
  let pos, look;
  if (w.wall === 'left') { pos = [0.005, 1.5, mid]; look = [1, 1.5, mid]; } else if (w.wall === 'right') { pos = [W - 0.005, 1.5, mid]; look = [W - 1, 1.5, mid]; }
  else if (w.wall === 'top') { pos = [mid, 1.5, 0.005]; look = [mid, 1.5, 1]; } else { pos = [mid, 1.5, H - 0.005]; look = [mid, 1.5, H - 1]; }
  if (w.inset) { const iw = wallFrame(sc, w.wall).inward; pos[0] += iw[0] * w.inset; pos[2] += iw[1] * w.inset; look[0] += iw[0] * w.inset; look[2] += iw[1] * w.inset; } // okno ve zdi modelu uvnitř obrysu
  const bl = S.blindOf(w), openH = 1.2 * (1 - bl), E1 = sk.E * len / 1.2 * k.gain * (1 - bl * 0.97);
  if (openH > 0.01) {
    const rl = new THREE.RectAreaLight(k.color, E1 / (len * openH), len, openH); rl.position.set(pos[0], S.WIN_Z0 + openH / 2, pos[2]); rl.lookAt(look[0], S.WIN_Z0 + openH / 2, look[2]); group.add(rl);
    const exOn = sc.exterior && sc.exterior.on;
    if (!envW && !winModel()) { const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, openH), exOn ? new THREE.MeshBasicMaterial({ color: k.color.clone().multiplyScalar(sk.E / Math.PI * 0.15), transparent: true, opacity: 0.35, depthWrite: false }) : lum(k.color, sk.E * len / 1.2 * k.gain / (len * 1.2)));
    glass.position.set(pos[0], S.WIN_Z0 + openH / 2, pos[2]); glass.lookAt(look[0], S.WIN_Z0 + openH / 2, look[2]); group.add(glass); }
  }
  if (bl > 0 && !envW) { // roleta: světlý panel shora, propouští trochu světla
    const bh = 1.2 * bl, bm = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 1, emissive: k.color, emissiveIntensity: sk.E * 0.02 });
    const bg = new THREE.Group(); bg.position.set(pos[0], 0, pos[2]); bg.rotation.y = wallFrame(sc, w.wall).ry; group.add(bg);
    box(bg, bm, len, bh, 0.02, 0, S.WIN_Z1 - bh / 2, 0.04);
    for (let y = S.WIN_Z1 - 0.06; y > S.WIN_Z1 - bh; y -= 0.08) box(bg, MAT.hair, len, 0.006, 0.03, 0, y, 0.04);
  }
  if (envW) { if (w.frame) envWinFrame(); addWinShadow(); return; }
  // otvor ve zdi modelu bez okna (řez bytu): plastové okno, nadpraží do stropu a parapet dorovnaný do výšky okna
  function envWinFrame() {
    const fr = wallFrame(sc, w.wall), g = new THREE.Group(), t = w.t || 0.24, Z = sc.room.z || 2.6, wm = new THREE.MeshStandardMaterial({ color: 0xe9e6e0, roughness: 0.95 });
    g.position.set(pos[0], 0, pos[2]); g.rotation.y = fr.ry; group.add(g);
    if (winModel()) windowModels(g, len);
    if (w.frame === 2) { // otvor vyříznutý do zdi modelu: dorovnat ostění (špalety), nadpraží a parapet
      const h = S.WIN_Z1 - S.WIN_Z0, e = 0.02; [-1, 1].forEach(sd => box(g, wm, e, h, t, sd * (len / 2 + e / 2), S.WIN_Z0 + h / 2, 0));
      box(g, wm, len + 2 * e, e, t, 0, S.WIN_Z1 + e / 2, 0); box(g, wm, len + 2 * e, e, t, 0, S.WIN_Z0 - e / 2, 0); return; }
    if (Z - S.WIN_Z1 > 0.02) box(g, wm, len, Z - S.WIN_Z1, t, 0, (Z + S.WIN_Z1) / 2, 0);
    if (w.sill != null && S.WIN_Z0 - w.sill > 0.03) box(g, wm, len, S.WIN_Z0 - w.sill, t, 0, (S.WIN_Z0 + w.sill) / 2, 0);
  }
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.8 }), fg = new THREE.Group(); fg.position.set(pos[0], 0, pos[2]); fg.rotation.y = wallFrame(sc, w.wall).ry; group.add(fg);
  if (winModel()) windowModels(fg, len);
  else { [-1, 1].forEach(sd => box(fg, frameMat, 0.06, 1.3, 0.12, sd * (len / 2 + 0.03), 1.5, 0)); box(fg, frameMat, len + 0.12, 0.06, 0.12, 0, 0.87, 0); box(fg, frameMat, len + 0.12, 0.06, 0.12, 0, 2.13, 0); }
  addWinShadow();
  function addWinShadow() {
  // měkký stín okna
  if (lastOpts.shadows && openH > 0.01) { const sp = new THREE.SpotLight(k.color, E1 * 0.3, 14, 0.9, 1, 2); const jx = hq.active ? jit() * len : 0, jy = hq.active ? jit() * openH : 0, fr2 = wallFrame(sc, w.wall); sp.position.set(pos[0] + (look[0] - pos[0]) * -0.3 + (fr2.inward[1]) * jx, S.WIN_Z0 + openH / 2 + jy, pos[2] + (look[2] - pos[2]) * -0.3 + (fr2.inward[0]) * jx); sp.target.position.set(look[0], 1.2, look[2]); sp.castShadow = true; sp.shadow.mapSize.set(Q().winMap, Q().winMap); sp.shadow.radius = 10; sp.shadow.bias = -0.002; group.add(sp); group.add(sp.target); }
  }
}

// plastové okno (3D model): dvoukřídlé okno 1,28 × 1,44 m, vnitřní strana (kliky, parapet) na +z; delší okna = víc oken vedle sebe
let winProto = null;
function winModel() {
  if (winProto) return winProto; const gl = modelFor('window'); if (!gl) return null;
  const glass = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0, depthWrite: false });
  const sc = gl.scene.clone(true); sc.updateMatrixWorld(true); sc.traverse(o => { if (o.isMesh) { if (/glass/i.test(o.material.name)) { o.material = glass; o.castShadow = false; } else { o.material = o.material.clone(); o.material.roughness = 0.45; } } });
  const fb = new THREE.Box3(); sc.traverse(o => { if (o.isMesh && /OuterFrame/i.test(o.name + (o.parent ? o.parent.name : ''))) fb.expandByObject(o); });
  const bb = fb.isEmpty() ? new THREE.Box3().setFromObject(sc) : fb;
  winProto = { scene: sc, w: bb.max.x - bb.min.x, y0: bb.min.y, h: bb.max.y - bb.min.y, cx: (bb.min.x + bb.max.x) / 2 }; return winProto;
}
function windowModels(parent, len) {
  const P = winModel(), n = Math.max(1, Math.round(len / 1.3)), segW = len / n, sy = (S.WIN_Z1 - S.WIN_Z0) / P.h;
  for (let i = 0; i < n; i++) { const inst = P.scene.clone(true); inst.scale.set(segW / P.w, sy, 1); inst.position.set(-len / 2 + segW * (i + 0.5) - P.cx * segW / P.w, S.WIN_Z0 - P.y0 * sy, 0); parent.add(inst); }
}
// souřadnice na stěně: s = poloha podél stěny (m), y = výška; vrací [x,z] v místnosti a směr dovnitř
const WALL_T = 0.2; // tloušťka obvodové zdi (vnější plášť)
// venkovní povrch u domu (fasáda, střecha, cesta): světlo oblohy „zapečené“ do emise jako u trávy a stromů (addExterior), jinak by byl pod zataženou oblohou černý
function skyLit(m, sc, color) { if (sc.outdoor) return m; const sk = S.SKY[sc.sky] || S.SKY.overcast, k = kel(sk.cct); m.emissive = new THREE.Color(color).multiply(k.color); m.emissiveMap = m.map; m.emissiveIntensity = sk.E / Math.PI * 0.45; return m; }
function wallFrame(sc, side) {
  const W = sc.room.w, H = sc.room.h;
  if (side === 'top') return { len: W, at: (s, y) => [s, y, 0], inward: [0, 1], ry: 0 };
  if (side === 'bottom') return { len: W, at: (s, y) => [s, y, H], inward: [0, -1], ry: Math.PI };
  if (side === 'left') return { len: H, at: (s, y) => [0, y, s], inward: [1, 0], ry: Math.PI / 2 };
  return { len: H, at: (s, y) => [W, y, s], inward: [-1, 0], ry: -Math.PI / 2 };
}
function addExterior(sc) {
  const ex = sc.exterior, open = !!(ex && ex.on) || !!sc.outdoor;
  if (!open && !(sc.windows || []).length) return; // bez oken není ven vidět
  const sk = S.SKY[sc.sky] || S.SKY.overcast, W = sc.room.w, H = sc.room.h, k = kel(sk.cct), k2 = k, Lsky = sk.E / Math.PI, DR = Math.max(48, Math.hypot(W, H) / 2 + 28); // poloměr oblohy podle velikosti exteriéru
  const skyTint = sc.sky === 'sunny' ? new THREE.Color(0.55, 0.72, 1.0) : sc.sky === 'dusk' ? new THREE.Color(0.55, 0.5, 0.75) : sc.sky === 'night' ? new THREE.Color(0.2, 0.28, 0.5) : new THREE.Color(0.85, 0.87, 0.9);
  // obloha: skybox (fotka oblohy) upravený podle počasí, jas navázaný na expozici → soumrak není černý, jasno není šedé
  const skyTex = skyTexture(sc.sky === 'sunny' ? 'sunny' : sc.sky === 'dusk' ? 'dusk' : sc.sky === 'night' ? 'night' : 'overcast');
  if (skyTex) {
    const kk = sc.sky === 'sunny' ? 0.72 : sc.sky === 'dusk' ? 0.85 : sc.sky === 'night' ? 0.35 : 1.0, X = open ? kk * (lastOpts.ref || 300) / 2.6 : sk.E * 0.9;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(DR, 48, 24), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.material.color.setScalar(X); dome.position.set(W / 2, -1, H / 2); dome.renderOrder = -1; dome.userData.noShadow = true;
    const az = sc.sun && sc.sun.az != null ? sc.sun.az : Math.PI * 1.25; dome.rotation.y = (Math.PI - 2 * Math.PI * SKY_SUN_U) - az; // zapečené slunce oblohy do směru našeho slunce
    group.add(dome);
    if (sc.sky === 'night' && S.sunOn(sc)) { // měsíc: malý svítící kotouč ve směru „slunce“
      const d = S.sunDir(sc), el = (sc.sun.elev == null ? 35 : sc.sun.elev) * Math.PI / 180, R = DR - 4, mp = new THREE.Vector3(W / 2 + d[0] * Math.cos(el) * R, -1 + Math.sin(el) * R, H / 2 + d[1] * Math.cos(el) * R);
      const moon = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.96, 1).multiplyScalar(X * 9), fog: false, depthWrite: false }));
      moon.position.copy(mp); moon.lookAt(W / 2, 1.5, H / 2); moon.renderOrder = -1; moon.userData.noShadow = true; group.add(moon);
      const hc = document.createElement('canvas'); hc.width = hc.height = 128; const hx = hc.getContext('2d'), gr = hx.createRadialGradient(64, 64, 8, 64, 64, 64); gr.addColorStop(0, 'rgba(150,170,220,0.55)'); gr.addColorStop(0.35, 'rgba(90,110,170,0.18)'); gr.addColorStop(1, 'rgba(40,50,90,0)'); hx.fillStyle = gr; hx.fillRect(0, 0, 128, 128);
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), color: new THREE.Color(1, 1, 1).multiplyScalar(X * 1.2), transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.copy(mp).multiplyScalar(0.999); halo.lookAt(W / 2, 1.5, H / 2); halo.renderOrder = -1; group.add(halo); }
  } else { const R = DR, geo = new THREE.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const zen = skyTint.clone().multiplyScalar(Lsky * 0.32), hor = skyTint.clone().lerp(new THREE.Color(1, 0.97, 0.92), 0.55).multiplyScalar(Lsky * 0.55);
    for (let i = 0; i < pos.count; i++) { const t = Math.max(0, pos.getY(i) / R); const c = hor.clone().lerp(zen, Math.pow(t, 0.6)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })); dome.position.set(W / 2, -1, H / 2); dome.renderOrder = -1; dome.userData.noShadow = true; group.add(dome); }
  // materiál venku: obloha „zapečená“ do emissive (aby nesvítila dovnitř), slunce navíc přes DirectionalLight
  const ext = (color, kind, rep) => { const m = texMat(kind || 'cloth', color, { roughness: 1, bumpScale: 0.2 }); const c = new THREE.Color(color); m.emissive = c.clone().multiply(k.color); m.emissiveIntensity = Lsky * (open ? 0.45 : 0.2); if (rep) { m.map = m.map.clone(); m.map.repeat.set(rep, rep); m.map.needsUpdate = true; } return m; };
  const GS = 2 * DR + 8, EG = sc.env && S.ENVS[sc.env];
  let gGeo = new THREE.PlaneGeometry(GS, GS);
  if (EG && EG.groundHole) { // prostředí má vlastní podlahu níž než terén (montážní jámy) → v trávě otvor pod modelem
    const sh = new THREE.Shape(); sh.moveTo(-GS / 2, -GS / 2); sh.lineTo(GS / 2, -GS / 2); sh.lineTo(GS / 2, GS / 2); sh.lineTo(-GS / 2, GS / 2); sh.lineTo(-GS / 2, -GS / 2);
    const ho = new THREE.Path(), hw = W / 2 - 0.2, hh = H / 2 - 0.2; ho.moveTo(-hw, -hh); ho.lineTo(-hw, hh); ho.lineTo(hw, hh); ho.lineTo(hw, -hh); ho.lineTo(-hw, -hh); sh.holes.push(ho);
    gGeo = new THREE.ShapeGeometry(sh); const pa = gGeo.attributes.position, uv = gGeo.attributes.uv; for (let i = 0; i < pa.count; i++) uv.setXY(i, pa.getX(i) / GS + 0.5, pa.getY(i) / GS + 0.5); }
  const ground = new THREE.Mesh(gGeo, ext(0x4e6b34, 'fabric', Math.round(GS / 2))); ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, sc.env ? -0.06 : -0.01, H / 2); ground.receiveShadow = true; group.add(ground);
  // bez zahrady: za okny aspoň pár stromů (jinak by byla vidět jen plochá zelená)
  // obrubník / základová deska domu
  if (!sc.outdoor && open) { const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.12, H + 0.6), ext(0x8c8880, 'concrete', 4)); slab.position.set(W / 2, -0.06, H / 2); group.add(slab); }
  else if (sc.floor !== 'grass') { const pav = new THREE.Mesh(new THREE.PlaneGeometry(W, H), surfMat(sc.floor === 'wood' ? 'wood' : FLOORTEX[sc.floor || 'grey'], sc.floor === 'wood' ? 0x8a6444 : sc.floor === 'dark' ? 0x3a3a3a : sc.floor === 'asphalt' ? 0x8a8a8a : 0x8d8d88, sc.floor === 'asphalt' ? W / 4 : W / 2, sc.floor === 'asphalt' ? H / 4 : H / 2, { roughness: 0.9 })); pav.rotation.x = -Math.PI / 2; pav.position.set(W / 2, 0.005, H / 2); pav.receiveShadow = true; group.add(pav); }
  const trunkMat = ext(0x5a4030, 'wood', 1), leafMat = ext(0x3f7a33, 'fabric', 3), conMat = ext(0x2f5a2c, 'fabric', 3);
  const treeGl = modelFor('tree');
  (sc.outdoor && !(ex && ex.on) ? [] : S.exteriorTrees(open ? sc : { room: sc.room, exterior: { on: true, trees: 7 } })).forEach(t => {
    const g = new THREE.Group(); g.position.set(t.x, 0, t.y); group.add(g);
    if (treeGl) { // model stromu; mimo režim „jen exteriér“ dostane jas oblohy jako emisi (uvnitř domu je okolní světlo slabé)
      const pr = treeProto(treeGl, t.kind === 'b' ? 1 : 0), inst = pr.clone(true), bb = new THREE.Box3().setFromObject(pr, true), k = t.h / (bb.max.y - bb.min.y);
      inst.scale.setScalar(k); inst.rotation.y = t.rot || 0;
      if (!sc.outdoor) inst.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = k2.color.clone(); o.material.emissiveMap = o.material.map; o.material.emissiveIntensity = Lsky * 0.3; } });
      g.add(inst); g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return;
    }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, t.h * 0.45, 8), trunkMat); trunk.position.y = t.h * 0.225; g.add(trunk);
    if (t.kind === 'conifer') { [0, 1, 2].forEach(i => { const c = new THREE.Mesh(new THREE.ConeGeometry(t.r * (1 - i * 0.25), t.h * 0.35, 10), conMat); c.position.y = t.h * 0.35 + i * t.h * 0.2; g.add(c); }); }
    else { [[0, t.h * 0.62, 0, 1], [t.r * 0.5, t.h * 0.75, t.r * 0.2, 0.75], [-t.r * 0.45, t.h * 0.7, -t.r * 0.3, 0.7], [0, t.h * 0.85, 0, 0.6]].forEach(o => { const b = new THREE.Mesh(new THREE.SphereGeometry(t.r * o[3], 12, 10), leafMat); b.position.set(o[0], o[1], o[2]); b.scale.y = 0.85; g.add(b); }); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  });
  if (open) addFence(sc, k2.color, Lsky);
}
// obloha ze skyboxu: textura je v souboru vzhůru nohama (nahoře spodní polokoule) → otočit; varianty jasno / zataženo / soumrak
const SKY_SUN_U = 651 / 1024, skyTexCache = {};
function skyTexture(kind) {
  if (skyTexCache[kind]) return skyTexCache[kind];
  const gl = modelFor('skybox'); if (!gl) return null;
  let img = null; gl.scene.traverse(o => { if (!img && o.isMesh && o.material && o.material.map) img = o.material.map.image; }); if (!img) return null;
  const w = 1024, h = 512, cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d');
  cx.translate(0, h); cx.scale(1, -1); cx.drawImage(img, 0, 0, w, h); cx.setTransform(1, 0, 0, 1, 0, 0);
  if (kind !== 'sunny') {
    const id = cx.getImageData(0, 0, w, h), d = id.data;
    for (let y = 0; y < h; y++) { const t = Math.min(1, y / (h / 2)); // 0 = zenit, 1 = obzor
      for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, L = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; let c;
        if (kind === 'overcast') { const v = 0.6 + 0.3 * L + 0.05 * t; c = [v * 0.97, v * 0.985, v * 1.02]; }
        else if (kind === 'night') { const tt = Math.pow(t, 2), f = 0.35 + 0.35 * L; c = [(0.05 + 0.12 * tt) * f, (0.08 + 0.16 * tt) * f, (0.2 + 0.2 * tt) * f];
          const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453, rr = h - Math.floor(h); if (t < 0.85 && rr > 0.9992) c = [0.75, 0.78, 0.85]; } // tmavě modrá, hvězdy
        else { const tt = Math.pow(t, 2.4), f = 0.5 + 0.8 * L; c = [(0.09 + 0.91 * tt) * f, (0.12 + 0.44 * tt) * f, (0.3 - 0.02 * tt) * f]; } // soumrak: tmavě modrý zenit → oranžový obzor
        d[i] = Math.min(255, c[0] * 255); d[i + 1] = Math.min(255, c[1] * 255); d[i + 2] = Math.min(255, c[2] * 255); } }
    cx.putImageData(id, 0, 0);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; skyTexCache[kind] = t; return t;
}
// dřevěný plot: v režimu „jen exteriér“ po obvodu plochy, u domu kolem pozemku (s mezerami u vchodů)
function addFence(sc, skyCol, Lsky) {
  if (sc.fence === false) return; const gl = modelFor('fence'); if (!gl) return;
  const W = sc.room.w, H = sc.room.h, m = sc.outdoor ? 0 : 7.5, x0 = -m, y0 = -m, x1 = W + m, y1 = H + m;
  const bb = new THREE.Box3().setFromObject(gl.scene), Lm = bb.max.x - bb.min.x, zc = (bb.min.z + bb.max.z) / 2;
  const gaps = sc.outdoor ? [] : (sc.doors || []).filter(d => d.wall === 'bottom').map(d => [d.at - d.w / 2 - 0.5, d.at + d.w / 2 + 0.5]);
  const run = (ax, ay, bx, by) => { const E = Math.hypot(bx - ax, by - ay); if (E < 0.3) return; const n = Math.max(1, Math.ceil(E / Lm)), seg = E / n, ang = Math.atan2(by - ay, bx - ax);
    for (let i = 0; i < n; i++) { const h = new THREE.Group(); h.position.set(ax + (bx - ax) * i / n, 0, ay + (by - ay) * i / n); h.rotation.y = -ang;
      const inst = gl.scene.clone(true); inst.scale.x = seg / Lm; inst.position.set(-bb.min.x * seg / Lm, 0, -zc); h.add(inst); group.add(h);
      if (!sc.outdoor) inst.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = skyCol.clone(); o.material.emissiveMap = o.material.map; o.material.emissiveIntensity = Lsky * 0.3; } }); } };
  run(x0, y0, x1, y0); run(x1, y0, x1, y1); run(x0, y1, x0, y0);
  let cur = x0; gaps.sort((a, b) => a[0] - b[0]).forEach(g => { run(cur, y1, Math.max(cur, g[0]), y1); cur = Math.max(cur, g[1]); }); run(cur, y1, x1, y1);
}
// prostředí jako 3D model (fotoateliér, hala s cykloramou) místo procedurálních stěn
let envInst = null; // model prostředí (ateliér, kemp) v aktuální scéně – kvůli rozsvícení svítidel v něm
// rozsvítit těleso svítidla v modelu prostředí (lampa, světlo u dveří…), když je na jeho místě zapnuté světlo (L.envGlow = jméno dílu)
function envGlow(L, k, E1) {
  if (!L.envGlow || !envInst || !k) return; const pre = /\*$/.test(L.envGlow) ? L.envGlow.slice(0, -1) : null; // „jméno*“ = všechny díly s tímto začátkem (např. 25 svítidel v obchodě)
  const objs = []; if (pre) envInst.traverse(o => { if (o.name && o.name.indexOf(pre) === 0) objs.push(o); }); else { const o = envInst.getObjectByName(L.envGlow); if (o) objs.push(o); } if (!objs.length) return;
  objs.forEach(o => o.traverse(m => { if (!m.isMesh) return; m.material = m.material.clone(); m.material.emissive = k.color.clone(); m.material.emissiveIntensity = E1 * (L.glowK || 1.5); m.userData.noCast = true; }));
}
function addEnv(sc) {
  const E = sc.env && S.ENVS[sc.env]; if (!E) return false; const gl = modelFor(E.model); if (!gl) return false;
  const inst = gl.scene.clone(true); inst.position.set(E.off[0], E.offY || 0, E.off[1]); envInst = inst;
  inst.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; if (o.material && o.material.emissive && o.material.emissiveIntensity > 0 && !o.material.emissiveMap) o.material = o.material.clone(), o.material.emissiveIntensity = 0; } });
  group.add(inst);
  // model bez stropu (řez bytu): strop v zadané výšce; vidět jen zespodu, stíní i slunce shora
  if (E.ceil) { const cm = surfMat('ceiling', 0xe4e0d8, sc.room.w / 2.5, sc.room.h / 2.5, { roughness: 1, bumpScale: 0.2 }); cm.shadowSide = THREE.DoubleSide;
    const c = new THREE.Mesh(new THREE.PlaneGeometry(sc.room.w, sc.room.h), cm); c.rotation.x = Math.PI / 2; c.position.set(sc.room.w / 2, E.ceil, sc.room.h / 2); group.add(c); }
  return true;
}
// půdorysný obrázek prostředí: model shora ve vlastním malém rendereru, řez ve výšce 1,8 m (bez stropů), výřez = místnost; uloží se jako obrázek
const planCache = {};
function envPlan(id) {
  const c = planCache[id]; if (c) return c; const E = S.ENVS[id]; const gl = E && modelFor(E.model); if (!gl) return null;
  const W = E.room.w, H = E.room.h, px = Math.min(48, 2048 / Math.max(W, H)), cw = Math.round(W * px), ch = Math.round(H * px);
  let r; try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return (planCache[id] = null); }
  r.setPixelRatio(1); r.setSize(cw, ch, false); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x000000, 0);
  r.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.8)];
  const sc = new THREE.Scene(), inst = gl.scene.clone(true); inst.position.set(E.off[0], E.offY || 0, E.off[1]); sc.add(inst); sc.add(new THREE.AmbientLight(0xffffff, 2.6));
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.1, 200); cam.position.set(W / 2, 100, H / 2); cam.up.set(0, 0, -1); cam.lookAt(W / 2, 0, H / 2);
  r.render(sc, cam); const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; cv.getContext('2d').drawImage(r.domElement, 0, 0);
  r.dispose(); r.forceContextLoss(); return (planCache[id] = cv);
}
function addRoom(sc) {
  const W = sc.room.w, H = sc.room.h, Z = sc.room.z || 2.7;
  if (sc.outdoor) return; // exteriér: zem, obloha a stromy dělá addExterior
  const wallMat = surfMat('plaster', WALLCOL[sc.walls || 'normal'], W / 2.5, Z / 2.5, { roughness: 0.95, bumpScale: 0.35 });
  const floorMat = surfMat(FLOORTEX[sc.floor || 'wood'], FLOORCOL[sc.floor || 'wood'], W / 2, H / 2, { roughness: sc.floor === 'wood' ? 0.55 : 0.85, bumpScale: 0.5 });
  const ceilMat = surfMat('ceiling', 0xd0cbc2, W / 2.5, H / 2.5, { roughness: 1, bumpScale: 0.2 });
  const facadeMat = skyLit(surfMat('plaster', 0xd9d3c7, W / 2.5, Z / 2.5, { roughness: 0.95, bumpScale: 0.35 }), sc, 0xd9d3c7);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); floor.receiveShadow = true; group.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, H), ceilMat); ceil.userData.ceil = true; ceil.rotation.x = Math.PI / 2; ceil.position.set(W / 2, Z, H / 2); ceil.castShadow = true; group.add(ceil);
  ['top', 'bottom', 'left', 'right'].forEach(side => {
    const fr = wallFrame(sc, side);
    // otvory: [s0, s1, z0, z1]
    const ops = [];
    (sc.windows || []).forEach(w => { if (w.wall === side) ops.push([w.from, w.to, S.WIN_Z0, S.WIN_Z1]); });
    (sc.doors || []).forEach(d => { if (d.wall === side && (d.open !== false || (d.w <= 1.4 && doorModel()))) ops.push([d.at - d.w / 2, d.at + d.w / 2, 0, 2.05]); });
    ops.sort((a, b) => a[0] - b[0]);
    const pieces = []; let cur = 0;
    ops.forEach(o => { if (o[0] > cur) pieces.push([cur, o[0], 0, Z]); if (o[2] > 0) pieces.push([o[0], o[1], 0, o[2]]); if (o[3] < Z) pieces.push([o[0], o[1], o[3], Z]); cur = Math.max(cur, o[1]); });
    if (cur < fr.len) pieces.push([cur, fr.len, 0, Z]);
    pieces.forEach(pc => { const w = pc[1] - pc[0], h = pc[3] - pc[2]; if (w <= 0.001 || h <= 0.001) return; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat); const c = fr.at((pc[0] + pc[1]) / 2, (pc[2] + pc[3]) / 2); m.position.set(c[0], c[1], c[2]); m.rotation.y = fr.ry; m.receiveShadow = true; m.castShadow = true; m.userData.side = side; group.add(m);
      // vnější plášť zdi (fasáda, tloušťka WALL_T) – vidět jen z pohledu kamery stojící venku; stíny nevrhá, aby se neměnilo světlo uvnitř
      const sh = new THREE.Mesh(new THREE.BoxGeometry(w, h, WALL_T), facadeMat); sh.position.set(c[0] - fr.inward[0] * (WALL_T / 2 + 0.004), c[1], c[2] - fr.inward[1] * (WALL_T / 2 + 0.004)); sh.rotation.y = fr.ry; sh.receiveShadow = true; sh.userData.ext = side; group.add(sh); });
  });
  // rohy pláště a plochá střecha
  [[0, 0], [W, 0], [0, H], [W, H]].forEach(q => { const m = new THREE.Mesh(new THREE.BoxGeometry(WALL_T, Z, WALL_T), facadeMat); m.position.set(q[0] + (q[0] ? 1 : -1) * (WALL_T / 2 + 0.004), Z / 2, q[1] + (q[1] ? 1 : -1) * (WALL_T / 2 + 0.004)); m.receiveShadow = true; m.userData.ext = 'any'; group.add(m); });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * WALL_T + 0.02, WALL_T, H + 2 * WALL_T + 0.02), skyLit(surfMat('concrete', 0x6d6a66, W / 2, H / 2, { roughness: 1 }), sc, 0x6d6a66)); roof.position.set(W / 2, Z + WALL_T / 2 + 0.004, H / 2); roof.receiveShadow = true; roof.userData.ext = 'any'; group.add(roof);
  const sk = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, 0.001, H)), new THREE.LineBasicMaterial({ color: 0x000000 })); sk.position.set(W / 2, 0.002, H / 2); group.add(sk);
  (sc.doors || []).forEach(d => addDoor(sc, d));
}
// nakreslená zeď (box, tloušťka 0,12 m) s otvory oken
// asfaltová cesta: plocha s texturou asfaltu, přerušovaná středová čára, volitelně krajní čáry (jen v exteriéru)
function addRoad(sc, it) {
  if (!(sc.outdoor || (sc.exterior && sc.exterior.on))) return;
  const L = S.wallLen(it); if (L < 0.1) return; const wd = it.wd || 3.5, y = sc.outdoor ? 0.012 + (it.id % 5) * 0.0012 : -0.0068 + (it.id % 3) * 0.0012; // u domu pod základovou deskou → do domu nezasahuje
  const g = new THREE.Group(); g.position.set((it.x1 + it.x2) / 2, y, (it.y1 + it.y2) / 2); g.rotation.y = -Math.atan2(it.y2 - it.y1, it.x2 - it.x1); group.add(g);
  const off = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(L, wd), skyLit(surfMat('asphalt', 0x6c6c6c, L / 4, wd / 4, Object.assign({ roughness: 0.95, bumpScale: 0.4 }, off)), sc, 0x6c6c6c)); pl.rotation.x = -Math.PI / 2; pl.receiveShadow = true; g.add(pl);
  const lm = skyLit(new THREE.MeshStandardMaterial(Object.assign({ color: 0xe6e6e0, roughness: 0.75 }, off, { polygonOffsetFactor: -4, polygonOffsetUnits: -4 })), sc, 0xe6e6e0);
  const stripe = (len, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.12), lm); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.002, z); m.receiveShadow = true; g.add(m); };
  if (it.line !== false) for (let s = -L / 2 + 1.5; s + 3 <= L / 2 - 1.5 + 0.01; s += 6) stripe(3, s + 1.5, 0);
  if (it.edge) [-1, 1].forEach(sd => stripe(L, 0, sd * (wd / 2 - 0.3)));
}
function addWallItem(sc, it) {
  const L = S.wallLen(it); if (L < 0.05) return;
  const Z = sc.room.z || 2.7, mat = surfMat('plaster', WALLCOL[sc.walls || 'normal'], L / 2.5, Z / 2.5, { roughness: 0.95, bumpScale: 0.35 });
  const g = new THREE.Group(); g.userData.seg = [it.x1, it.y1, it.x2, it.y2]; g.position.set(it.x1, 0, it.y1); g.rotation.y = -Math.atan2(it.y2 - it.y1, it.x2 - it.x1); group.add(g);
  const ops = []; (sc.windows || []).forEach(w => { if (w.wall === it.id) ops.push([w.from, w.to, S.WIN_Z0, S.WIN_Z1]); });
  const drs = (sc.doors || []).filter(d => d.wall === it.id); drs.forEach(d => ops.push([d.at - d.w / 2, d.at + d.w / 2, 0, 2.05, d])); ops.sort((a, b) => a[0] - b[0]);
  const pieces = []; let cur = 0;
  ops.forEach(o => { if (o[0] > cur) pieces.push([cur, o[0], 0, Z]); if (o[2] > 0) pieces.push([o[0], o[1], 0, o[2]]); pieces.push([o[0], o[1], o[3], Z]); cur = Math.max(cur, o[1]); });
  if (cur < L) pieces.push([cur, L, 0, Z]);
  pieces.forEach(pc => { const w = pc[1] - pc[0], h = pc[3] - pc[2]; if (w <= 0.001 || h <= 0.001) return; box(g, mat, w, h, 0.12, (pc[0] + pc[1]) / 2, (pc[2] + pc[3]) / 2, 0); });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.8 });
  ops.forEach(o => { const len = o[1] - o[0], mid = (o[0] + o[1]) / 2;
    if (o[4]) { // dveře v příčce (průchod mezi místnostmi)
      const d = o[4], dg = new THREE.Group(); dg.position.set(mid, 0, 0); g.add(dg);
      if (d.w <= 1.4 && doorModel()) doorInstance(dg, d.w, d.open !== false);
      else { [-1, 1].forEach(sd => box(dg, frameMat, 0.06, 2.1, 0.14, sd * (len / 2 + 0.03), 1.05, 0)); box(dg, frameMat, len + 0.12, 0.06, 0.14, 0, 2.08, 0); }
      return; }
    if (winModel()) { const wg = new THREE.Group(); wg.position.set(mid, 0, 0.06); g.add(wg); windowModels(wg, len); return; }
    [-1, 1].forEach(sd => box(g, frameMat, 0.06, 1.3, 0.14, mid + sd * (len / 2 + 0.03), 1.5, 0)); box(g, frameMat, len + 0.12, 0.06, 0.14, mid, 0.87, 0); box(g, frameMat, len + 0.12, 0.06, 0.14, mid, 2.13, 0); });
}
function addSun(sc) {
  if (!S.sunOn(sc)) return;
  const d = S.sunDir(sc), el = (sc.sun.elev == null ? 35 : sc.sun.elev) * Math.PI / 180, k = kel(S.sunCCT(sc)), W = sc.room.w, H = sc.room.h, R = Math.max(W, H);
  const sun = new THREE.DirectionalLight(k.color, S.sunE(sc) * k.gain);
  sun.position.set(W / 2 + d[0] * Math.cos(el) * 25, Math.sin(el) * 25 + 1.5, H / 2 + d[1] * Math.cos(el) * 25); if (hq.active) sun.position.add(new THREE.Vector3(jit(), jit(), jit()).multiplyScalar(0.25)); sun.target.position.set(W / 2, 1.2, H / 2);
  sun.castShadow = !!lastOpts.shadows; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  const R2 = ((sc.exterior && sc.exterior.on) || sc.outdoor) ? R + 8 : R; const c = sun.shadow.camera; c.left = -R2; c.right = R2; c.top = R2; c.bottom = -R2; c.near = 1; c.far = 60; c.updateProjectionMatrix(); sun.shadow.mapSize.set(Q().sunMap, Q().sunMap);
  group.add(sun); group.add(sun.target);
}
function addDoor(sc, d) {
  if (sc.outdoor) return;
  const fr = wallFrame(sc, d.wall), L = S.DOORLIGHT[d.light] || S.DOORLIGHT.none, k = kel(L.cct), open = d.open !== false;
  const inX = fr.inward[0], inZ = fr.inward[1], c = fr.at(d.at, 1.025);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.8 }), leafMat = texMat('wood', 0xcdbba0, { roughness: 0.6, bumpScale: 0.3 });
  const g = new THREE.Group(); g.position.set(c[0], 0, c[2]); g.rotation.y = fr.ry; g.userData.side = d.wall; group.add(g);
  const useModel = d.w <= 1.4 && doorModel();
  // zárubeň (lokálně: x podél stěny, z = dovnitř místnosti)
  if (useModel) doorInstance(g, d.w, open);
  else { [-1, 1].forEach(sd => box(g, frameMat, 0.06, 2.1, 0.14, sd * (d.w / 2 + 0.03), 1.05, 0));
    box(g, frameMat, d.w + 0.12, 0.06, 0.14, 0, 2.08, 0); }
  if (open) {
    // křídlo otevřené o 85° do místnosti, závěs na levé straně
    if (!useModel) { const leaf = new THREE.Group(); leaf.position.set(-d.w / 2, 0, 0.05); leaf.rotation.y = -Math.PI * 0.47; g.add(leaf);
      box(leaf, leafMat, d.w, 2.02, 0.04, d.w / 2, 1.01, 0); }
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
  } else if (!useModel) { box(g, leafMat, d.w, 2.02, 0.04, 0, 1.01, 0); }
}
// dveře se zárubní (3D model): geometrie zapečená v metrech, křídlo zvlášť s pantem v počátku → otevírá se bez deformace
let doorProtoC = null;
function doorModel() {
  if (doorProtoC) return doorProtoC; const gl = modelFor('door'); if (!gl) return null;
  const src = gl.scene; src.updateMatrixWorld(true); let leafRoot = null; src.traverse(o => { if (!leafRoot && /^Plane\.?001$/.test(o.name)) leafRoot = o; });
  const frame = [], leaf = [];
  src.traverse(o => { if (!o.isMesh) return; let q = o, isLeaf = false; while (q) { if (q === leafRoot) isLeaf = true; q = q.parent; } const gg = o.geometry.clone().applyMatrix4(o.matrixWorld); gg.scale(0.01, 0.01, 0.01); (isLeaf ? leaf : frame).push(new THREE.Mesh(gg, o.material)); });
  const all = new THREE.Box3(); frame.concat(leaf).forEach(m => { m.geometry.computeBoundingBox(); all.union(m.geometry.boundingBox); });
  const cx = (all.min.x + all.max.x) / 2, y0 = all.min.y; frame.concat(leaf).forEach(m => m.geometry.translate(-cx, -y0, 0));
  const lb = new THREE.Box3(); leaf.forEach(m => { m.geometry.computeBoundingBox(); lb.union(m.geometry.boundingBox); });
  const hinge = leaf.length ? new THREE.Vector3(lb.min.x, 0, (lb.min.z + lb.max.z) / 2) : new THREE.Vector3(); leaf.forEach(m => m.geometry.translate(-hinge.x, 0, -hinge.z));
  doorProtoC = { frame, leaf, W: all.max.x - all.min.x, H: all.max.y - all.min.y, hinge }; return doorProtoC;
}
function doorInstance(parent, w, open) {
  const P = doorModel(), sx = (w + 0.12) / P.W, sy = 2.1 / P.H;
  const fg = new THREE.Group(); fg.scale.set(sx, sy, 1); P.frame.forEach(m => fg.add(m.clone())); parent.add(fg);
  const lp = new THREE.Group(); lp.position.set(P.hinge.x * sx, 0, P.hinge.z); lp.rotation.y = open ? -Math.PI * 0.47 : 0;
  const ls = new THREE.Group(); ls.scale.set(sx, sy, 1); P.leaf.forEach(m => ls.add(m.clone())); lp.add(ls); parent.add(lp);
}

function sync(sc, res, meas, opts) {
  if (!renderer) return;
  const fa0 = formatAspect(); lastScene = sc; lastRes = res; lastOpts = opts || {}; if (formatAspect() !== fa0) resize(); // šablona / varianta s jiným formátem obrazu
  for (const k in rigs) delete rigs[k];
  if (!hq.building) stopHQ();
  applyQualityRatio();
  clear(group); pendingLift = [];
  scene3.background = new THREE.Color(0x000000); envInst = null; addExterior(sc); if (!addEnv(sc)) addRoom(sc); (sc.windows || []).forEach(w => addWindow(sc, w)); addSun(sc); addSunBeams(sc); sc.items.forEach(it => { if (it.kind === 'wall') addWallItem(sc, it); else if (it.kind === 'road') addRoad(sc, it); });
  sc.items.forEach(it => { const nTag = group.children.length; addItem3D(sc, it, res); if (it.kind !== 'camera' && it.kind !== 'wall' && it.kind !== 'road') for (let i = nTag; i < group.children.length; i++) group.children[i].userData.itemId = it.id; });
  function addItem3D(sc, it, res) {
    if (it.kind === 'light') { const n0 = group.children.length; addLight(it, res);
      if (S.diffusedBy(sc, it)) { const drop = []; for (let i = n0; i < group.children.length; i++) group.children[i].traverse(o => { if (o.isLight || (o.userData && o.userData.beam)) drop.push(o); }); drop.forEach(o => o.parent && o.parent.remove(o)); } // světlo míří do difuzního rámu → svítí rám
      if (it.hide) for (let i = n0; i < group.children.length; i++) group.children[i].traverse(o => { if (o.isMesh) o.visible = false; }); }
    else if (it.kind === 'person') addPerson(it);
    else if (it.kind === 'bounce' || it.kind === 'diffuser') addBounce(it, res);
    else if (it.kind === 'flag') { const g = new THREE.Group(); g.position.set(it.x, 0, it.y); g.rotation.y = -it.rot; const m = new THREE.Mesh(new THREE.PlaneGeometry(it.len, 0.9), MAT.flag); m.position.y = 1.5; m.castShadow = true; g.add(m); stand(0, 0, 1.05, g); group.add(g); }
    else if (it.kind === 'box' || it.kind === 'furniture') addFurniture(it);
    else if (it.kind === 'camera' && modelFor('filmcam')) { camMesh = new THREE.Group(); camMesh.position.set(it.x, 0, it.y); camMesh.rotation.y = -it.rot; filmCamera(camMesh, modelFor('filmcam'), it.h == null ? 1.5 : it.h); group.add(camMesh); }
    else if (it.kind === 'camera') { camMesh = new THREE.Group(); camMesh.position.set(it.x, 0, it.y); camMesh.rotation.y = -it.rot; const ch = it.h == null ? 1.5 : it.h; const b = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.15, 0.13), MAT.metal); b.position.y = ch + 0.07; camMesh.add(b); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.047, 0.14, 14), MAT.metal); l.position.set(0.18, ch + 0.07, 0); l.rotation.z = -Math.PI / 2; camMesh.add(l); const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), MAT.eye); lens.position.set(0.251, ch + 0.07, 0); lens.rotation.y = Math.PI / 2; camMesh.add(lens); const mon = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.14), MAT.metal); mon.position.set(-0.1, ch + 0.2, 0.05); camMesh.add(mon); tripod(camMesh, ch); group.add(camMesh); }
  }
  group.updateMatrixWorld(true); pendingLift.forEach(a => liftHands(a[0], a[1], a[2])); pendingLift = [];
  // všechny plné objekty přijímají i vrhají stíny (jinak by je slunce prosvítilo skrz strop)
  group.traverse(o => { if (o.isMesh && !o.material.isMeshBasicMaterial) { o.receiveShadow = true; o.castShadow = !o.userData.noCast; } }); // noCast: těleso svítidla nesmí stínit vlastní světlo
  // rozptýlené světlo od stěn (z půdorysného výpočtu)
  let amb = res ? res.ambCol : [5, 5, 5];
  { const rf = { dark: 0.03, normal: 0.08, white: 0.15 }[sc.walls || 'normal'] || 0.08, kb = Math.max(rf, 0.12) / rf; amb = amb.map(v => v * kb); } // světlý strop a podlaha odráží i v tmavé místnosti
  if (sc.outdoor) { const skd = S.SKY[sc.sky] || S.SKY.overcast, kc = kel(skd.cct); amb = [kc.color.r * skd.E * 2.2 * 0.5, kc.color.g * skd.E * 2.2 * 0.5, kc.color.b * skd.E * 2.2 * 0.5]; }
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
  floorRing.visible = !!it && (orbit || ctrlMode === 'object'); if (it) floorRing.position.set(it.x, 0.005, it.y); updCtrl(); dirty = true;
}
function toggleOrbit() { stopHQ(); orbit = !orbit; controls.enabled = orbit; if (camMesh) camMesh.visible = orbit; setSel(selId); dirty = true; return orbit; }
function isOrbit() { return orbit; }
// kamera prochází zdmi: zeď (a strop), za kterou kamera stojí, se v pohledu kamery nevykreslí
function camCull() {
  const sc = lastScene, c = camItem, on = !orbit && c; const W = sc.room.w, H = sc.room.h, Z = sc.room.z || 2.7, ch = c ? (c.h == null ? 1.5 : c.h) : 0, e = 0.03, PASS = WALL_T + 0.25;
  const outside = !!c && (c.x < 0 || c.x > W || c.y < 0 || c.y > H); // nad místností (záběr shora) plášť ani střecha nepřekáží
  const passing = side => !!c && (side === 'left' ? c.x < e && c.x > -PASS : side === 'right' ? c.x > W - e && c.x < W + PASS : side === 'top' ? c.y < e && c.y > -PASS : c.y > H - e && c.y < H + PASS);
  group.children.forEach(o => { const u = o.userData; if (!u) return;
    // zeď se schová jen ve chvíli, kdy jí kamera prochází (do PASS m za ní); stojí-li kamera dál venku, vidí vnější plášť (fasádu)
    if (u.side) o.visible = !(on && passing(u.side));
    else if (u.ext) o.visible = !!(on && outside && (u.ext === 'any' || !passing(u.ext)));
    else if (u.ceil) o.visible = !(on && ch > Z - 0.02);
    else if (u.seg) { let hide = false; if (on) { const q = u.seg, dx = q[2] - q[0], dy = q[3] - q[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((c.x - q[0]) * dx + (c.y - q[1]) * dy) / L2)); hide = Math.hypot(c.x - q[0] - dx * t, c.y - q[1] - dy * t) < 0.1; } o.visible = !hide; } });
}
// ---------- obraz kamery: vyvážení bílé (WB) + simulace hloubky ostrosti – post-process nad lineárním HDR snímkem ----------
// Snímek se vykreslí do HDR textury s hloubkou; shader rozostří podle fyzikálního kruhu neostrosti
// c = f²/N · |1/s − 1/z| / (1 − f/s)  (f ohnisko, N clona, s zaostřená vzdálenost, z vzdálenost bodu), pak WB (v lineárním světle) → ACES → sRGB.
const post = { rt: null, w: 0, h: 0, mat: null, scene: null, cam: null, rot: 0, info: null };
const DOF_NS = 64;
function postMat() {
  if (post.mat) return post.mat;
  post.mat = new THREE.ShaderMaterial({
    defines: { NS: DOF_NS },
    uniforms: { tColor: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2() }, wb: { value: new THREE.Vector3(1, 1, 1) }, near: { value: 0.05 }, far: { value: 60 }, dof: { value: 0 }, i1: { value: 0 }, kc: { value: 0 }, maxR: { value: 1 }, rot: { value: 0 }, cmax: { value: 1e4 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `#include <packing>
      uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 res; uniform vec3 wb; uniform float near, far, dof, i1, kc, maxR, rot, cmax; varying vec2 vUv;
      vec3 tex(vec2 uv) { vec3 c = texture2D(tColor, uv).rgb; return (c == c) ? min(c, vec3(cmax)) : vec3(cmax); } // strop jasu (a ochrana proti NaN) – nad ním je obraz beztak bílý
      float vz(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); }
      float coc(float z) { return min(maxR, kc * abs(i1 - 1.0 / z)); }
      void main() {
        vec3 col = tex(vUv);
        if (dof > 0.5) {
          float z0 = vz(vUv), r0 = coc(z0), R = max(r0, 0.25 * maxR);
          float w0 = 1.0 / max(r0 * r0, 1.0); vec3 acc = col * w0; float ws = w0;
          float a0 = rot + 6.2831853 * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          for (int k = 1; k < NS; k++) {
            float fk = float(k), rr = sqrt(fk / float(NS)) * R, an = a0 + fk * 2.39996323;
            vec2 uv = vUv + vec2(cos(an), sin(an)) * rr / res;
            float z = vz(uv), r = coc(z);
            if (z > z0) r = min(r, r0 * 2.0 + 0.5); // ostré popředí nepřebírá rozmazané pozadí
            float w = clamp(r - rr + 1.0, 0.0, 1.0) / max(r * r, 1.0);
            acc += tex(uv) * w; ws += w;
          }
          col = acc / ws;
        }
        gl_FragColor = vec4(col * wb, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false });
  post.scene = new THREE.Scene(); post.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post.mat); q.frustumCulled = false; post.scene.add(q);
  return post.mat;
}
// zisk WB: světlo o teplotě K vyjde neutrální (bílé); normováno na jas, aby se neměnila expozice
function wbGain(K) { const a = S.kelvinRGB(5600), b = S.kelvinRGB(K), g = [a[0] / b[0], a[1] / b[1], a[2] / b[2]], Y = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2]; return new THREE.Vector3(g[0] / Y, g[1] / Y, g[2] / Y); }
function headPos(p) { const r = rigs[p.id]; if (r) { const b = r.bones.head_07 || r.bones.head || r.bones.Head || r.bones.mixamorigHead || r.bones['mixamorig:Head'] || Object.values(r.bones).find(o => /head/i.test(o.name) && !/end|top/i.test(o.name)); if (b) return b.getWorldPosition(new THREE.Vector3()); } return new THREE.Vector3(p.x, S.faceZ(p), p.y); }
// zaostřená vzdálenost v m (Infinity = nekonečno); autofokus = hloubka hlavy postavy podél osy kamery
function focusDist(cam) {
  const sc = lastScene; if (cam.af != null && sc) { const p = sc.items.find(i => i.id === cam.af && i.kind === 'person'); if (p) { const fw = new THREE.Vector3(); camera.getWorldDirection(fw); return Math.max(0.3, headPos(p).sub(camera.position).dot(fw)); } }
  return cam.focus == null ? 3 : (cam.focus >= 999 ? Infinity : Math.max(0.3, cam.focus));
}
function wantsPost() { const c = camItem; return !!(c && !orbit && ((c.wb && c.wb !== 5600) || c.dof)); }
function renderPost(rg) { // rg = výřez v CSS px
  const pr = renderer.getPixelRatio(), w = Math.max(1, Math.round(rg.w * pr)), h = Math.max(1, Math.round(rg.h * pr)), c = camItem, m = postMat();
  if (!post.rt || post.w !== w || post.h !== h) { if (post.rt) { post.rt.depthTexture.dispose(); post.rt.dispose(); }
    post.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, samples: 4, depthTexture: new THREE.DepthTexture(w, h) }); post.w = w; post.h = h; }
  renderer.setRenderTarget(post.rt); renderer.render(scene3, camera); renderer.setRenderTarget(null);
  const u = m.uniforms; u.tColor.value = post.rt.texture; u.tDepth.value = post.rt.depthTexture; u.res.value.set(w, h); u.near.value = camera.near; u.far.value = camera.far; u.cmax.value = 24 / Math.max(1e-6, renderer.toneMappingExposure);
  u.wb.value = wbGain(c.wb || 5600); u.dof.value = c.dof ? 1 : 0; u.rot.value = hq.active ? Math.random() * 6.283 : 0;
  if (c.dof) { const f = (c.focal || 35) / 1000, N = c.fstop || 2.8, s = focusDist(c), i1 = isFinite(s) ? 1 / Math.max(s, f * 1.5) : 0, long = Math.max(w, h);
    u.i1.value = i1; u.kc.value = 0.5 * f * f / N / (1 - f * i1) * 1000 / 36 * long;
    u.maxR.value = Math.max(1, Math.min(0.025 * long, u.kc.value * Math.max(i1, 1 / 0.4 - i1)));
    post.info = { s, f, N }; } else post.info = null;
  renderer.render(post.scene, post.cam);
}
function render() { if (!renderer || !lastScene) return; camCull();
  const pr = renderer.getPixelRatio(), cw = canvas.width, ch = canvas.height;
  if (wantsPost()) { const lb = region && formatAspect() > 0, rg = lb ? region : { x: 0, y: 0, w: cw / pr, h: ch / pr };
    renderer.setScissorTest(false); renderer.setViewport(0, 0, cw / pr, ch / pr); renderer.setClearColor(0x000000, 1); renderer.clear();
    renderer.setViewport(rg.x, ch / pr - rg.y - rg.h, rg.w, rg.h); renderer.setScissor(rg.x, ch / pr - rg.y - rg.h, rg.w, rg.h); renderer.setScissorTest(true);
    renderPost(rg); renderer.setScissorTest(false); return; }
  if (orbit || !region || formatAspect() <= 0) { renderer.setScissorTest(false); renderer.setViewport(0, 0, cw / pr, ch / pr); renderer.render(scene3, orbit ? orbitCam : camera); return; }
  renderer.setScissorTest(false); renderer.setClearColor(0x000000, 1); renderer.clear();
  const bg = scene3.background; // letterbox: černé okolí, obloha jen uvnitř záběru
  renderer.setViewport(region.x, ch / pr - region.y - region.h, region.w, region.h); renderer.setScissor(region.x, ch / pr - region.y - region.h, region.w, region.h); renderer.setScissorTest(true);
  renderer.render(scene3, camera); renderer.setScissorTest(false); }
function shot() { if (!hq.done && !hq.active) render();
  const src = hq.done ? hq.result : canvas;
  const pr = renderer.getPixelRatio(), crop = (!orbit && region && formatAspect() > 0) ? { x: region.x * pr, y: region.y * pr, w: region.w * pr, h: region.h * pr } : { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const c = document.createElement('canvas'); c.width = crop.w; c.height = crop.h; const g = c.getContext('2d'); g.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  if (lastOpts.grain > 0 && grainCv.width) { g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.85; g.drawImage(grainCv, crop.x / pr / 2, crop.y / pr / 2, crop.w / pr / 2, crop.h / pr / 2, 0, 0, crop.w, crop.h); }
  return c.toDataURL('image/png'); }
function setCameraCallback(fn) { onCamera = fn; }
// ---------- chycení a posun objektu myší v 3D (kamera i volný pohled) ----------
let objDrag = null, onMove = null;
const pickRay = new THREE.Raycaster();
function rayAt(e) { const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, rg = (!orbit && region && formatAspect() > 0) ? region : { x: 0, y: 0, w: r.width, h: r.height };
  if (mx < rg.x || my < rg.y || mx > rg.x + rg.w || my > rg.y + rg.h) return null;
  pickRay.setFromCamera(new THREE.Vector2((mx - rg.x) / rg.w * 2 - 1, -((my - rg.y) / rg.h) * 2 + 1), orbit ? orbitCam : camera); return pickRay; }
function objDown(e) {
  if (!lastScene || pose.on || hq.active) return false; const rc = rayAt(e); if (!rc) return false;
  const cands = group.children.filter(o => o.userData.itemId != null && o.visible), hit = rc.intersectObjects(cands, true).find(h => h.object.visible && !(h.object.material && h.object.material.isMeshBasicMaterial && h.object.material.transparent)); if (!hit) return false;
  let top = hit.object; while (top.parent && top.parent !== group) top = top.parent; const id = top.userData.itemId, it = lastScene.items.find(i => i.id === id); if (!it) return false;
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y), p0 = rc.ray.intersectPlane(plane, new THREE.Vector3()); if (!p0) return false;
  objDrag = { id, it, plane, p0, x0: it.x, y0: it.y, objs: group.children.filter(o => o.userData.itemId === id).map(o => [o, o.position.clone()]), moved: false };
  if (onMove) onMove(id, it.x, it.y, 'start'); return true;
}
function objMove(e) {
  const rc = rayAt(e); if (!rc) return; const p = rc.ray.intersectPlane(objDrag.plane, new THREE.Vector3()); if (!p) return;
  let dx = p.x - objDrag.p0.x, dz = p.z - objDrag.p0.z; const L = Math.hypot(dx, dz); if (L > 6) { dx *= 6 / L; dz *= 6 / L; } // pojistka u vzdáleného obzoru
  objDrag.it.x = objDrag.x0 + dx; objDrag.it.y = objDrag.y0 + dz; objDrag.moved = true;
  objDrag.objs.forEach(([o, p0]) => o.position.set(p0.x + dx, p0.y, p0.z + dz)); if (objDrag.it.kind === 'person' || objDrag.it.kind === 'light') { floorRing.position.set(objDrag.it.x, 0.005, objDrag.it.y); }
  dirty = true; if (onMove) onMove(objDrag.id, objDrag.it.x, objDrag.it.y, 'move');
}
function objUp() { const d = objDrag; objDrag = null; if (onMove) onMove(d.id, d.it.x, d.it.y, d.moved ? 'end' : 'click'); }
function setMoveCallback(fn) { onMove = fn; }
function hasCamera() { return !!(lastScene && lastScene.items.some(i => i.kind === 'camera')); }

// ---------- HQ render: N průchodů s náhodným posunem světel a subpixelovým posunem kamery, průměr → vyhlazený snímek ----------
function renderHQ(opts) {
  if (!lastScene || orbit || !camItem) return false;
  stopHQ();
  hq.passes = (opts && opts.passes) || 24; hq.pass = 0; hq.onProgress = opts && opts.onProgress;
  hq.savedOpts = lastOpts; hq.acc = document.createElement('canvas'); hq.acc.width = canvas.width; hq.acc.height = canvas.height;
  hq.active = true; hq.done = false; return true;
}
function hqStep() {
  if (!hq.active) return;
  // jeden průchod: přestavět scénu s náhodnými posuny světel (ultra kvalita stínů), kamera posunutá o zlomek pixelu
  hq.building = true; sync(lastScene, lastRes, null, Object.assign({}, hq.savedOpts, { quality: 'high', shadows: true })); hq.building = false;
  const r = wrap.getBoundingClientRect(), ox = (Math.random() - 0.5), oy = (Math.random() - 0.5);
  const rg = (region && formatAspect() > 0) ? region : { x: 0, y: 0, w: r.width, h: r.height };
  camera.setViewOffset(rg.w, rg.h, ox, oy, rg.w, rg.h); render(); camera.clearViewOffset();
  const g = hq.acc.getContext('2d'); g.globalAlpha = 1 / (hq.pass + 1); g.drawImage(canvas, 0, 0); g.globalAlpha = 1;
  hq.pass++;
  if (hq.onProgress) hq.onProgress({ pass: hq.pass, passes: hq.passes });
  if (hq.pass >= hq.passes) {
    hq.active = false; hq.done = true;
    hq.result.width = hq.acc.width; hq.result.height = hq.acc.height; hq.result.getContext('2d').drawImage(hq.acc, 0, 0); hq.result.style.display = 'block'; hq.acc = null;
    hq.building = true; sync(lastScene, lastRes, null, hq.savedOpts); hq.building = false; // zpět na běžnou kvalitu (scéna se překreslí až při změně)
    if (hq.onProgress) hq.onProgress({ done: true });
  }
}
function stopHQ() { if (!hq.active && !hq.done) return; const was = hq.active; hq.active = false; hq.done = false; hq.acc = null; if (hq.result) hq.result.style.display = 'none'; if (was && hq.savedOpts) { hq.building = true; sync(lastScene, lastRes, null, hq.savedOpts); hq.building = false; } if (was && hq.onProgress) hq.onProgress({ stopped: true }); dirty = true; }
function hqState() { return { active: hq.active, done: hq.done, pass: hq.pass, passes: hq.passes }; }

// ---------- editor pózy: kostra přes pohled kamery, tažení kloubů (kloub → otočí nadřazenou kost) ----------
// [kloub (handle), kost která se otáčí, popisek]
const POSE_HANDLES = [
  ['head_07', 'neck_06', 'hlava'], ['neck_06', 'spine_03_05', 'hrudník'], ['spine_02_04', 'hip_02', 'pánev'],
  ['lowerarm_l_025', 'upperarm_l_024', 'loket L'], ['hand_l_026', 'lowerarm_l_025', 'ruka L'], ['middle_01_l_035', 'hand_l_026', 'dlaň L'],
  ['lowerarm_r_050', 'upperarm_r_049', 'loket P'], ['hand_r_051', 'lowerarm_r_050', 'ruka P'], ['middle_01_r_060', 'hand_r_051', 'dlaň P'],
  ['lowerleg_l_075', 'upperleg_l_074', 'koleno L'], ['foot_l_076', 'lowerleg_l_075', 'noha L'], ['ball_l_077', 'foot_l_076', 'špička L'],
  ['lowerleg_r_082', 'upperleg_r_081', 'koleno P'], ['foot_r_083', 'lowerleg_r_082', 'noha P'], ['ball_r_084', 'foot_r_083', 'špička P']];
const POSE_LINKS = [['hip_02', 'spine_03_05'], ['spine_03_05', 'neck_06'], ['neck_06', 'head_07'], ['spine_03_05', 'upperarm_l_024'], ['upperarm_l_024', 'lowerarm_l_025'], ['lowerarm_l_025', 'hand_l_026'], ['spine_03_05', 'upperarm_r_049'], ['upperarm_r_049', 'lowerarm_r_050'], ['lowerarm_r_050', 'hand_r_051'], ['hip_02', 'upperleg_l_074'], ['upperleg_l_074', 'lowerleg_l_075'], ['lowerleg_l_075', 'foot_l_076'], ['foot_l_076', 'ball_l_077'], ['hip_02', 'upperleg_r_081'], ['upperleg_r_081', 'lowerleg_r_082'], ['lowerleg_r_082', 'foot_r_083'], ['foot_r_083', 'ball_r_084']];
function activeCam() { return orbit ? orbitCam : camera; }
function toScreen(v) { const r = wrap.getBoundingClientRect(), p = v.clone().project(activeCam()); return { x: (p.x + 1) / 2 * r.width, y: (1 - p.y) / 2 * r.height, z: p.z, behind: p.z > 1 }; }
function setPose(on, personId) { pose.on = !!on; pose.id = personId; pose.drag = null; if (pose.cv) pose.cv.style.display = pose.on ? 'block' : 'none'; drawPose(); }
function poseRig() { return pose.on && pose.id != null ? rigs[pose.id] : null; }
function drawPose() {
  if (!pose.cv || !pose.on) return; const g = pose.ctx, r = wrap.getBoundingClientRect(); g.clearRect(0, 0, r.width, r.height);
  const rig = poseRig(); if (!rig) return; rig.inst.updateMatrixWorld(true);
  const P = n => rig.bones[n] ? toScreen(rig.bones[n].getWorldPosition(new THREE.Vector3())) : null;
  g.lineWidth = 2; g.strokeStyle = 'rgba(212,176,113,.85)';
  POSE_LINKS.forEach(([a, b]) => { const pa = P(a), pb = P(b); if (!pa || !pb || pa.behind || pb.behind) return; g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke(); });
  pose.handles = [];
  POSE_HANDLES.forEach(([j, bone, label]) => { const pj = P(j); if (!pj || pj.behind || !rig.bones[bone]) return; pose.handles.push({ x: pj.x, y: pj.y, joint: j, bone: bone, label: label });
    const cur = pose.drag && pose.drag.joint === j; g.beginPath(); g.arc(pj.x, pj.y, cur ? 9 : 7, 0, 7); g.fillStyle = cur ? '#fff' : '#d4b071'; g.fill(); g.strokeStyle = '#111'; g.lineWidth = 1.5; g.stroke(); });
  if (pose.hover) { const h = pose.hover; g.fillStyle = '#ece8e0'; g.font = '12px Inter,Lato,sans-serif'; g.fillText(h.label, h.x + 11, h.y - 8); }
}
function poseHit(e) { const rig = poseRig(); if (!rig) return null; const r = wrap.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top; let best = null; pose.handles.forEach(h => { const d = Math.hypot(h.x - mx, h.y - my); if (d < 12 && (!best || d < best.d)) best = Object.assign({ d: d }, h); }); return best; }
function poseDown(e) { const h = poseHit(e); if (!h) return false; const rig = poseRig(), joint = rig.bones[h.joint]; const jw = joint.getWorldPosition(new THREE.Vector3()); pose.drag = { joint: h.joint, bone: h.bone, depth: toScreen(jw).z }; drawPose(); return true; }
function poseMove(e) {
  const rig = poseRig(); if (!rig || !pose.drag) return; const d = pose.drag, bone = rig.bones[d.bone], joint = rig.bones[d.joint];
  const r = wrap.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width * 2 - 1, ny = 1 - (e.clientY - r.top) / r.height * 2;
  const target = new THREE.Vector3(nx, ny, d.depth).unproject(activeCam());
  const bp = bone.getWorldPosition(new THREE.Vector3()), jp = joint.getWorldPosition(new THREE.Vector3());
  const d0 = jp.sub(bp).normalize(), d1 = target.sub(bp).normalize(); if (d0.lengthSq() < 1e-6 || d1.lengthSq() < 1e-6) return;
  const delta = new THREE.Quaternion().setFromUnitVectors(d0, d1), bw = bone.getWorldQuaternion(new THREE.Quaternion()), pw = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(pw.invert().multiply(delta.multiply(bw))); rig.inst.updateMatrixWorld(true);
  const rec = new THREE.Quaternion().copy(bone.quaternion); if (pose.onChange) pose.onChange(pose.id, d.bone, [rec.x, rec.y, rec.z, rec.w], false);
  dirty = true; pose.hover = null; drawPose();
}
function poseUp() { const d = pose.drag; pose.drag = null; if (d && pose.onChange) { const rig = poseRig(); if (rig) { const q = rig.bones[d.bone].quaternion; pose.onChange(pose.id, d.bone, [q.x, q.y, q.z, q.w], true); } } drawPose(); }
function poseHoverAt(e) { const h = poseHit(e); pose.hover = h; drawPose(); return !!h; }
function setPoseCallback(fn) { pose.onChange = fn; }

window.View3D = { envPlan, setMoveCallback, setKey: (k, on) => { if (on) keys[k] = true; else delete keys[k]; }, setCtrlMode, ctrlMode: () => ctrlMode, onCtrlMode: fn => { onCtrlMode = fn; }, resetOrbit: () => { orbitInit = false; }, init, resize, sync, renderHQ, stopHQ, hqState, setPose, poseHoverAt, setPoseCallback, poseOn: () => pose.on, poseHandles: () => pose.handles, headY: id => { const r = rigs[id]; if (!r || !r.bones.head_07) return null; return r.bones.head_07.getWorldPosition(new THREE.Vector3()).y; }, region: () => region, setSel, toggleOrbit, isOrbit, render, shot, hasCamera, wantsKeys, setCameraCallback, applyCamera: () => { applyCamera(); dirty = true; }, refresh: () => { stopHQ(); applyCamera(); dirty = true; }, focusInfo: () => (camItem && camItem.dof && !orbit) ? { s: focusDist(camItem) } : null, _dbg: () => ({ scene3, renderer, group, camera, orbitCam, controls }) };
window.dispatchEvent(new Event('view3d-ready'));
})();
