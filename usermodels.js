/* Viewfinder Light – vlastní 3D modely uživatele (import z disku).
   Formáty: GLB, glTF (i s .bin a texturami), FBX, OBJ (+ MTL a textury). Soubory se uloží v prohlížeči
   (IndexedDB „viewfinder-models“), scéna si pamatuje jen id modelu. FBX/OBJ načítá vendor/import-bundle.js,
   který se stáhne až při prvním takovém importu. */
(function () {
  'use strict';
  const L = window.THREE_LIB, THREE = L.THREE;
  const MODEL_EXT = ['glb', 'gltf', 'fbx', 'obj'], MAX_MB = 80;
  const ext = n => (n.split('.').pop() || '').toLowerCase(), base = n => decodeURIComponent(String(n)).split(/[\\/]/).pop().toLowerCase();
  const assetUrl = p => { const V = window.SVH_VIEWFINDER; return (V && V.asset) ? V.asset.replace('__FILE__', V.assetPath ? encodeURI(p) : encodeURIComponent(p)) : p; };

  // ---------- úložiště ----------
  let dbP = null;
  function db() {
    if (!dbP) dbP = new Promise((res, rej) => { const rq = indexedDB.open('viewfinder-models', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('models', { keyPath: 'id' }); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    return dbP;
  }
  const tx = (mode, fn) => db().then(d => new Promise((res, rej) => { const t = d.transaction('models', mode), st = t.objectStore('models'), r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }));
  const metas = {}; let ready = null; // id → { id, name, dims, tris, thumb }
  function init() { if (!ready) ready = tx('readonly', st => st.getAll()).then(all => { (all || []).forEach(r => { metas[r.id] = meta(r); }); return list(); }).catch(() => []); return ready; }
  const meta = r => ({ id: r.id, name: r.name, dims: r.dims, tris: r.tris, thumb: r.thumb, created: r.created });
  function list() { return Object.values(metas).sort((a, b) => (b.created || 0) - (a.created || 0)); }

  // ---------- načtení souborů → THREE.Group ----------
  let impLib = null;
  function importLib() {
    if (window.IMPORT_LIB) return Promise.resolve(window.IMPORT_LIB);
    if (!impLib) impLib = new Promise((res, rej) => { const s = document.createElement('script'); s.src = assetUrl('vendor/import-bundle.js'); s.onload = () => window.IMPORT_LIB ? res(window.IMPORT_LIB) : rej(new Error('knihovna FBX/OBJ se nenačetla')); s.onerror = () => { impLib = null; rej(new Error('knihovna FBX/OBJ se nestáhla')); }; document.head.appendChild(s); });
    return impLib;
  }
  // files: [{ name, blob }] – hlavní soubor + doprovodné (bin, textury, mtl); doprovodné se hledají podle jména souboru
  async function parse(files) {
    const main = files.find(f => MODEL_EXT.indexOf(ext(f.name)) >= 0); if (!main) throw new Error('Mezi soubory není model (GLB, glTF, FBX nebo OBJ).');
    const urls = {}; files.forEach(f => { urls[base(f.name)] = URL.createObjectURL(f.blob); });
    const mgr = new THREE.LoadingManager(); const missing = [];
    mgr.setURLModifier(u => { if (/^(blob|data):/.test(u)) return u; const b = base(u.split('?')[0]); if (urls[b]) return urls[b]; missing.push(b); return u; });
    const e = ext(main.name); let root;
    try {
      if (e === 'glb' || e === 'gltf') {
        const data = e === 'glb' ? await main.blob.arrayBuffer() : await main.blob.text();
        root = (await new Promise((res, rej) => new L.GLTFLoader(mgr).parse(data, '', res, rej))).scene;
      } else if (e === 'fbx') {
        const lib = await importLib(); root = new lib.FBXLoader(mgr).parse(await main.blob.arrayBuffer(), '');
      } else {
        const lib = await importLib(), ol = new lib.OBJLoader(mgr), mtl = files.find(f => ext(f.name) === 'mtl');
        if (mtl) { const m = new lib.MTLLoader(mgr).parse(await mtl.blob.text(), ''); m.preload(); ol.setMaterials(m); }
        root = ol.parse(await main.blob.text());
      }
      await new Promise(r => { let n = 0; const t = setInterval(() => { n++; if (!mgr.itemsLoaded || mgr.itemsLoaded >= mgr.itemsTotal || n > 40) { clearInterval(t); r(); } }, 100); }); // textury
    } finally { setTimeout(() => Object.values(urls).forEach(u => URL.revokeObjectURL(u)), 15000); }
    return { root: normalize(root), missing: [...new Set(missing)] };
  }
  // statický model: skinned mesh → obyčejná síť v aktuální póze, materiály → MeshStandardMaterial, bez světel a kamer
  function normalize(root) {
    root.updateMatrixWorld(true); const out = new THREE.Group(), v = new THREE.Vector3(); let tris = 0;
    const std = m => { if (!m || m.isMeshStandardMaterial) return m; const s = new THREE.MeshStandardMaterial({ name: m.name, color: m.color ? m.color.clone() : 0xcccccc, map: m.map || null, normalMap: m.normalMap || null, alphaMap: m.alphaMap || null, emissive: m.emissive ? m.emissive.clone() : 0x000000, emissiveMap: m.emissiveMap || null, transparent: !!m.transparent, opacity: m.opacity == null ? 1 : m.opacity, alphaTest: m.alphaTest || 0, side: m.side, roughness: 0.8, metalness: 0, vertexColors: !!m.vertexColors }); if (s.map) s.map.colorSpace = THREE.SRGBColorSpace; if (s.emissiveMap) s.emissiveMap.colorSpace = THREE.SRGBColorSpace; return s; };
    root.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.visible) return;
      let g = o.geometry.clone();
      if (o.isSkinnedMesh || (o.morphTargetInfluences && o.morphTargetInfluences.length)) { const p = g.attributes.position, a = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { o.getVertexPosition(i, v); a[i * 3] = v.x; a[i * 3 + 1] = v.y; a[i * 3 + 2] = v.z; } g.setAttribute('position', new THREE.BufferAttribute(a, 3)); ['skinIndex', 'skinWeight'].forEach(k => g.deleteAttribute(k)); g.morphAttributes = {}; g.computeVertexNormals(); }
      g.applyMatrix4(o.matrixWorld); if (!g.attributes.normal) g.computeVertexNormals();
      const mat = Array.isArray(o.material) ? o.material.map(std) : std(o.material), m = new THREE.Mesh(g, mat); m.name = o.name; out.add(m);
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    });
    out.userData.tris = Math.round(tris); return out;
  }
  // rozměry v metrech; jednotky odhadem: přes 30 m → centimetry, přes 3 km → milimetry (uživatel pak doladí měřítkem)
  function measure(root) { const bb = new THREE.Box3().setFromObject(root), s = bb.getSize(new THREE.Vector3()), mx = Math.max(s.x, s.y, s.z); const k = mx > 3000 ? 0.001 : mx > 30 ? 0.01 : 1; return { w: +(s.x * k).toFixed(3), h: +(s.y * k).toFixed(3), d: +(s.z * k).toFixed(3), unit: k }; }
  function thumb(root) {
    let r; try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return null; }
    try { r.setSize(128, 128, false); r.outputColorSpace = THREE.SRGBColorSpace; const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x707070, 2.4)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(3, 5, 2); sc.add(dl); sc.add(root);
      const bb = new THREE.Box3().setFromObject(root), c = bb.getCenter(new THREE.Vector3()), rad = bb.getSize(new THREE.Vector3()).length() / 2 || 1, cam = new THREE.PerspectiveCamera(30, 1, rad / 100, rad * 100);
      cam.position.copy(c).add(new THREE.Vector3(0.75, 0.55, 1).normalize().multiplyScalar(rad / Math.sin(15 * Math.PI / 180))); cam.lookAt(c); r.render(sc, cam); sc.remove(root);
      return r.domElement.toDataURL('image/png'); } finally { r.dispose(); r.forceContextLoss && r.forceContextLoss(); }
  }

  // ---------- import z disku ----------
  async function importFiles(fileList) {
    const files = Array.from(fileList || []).map(f => ({ name: f.name, blob: f }));
    const total = files.reduce((s, f) => s + f.blob.size, 0); if (total > MAX_MB * 1048576) throw new Error('Soubory mají ' + (total / 1048576).toFixed(0) + ' MB – víc než ' + MAX_MB + ' MB se do prohlížeče neuloží.');
    const { root, missing } = await parse(files), dims = measure(root);
    if (!(dims.w > 0 || dims.h > 0)) throw new Error('Model je prázdný (žádné sítě).');
    const main = files.find(f => MODEL_EXT.indexOf(ext(f.name)) >= 0), id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const rec = { id, name: main.name.replace(/\.[^.]+$/, ''), files, dims, tris: root.userData.tris, thumb: thumb(root.clone()), created: Date.now() };
    await tx('readwrite', st => st.put(rec)); metas[id] = meta(rec); cache[id] = { scene: scaled(root, dims.unit) };
    return { meta: metas[id], missing };
  }
  function scaled(root, k) { const g = new THREE.Group(); root.scale.setScalar(k || 1); g.add(root); return g; }
  async function remove(id) { await tx('readwrite', st => st.delete(id)); delete metas[id]; delete cache[id]; }

  // ---------- pro 3D pohled: model podle id (načte se na pozadí, pak událost view3d-model) ----------
  const cache = {}; // id → { scene } | { loading } | { error }
  function get(id) {
    const c = cache[id]; if (c && c.scene) return c; if (c) return null;
    cache[id] = { loading: true };
    init().then(() => tx('readonly', st => st.get(id))).then(rec => { if (!rec) throw new Error('model není v tomto prohlížeči');
      return parse(rec.files).then(({ root }) => { cache[id] = { scene: scaled(root, rec.dims.unit) }; window.dispatchEvent(new Event('view3d-model')); }); })
      .catch(e => { cache[id] = { error: String(e && e.message || e) }; window.dispatchEvent(new Event('view3d-model')); });
    return null;
  }
  const missing = id => !!(cache[id] && cache[id].error);

  window.UserModels = { init, list, importFiles, remove, get, missing, meta: id => metas[id] || null, EXT: MODEL_EXT };
})();
