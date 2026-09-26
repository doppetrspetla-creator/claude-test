/* LightLab – simulační jádro (půdorys, 1 jednotka = 1 m; osvětlenost se počítá ve výšce obličeje 1,5 m) */
(function (root) {
  'use strict';
  var FACE_Z = 1.5;

  // lux1m = osvětlenost v ose na 1 m při 100 % (orientačně), beam = celý úhel (°), size = šířka zdroje (m)
  var MODS = {
    reflector: { name: 'Reflektor 55°', beam: 55, size: 0.18, mult: 1.0, soft: false },
    fresnel:   { name: 'Fresnel (spot–flood)', beam: 30, size: 0.15, mult: 1.9, soft: false, zoom: true },
    bare:      { name: 'Holá hlava 110°', beam: 110, size: 0.06, mult: 0.35, soft: false },
    softbox60: { name: 'Softbox 60 cm', beam: 120, size: 0.60, mult: 0.30, soft: true },
    softbox90: { name: 'Softbox 90 cm', beam: 120, size: 0.90, mult: 0.26, soft: true },
    octa120:   { name: 'Oktabox 120 cm', beam: 120, size: 1.20, mult: 0.22, soft: true },
    lantern:   { name: 'Lampion 65 cm', beam: 300, size: 0.65, mult: 0.12, soft: true },
    umbrella:  { name: 'Deštník odrazný 105 cm', beam: 140, size: 1.05, mult: 0.16, soft: true },
    frame:     { name: 'Difuzní rám 1,2 m (Full)', beam: 140, size: 1.20, mult: 0.30, soft: true },
    tube:      { name: 'Tuba 1,2 m (světlo)', beam: 340, size: 1.20, mult: 1.0, soft: true },
    practical: { name: 'Praktikál (lampa)', beam: 340, size: 0.12, mult: 1.0, soft: true }
  };
  var FIXTURES = {
    cob100: { name: 'COB 100 W', lux1m: 4200, cct: 5600, defMod: 'reflector' },
    cob300: { name: 'COB 300 W', lux1m: 12000, cct: 5600, defMod: 'reflector' },
    cob600: { name: 'COB 600 W', lux1m: 24000, cct: 5600, defMod: 'reflector' },
    tube:   { name: 'LED tuba', lux1m: 380, cct: 3200, defMod: 'tube' },
    lamp:   { name: 'Praktikál 40 W', lux1m: 90, cct: 2700, defMod: 'practical' }
  };
  var SKY = { overcast: { E: 1800, cct: 6500 }, sunny: { E: 5000, cct: 5600 }, dusk: { E: 300, cct: 7500 } };

  function kelvinRGB(k) {
    var t = k / 100, r, g, b;
    if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
    else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
    if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    function c(v) { return Math.max(0, Math.min(255, v)) / 255; }
    return [c(r), c(g), c(b)];
  }
  var REF = kelvinRGB(5600);
  function cctColor(k) { var c = kelvinRGB(k); return [c[0] / REF[0], c[1] / REF[1], c[2] / REF[2]]; }

  function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
    var rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
    var den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return false;
    var qx = cx - ax, qy = cy - ay;
    var t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
    return t > 1e-4 && t < 1 - 1e-4 && u >= 0 && u <= 1;
  }
  function circHit(ax, ay, bx, by, cx, cy, r) {
    var dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy;
    var a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
    if (c < 0) return false;
    var disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    disc = Math.sqrt(disc);
    var t1 = (-b - disc) / (2 * a);
    return t1 > 1e-4 && t1 < 1 - 1e-4;
  }

  function buildOccluders(scene) {
    var segs = [], circs = [];
    var W = scene.room.w, H = scene.room.h, win = scene.window;
    function wall(x1, y1, x2, y2, side) {
      if (win && win.on && win.wall === side) {
        if (side === 'left' || side === 'right') { segs.push([x1, y1, x2, Math.min(y2, win.from)]); segs.push([x1, Math.max(y1, win.to), x2, y2]); }
        else { segs.push([x1, y1, Math.min(x2, win.from), y2]); segs.push([Math.max(x1, win.to), y1, x2, y2]); }
      } else segs.push([x1, y1, x2, y2]);
    }
    wall(0, 0, W, 0, 'top'); wall(0, H, W, H, 'bottom'); wall(0, 0, 0, H, 'left'); wall(W, 0, W, H, 'right');
    scene.items.forEach(function (it) {
      if (it.kind === 'person') circs.push([it.x, it.y, 0.11]);
      if (it.kind === 'flag' || it.kind === 'bounce') {
        var h = it.len / 2, c = Math.cos(it.rot), s = Math.sin(it.rot);
        segs.push([it.x - c * h, it.y - s * h, it.x + c * h, it.y + s * h]);
      }
      if (it.kind === 'box' && it.tall) {
        var w2 = it.w / 2, d2 = it.d / 2;
        segs.push([it.x - w2, it.y - d2, it.x + w2, it.y - d2], [it.x + w2, it.y - d2, it.x + w2, it.y + d2],
                  [it.x + w2, it.y + d2, it.x - w2, it.y + d2], [it.x - w2, it.y + d2, it.x - w2, it.y - d2]);
      }
    });
    return { segs: segs, circs: circs };
  }
  function visible(occ, ax, ay, bx, by) {
    var S = occ.segs, i, C = occ.circs, j;
    for (i = 0; i < S.length; i++) { var s = S[i]; if (segHit(ax, ay, bx, by, s[0], s[1], s[2], s[3])) return false; }
    for (j = 0; j < C.length; j++) { var c = C[j]; if (circHit(ax, ay, bx, by, c[0], c[1], c[2])) return false; }
    return true;
  }

  // efektivní parametry světla (sdílené s 3D pohledem)
  function lightParams(L) {
    var fx = FIXTURES[L.fixture] || FIXTURES.cob300, m = MODS[L.mod] || MODS.reflector;
    var beam = m.zoom ? (L.zoom || 30) : m.beam;
    if (L.grid && m.soft) beam = Math.min(beam, 50);
    var mult = m.mult;
    if (m.zoom) mult = mult * Math.pow(30 / beam, 1.6);
    if (L.grid && m.soft) mult *= 0.75;
    var cct = L.cct || fx.cct;
    if (L.gel === 'cto') { cct = cct * 3200 / 5600; mult *= 0.55; }
    if (L.gel === 'ctb') { cct = Math.min(9000, cct * 5600 / 3200); mult *= 0.4; }
    if (L.diff) mult *= 0.6;
    var size = m.size + (L.diff && !m.soft ? 0.25 : 0);
    return { fx: fx, mod: m, beam: beam, mult: mult, cct: cct, size: size, E1: fx.lux1m * mult * ((L.power == null ? 70 : L.power) / 100), soft: m.soft, omni: beam >= 300, h: L.h == null ? 1.7 : L.h };
  }

  function lightEmitter(L) {
    var P = lightParams(L), beam = P.beam, m = P.mod;
    var nx = Math.cos(L.rot), ny = Math.sin(L.rot);
    var half = beam / 2 * Math.PI / 180;
    var exp = half >= Math.PI / 2 ? (half > 2.5 ? 0 : 1) : Math.log(0.5) / Math.log(Math.cos(half));
    var n = P.size < 0.2 ? 1 : Math.min(9, Math.max(3, Math.round(P.size / 0.15)));
    var pts = [], tx = -ny, ty = nx;
    for (var i = 0; i < n; i++) { var o = n === 1 ? 0 : (i / (n - 1) - 0.5) * P.size; pts.push([L.x + tx * o + nx * 0.02, L.y + ty * o + ny * 0.02]); }
    return { pts: pts, nx: nx, ny: ny, z: P.h, E1: P.E1, exp: exp,
             cosCut: m.soft ? (beam >= 300 ? -2 : 0.0) : Math.cos(Math.min(Math.PI * 0.97, half * 1.5)), col: cctColor(P.cct), hard: !m.soft,
             barn: L.barn ? Math.cos(half * 1.02) : null, omni: P.omni, id: L.id };
  }
  function windowEmitter(scene) {
    var w = scene.window; if (!w || !w.on) return null;
    var pts = [], n = 16, nx, ny;
    for (var i = 0; i < n; i++) {
      var t = w.from + (i + 0.5) / n * (w.to - w.from);
      if (w.wall === 'left') { pts.push([-0.01, t]); nx = 1; ny = 0; }
      else if (w.wall === 'right') { pts.push([scene.room.w + 0.01, t]); nx = -1; ny = 0; }
      else if (w.wall === 'top') { pts.push([t, -0.01]); nx = 0; ny = 1; }
      else { pts.push([t, scene.room.h + 0.01]); nx = 0; ny = -1; }
    }
    var sk = SKY[w.sky] || SKY.overcast;
    return { pts: pts, nx: nx, ny: ny, z: FACE_Z, E1: sk.E * (w.to - w.from) / 1.2, exp: 1, cosCut: 0.02, col: cctColor(sk.cct), hard: false, omni: false, win: true };
  }

  function illum(em, occ, x, y, snx, sny) {
    var sum = 0, n = em.pts.length, per = em.E1 / n, dz = (em.z == null ? FACE_Z : em.z) - FACE_Z, dz2 = dz * dz;
    for (var i = 0; i < n; i++) {
      var p = em.pts[i], dx = x - p[0], dy = y - p[1], d2 = dx * dx + dy * dy;
      if (d2 < 0.0025) d2 = 0.0025;
      var d = Math.sqrt(d2), cs = em.omni ? 1 : (dx * em.nx + dy * em.ny) / d;
      if (cs <= em.cosCut) continue;
      if (em.barn !== null && em.barn !== undefined && cs < em.barn) continue;
      var f = em.omni ? 1 : (em.exp === 0 ? 1 : Math.pow(Math.max(cs, 0), em.exp));
      var lam = 1;
      if (snx !== undefined) { lam = -(dx * snx + dy * sny) / d; if (lam <= 0) continue; }
      if (!visible(occ, p[0], p[1], x, y)) continue;
      var d3 = d2 + dz2;
      sum += per * f * lam / d3 * (d / Math.sqrt(d3));
    }
    return sum;
  }

  function emitters(scene, occ) {
    var ems = [];
    scene.items.forEach(function (it) { if (it.kind === 'light' && it.on !== false) ems.push(lightEmitter(it)); });
    var we = windowEmitter(scene); if (we) ems.push(we);
    scene.items.forEach(function (it) {
      if (it.kind !== 'bounce') return;
      var nx = Math.cos(it.rot + Math.PI / 2), ny = Math.sin(it.rot + Math.PI / 2);
      if (it.flip) { nx = -nx; ny = -ny; }
      var cx = it.x + nx * 0.03, cy = it.y + ny * 0.03, col = [0, 0, 0], Etot = 0;
      ems.forEach(function (em) {
        if (em.bounce) return;
        var p = em.pts[Math.floor(em.pts.length / 2)];
        if ((p[0] - it.x) * nx + (p[1] - it.y) * ny <= 0) return;
        var e = illum(em, occ, cx, cy); Etot += e;
        col[0] += e * em.col[0]; col[1] += e * em.col[1]; col[2] += e * em.col[2];
      });
      if (Etot < 0.5) return;
      var refl = it.black ? 0.03 : (it.silver ? 0.55 : 0.75);
      var pts = [], n = 7, tx = Math.cos(it.rot), ty = Math.sin(it.rot);
      for (var i = 0; i < n; i++) { var o = (i / (n - 1) - 0.5) * it.len; pts.push([cx + tx * o, cy + ty * o]); }
      ems.push({ pts: pts, nx: nx, ny: ny, z: FACE_Z, E1: Etot * refl * it.len / Math.PI, exp: 1, cosCut: 0.02,
                 col: [col[0] / Etot, col[1] / Etot, col[2] / Etot], hard: false, omni: false, bounce: true, id: it.id });
    });
    return ems;
  }

  function compute(scene, cell) {
    var occ = buildOccluders(scene), ems = emitters(scene, occ);
    var W = scene.room.w, H = scene.room.h, nx = Math.ceil(W / cell), ny = Math.ceil(H / cell);
    var R = new Float32Array(nx * ny), G = new Float32Array(nx * ny), B = new Float32Array(nx * ny);
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
      var x = (i + 0.5) * cell, y = (j + 0.5) * cell, k = j * nx + i, r = 0, g = 0, b = 0;
      for (var e = 0; e < ems.length; e++) {
        var v = illum(ems[e], occ, x, y); if (v <= 0) continue;
        r += v * ems[e].col[0]; g += v * ems[e].col[1]; b += v * ems[e].col[2];
      }
      R[k] = r; G[k] = g; B[k] = b;
    }
    var refl = { dark: 0.03, normal: 0.08, white: 0.15 }[scene.walls || 'normal'] || 0.08;
    var n = nx * ny, mr = 0, mg = 0, mb = 0;
    for (var q = 0; q < n; q++) { mr += R[q]; mg += G[q]; mb += B[q]; }
    var amb = [mr / n * refl, mg / n * refl, mb / n * refl];
    for (var q2 = 0; q2 < n; q2++) { R[q2] += amb[0]; G[q2] += amb[1]; B[q2] += amb[2]; }
    return { nx: nx, ny: ny, cell: cell, R: R, G: G, B: B, ems: ems, occ: occ, amb: (amb[0] + amb[1] + amb[2]) / 3, ambCol: amb };
  }

  // měření na postavě: světlá a stinná strana obličeje (vždy vzhledem k natočení postavy)
  function measure(scene, res) {
    var person = scene.items.find(function (i) { return i.kind === 'person'; });
    if (!person) return null;
    var r = 0.125, out = [], base = person.rot;
    [0.75, -0.75].forEach(function (off) {
      var a = base + off, nx = Math.cos(a), ny = Math.sin(a);
      var x = person.x + nx * r, y = person.y + ny * r, E = (res.amb || 0) * 0.5, per = {};
      res.ems.forEach(function (em) { var v = illum(em, res.occ, x, y, nx, ny); E += v; if (em.id != null) per[em.id] = (per[em.id] || 0) + v; if (em.win) per.win = (per.win || 0) + v; });
      out.push({ x: x, y: y, E: E, per: per });
    });
    var a = out[0].E, b = out[1].E, hi = Math.max(a, b), lo = Math.max(Math.min(a, b), 0.01);
    var bright = a >= b ? out[0] : out[1], dark = a >= b ? out[1] : out[0];
    return { sides: out, lux: hi, lo: lo, ratio: hi / lo, stops: Math.log(hi / lo) / Math.LN2, per: bright.per, perDark: dark.per };
  }

  var API = { MODS: MODS, FIXTURES: FIXTURES, SKY: SKY, FACE_Z: FACE_Z, compute: compute, measure: measure, cctColor: cctColor, kelvinRGB: kelvinRGB, lightEmitter: lightEmitter, lightParams: lightParams };
  if (typeof module !== 'undefined') module.exports = API; else root.LightSim = API;
})(this);
