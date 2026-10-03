/* Viewfinder Light – simulační jádro (půdorys, 1 jednotka = 1 m; osvětlenost se počítá ve výšce obličeje 1,5 m) */
(function (root) {
  'use strict';
  var FACE_Z = 1.5;

  // lux1m = osvětlenost v ose na 1 m při 100 % (orientačně), beam = celý úhel (°), size = šířka zdroje (m)
  var MODS = {
    reflector: { name: 'Reflektor 55°', beam: 55, size: 0.18, mult: 1.0, soft: false },
    fresnel:   { name: 'Fresnel (spot–flood)', beam: 30, size: 0.15, mult: 1.9, soft: false, zoom: true },
    bare:      { name: 'Holá hlava 110°', beam: 110, size: 0.06, mult: 0.35, soft: false },
    softbox45: { name: 'Softbox 45 cm', beam: 120, size: 0.45, mult: 0.32, soft: true },
    softbox60: { name: 'Softbox 60 cm', beam: 120, size: 0.60, mult: 0.30, soft: true },
    softbox90: { name: 'Softbox 90 cm', beam: 120, size: 0.90, mult: 0.26, soft: true },
    softbox150: { name: 'Softbox 150 cm', beam: 120, size: 1.50, mult: 0.20, soft: true },
    octa120:   { name: 'Oktabox 120 cm', beam: 120, size: 1.20, mult: 0.22, soft: true },
    lantern:   { name: 'Lampion 65 cm', beam: 300, size: 0.65, mult: 0.12, soft: true },
    umbrella:  { name: 'Deštník odrazný 105 cm', beam: 140, size: 1.05, mult: 0.16, soft: true },
    frame:     { name: 'Difuzní rám 1,2 m (Full)', beam: 140, size: 1.20, mult: 0.30, soft: true },
    tube:      { name: 'Tuba 1,2 m (světlo)', beam: 340, size: 1.20, mult: 1.0, soft: true },
    practical: { name: 'Praktikál (lampa)', beam: 340, size: 0.12, mult: 1.0, soft: true },
    panel:     { name: 'Plocha LED panelu (bez modifikátoru)', beam: 60, size: 0.30, mult: 1.0, soft: true, panel: true },
    // stropní svítidla (svítí dolů, náklon −90°)
    ceilpanel: { name: 'Stropní svítidlo – difuzor', beam: 150, size: 0.36, mult: 1.0, soft: true, ceil: true },
    ceiltube:  { name: 'Zářivková trubice (holá)', beam: 340, size: 1.20, mult: 1.0, soft: true, ceil: true },
    ceilfluo:  { name: 'Zářivky s reflektorem', beam: 120, size: 1.25, mult: 1.0, soft: true, ceil: true }
  };
  var FIXTURES = {
    cob100: { name: 'COB 100 W', lux1m: 4200, cct: 5600, defMod: 'reflector' },
    cob300: { name: 'COB 300 W', lux1m: 12000, cct: 5600, defMod: 'reflector' },
    cob600: { name: 'COB 600 W', lux1m: 24000, cct: 5600, defMod: 'reflector' },
    panel1: { name: 'LED panel 30×30 cm', lux1m: 1500, cct: 5600, defMod: 'panel', pw: 0.30, ph: 0.30 },
    panel2: { name: 'LED panel 60×30 cm', lux1m: 2800, cct: 5600, defMod: 'panel', pw: 0.60, ph: 0.30 },
    ledmat: { name: 'LED matrace 60×60 cm (flexibilní)', lux1m: 2000, cct: 5600, defMod: 'panel', pw: 0.60, ph: 0.60, beam: 110 },
    skypanel: { name: 'ARRI SkyPanel S60-C (LED)', lux1m: 6000, cct: 5600, defMod: 'panel', pw: 0.60, ph: 0.30, beam: 105, model: 'skypanel', headOff: -0.11 },
    kinoflo: { name: 'Kino Flo 4Bank (zářivky)', lux1m: 2800, cct: 5600, defMod: 'panel', pw: 0.50, ph: 0.60, beam: 95, model: 'kinoflo', headOff: -0.05 },
    arri650: { name: 'ARRI 650 Plus (Fresnel, halogen)', lux1m: 7500, cct: 3200, defMod: 'fresnel', model: 'arri650', faceOff: 0.105, faceR: 0.08 },
    tube:   { name: 'LED tuba', lux1m: 380, cct: 3200, defMod: 'tube' },
    lamp:   { name: 'Praktikál 40 W', lux1m: 90, cct: 2700, defMod: 'practical' },
    // stropní / závěsná praktická světla: ceil = 'flush' (přisazené ke stropu) | 'hang' (na kabelu, drop = délka závěsu)
    ceilround: { name: 'Stropní LED svítidlo kruhové (přisazené)', lux1m: 600, cct: 4000, defMod: 'ceilpanel', ceil: 'flush', model: 'lightpack', part: 'light-circle_8' },
    batten:    { name: 'Zářivkové těleso 1,2 m (stropní)', lux1m: 650, cct: 4000, defMod: 'ceiltube', ceil: 'flush', model: 'lightpack', part: 'rode_0' },
    bulb:      { name: 'Holá žárovka 60 W (na kabelu)', lux1m: 65, cct: 2700, defMod: 'practical', ceil: 'hang', drop: 0.6, model: 'lightpack', part: 'bulb_12' },
    streetlamp: { name: 'Pouliční lampa (výbojka)', lux1m: 1200, cct: 2400, defMod: 'ceilpanel', ceil: 'pole', h0: 6.0 },
    porch:     { name: 'Světlo u dveří (40 W)', lux1m: 120, cct: 2700, defMod: 'practical' },
    hangfluo:  { name: 'Závěsné zářivkové svítidlo (industriální)', lux1m: 1300, cct: 4000, defMod: 'ceilfluo', ceil: 'hang', drop: 0.7, model: 'hangfluo' }
  };
  // výchozí výška stropního svítidla v místnosti se stropem z (m)
  function ceilHeight(fx, z) { z = z || 2.7; if (fx.ceil === 'pole') return fx.h0 || 5; return fx.ceil === 'hang' ? Math.max(2.0, z - (fx.drop || 0.6)) : z - 0.06; }
  var SKY = { overcast: { E: 1800, cct: 6500 }, sunny: { E: 5000, cct: 5600 }, dusk: { E: 300, cct: 7500 }, night: { E: 0.6, cct: 9000 } };
  // noc: místo slunce svítí měsíc – „filmový“ měsíční svit (reálný úplněk ≈ 0,25 lx, na place se svítí silněji), studený
  // světlo za otevřenými dveřmi (vedlejší místnost / chodba): lux na 1 m od otvoru šířky 0,9 m
  var DOORLIGHT = { none: { E: 0, cct: 3000 }, dim: { E: 120, cct: 3000 }, bright: { E: 500, cct: 4000 }, day: { E: 900, cct: 6000 } };
  // nábytek: půdorys w×d (m), výška h (m), tall = stíní ve výšce obličeje
  var FURNITURE = {
    chair:    { name: 'Židle', w: 0.45, d: 0.45, h: 0.9, tall: false, grp: 'seat' },
    sofa:     { name: 'Gauč (trojsedák)', w: 0.95, d: 2.4, h: 0.85, tall: false, grp: 'seat', credit: 'vasycrukov', title: 'Sofa_3230' },
    armchair: { name: 'Křeslo', w: 0.9, d: 0.9, h: 0.85, tall: false, grp: 'seat' },
    table:    { name: 'Stůl', w: 1.2, d: 0.7, h: 0.75, tall: false, grp: 'table' },
    coffee:   { name: 'Konferenční stolek', w: 0.9, d: 0.5, h: 0.45, tall: false, grp: 'table' },
    bed:      { name: 'Postel (manželská)', w: 2.2, d: 1.76, h: 1.06, tall: false, credit: 'rickmaolly', title: 'Bed', grp: 'bed' },
    wardrobe: { name: 'Skříň', w: 1.2, d: 0.6, h: 2.1, tall: true, grp: 'storage' },
    shelf:    { name: 'Regál', w: 0.9, d: 0.35, h: 2.0, tall: true, grp: 'storage' },
    block:    { name: 'Box (obecný)', w: 1.2, d: 0.6, h: 0.9, tall: false, grp: 'block' },
    car:      { name: 'Auto (klasické kupé)', w: 4.7, d: 1.9, h: 1.4, tall: false, credit: 'Lexyc16', title: 'Classic Muscle car', grp: 'car' },
    plane:    { name: 'Letadlo Piper PA-18 Super Cub', w: 7.05, d: 10.7, h: 2.69, tall: false, credit: null, title: 'Piper PA-18 Super Cub', grp: 'car' },
    ldesk:    { name: 'Rohový stůl (L) s nástavbou', w: 2.11, d: 1.55, h: 1.475, tall: false, top: 0.75, credit: 'fthylmaz', title: 'L shape desk, drawers and shelfs', grp: 'table' },
    pc:       { name: 'Počítač (monitor, klávesnice, myš)', w: 0.41, d: 0.62, h: 0.41, tall: false, elev: 0.75, credit: 'Tyler P Halterman', title: 'Desktop Computer', grp: 'pc' },
    pcdesk:   { name: 'Pracovní stůl s PC a doplňky', w: 0.75, d: 2.31, h: 1.32, tall: false, top: 0.75, credit: 'Ren Viro Store', title: 'PC Desk', grp: 'table' },
    kitchen:  { name: 'Kuchyňská linka s dřezem', w: 0.52, d: 1.49, h: 0.92, tall: false, credit: 'euanford12321', title: 'Kitchen Counter', grp: 'kitchen' },
    tree:     { name: 'Strom', w: 3.2, d: 3.2, h: 5.5, tall: false, credit: '00amza', title: 'Tree low poly', grp: 'tree' },
    // Furniture Pack (FBX, textury 512 px): glb = models/<id>.glb, rot = otočení modelu, aby přední strana mířila na +x; seat = dá se na tom sedět
    fp_bt_bath: { name: 'Vana volně stojící', w: 0.686, d: 1.6, h: 0.665, tall: false, grp: 'bath', glb: true, rot: Math.PI / 2, title: 'Furniture Pack' },
    fp_bt_mirror: { name: 'Zrcadlo nástěnné', w: 0.016, d: 0.479, h: 0.675, tall: false, grp: 'bath', glb: true, rot: 0, elev: 1.1, title: 'Furniture Pack' },
    fp_bt_shower: { name: 'Sprchový kout', w: 1.11, d: 1.08, h: 1.95, tall: true, grp: 'bath', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_bt_bathroomsink: { name: 'Umyvadlo na noze', w: 0.379, d: 0.542, h: 0.844, tall: false, grp: 'bath', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_bt_toilet: { name: 'WC', w: 0.588, d: 0.342, h: 0.739, tall: false, grp: 'bath', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_kt_kcabinet90degrees: { name: 'Kuchyň – rohová skříňka (zkosená)', w: 1.09, d: 1.09, h: 0.861, tall: false, grp: 'kitchen', glb: true, rot: Math.PI / 2, title: 'Furniture Pack' },
    fp_kt_kcabinetrounded: { name: 'Kuchyň – rohová linka do L', w: 1.89, d: 1.89, h: 0.861, tall: false, grp: 'kitchen', glb: true, rot: Math.PI, title: 'Furniture Pack' },
    fp_kt_kcabinetroundedwithsink: { name: 'Kuchyň – rohová linka do L s dřezem', w: 1.89, d: 1.89, h: 1.16, tall: false, grp: 'kitchen', glb: true, rot: Math.PI, title: 'Furniture Pack' },
    fp_kt_kcabinetwithoven: { name: 'Kuchyň – skříňka s troubou', w: 0.704, d: 0.8, h: 0.861, tall: false, grp: 'kitchen', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_kt_kcabinetwithsink: { name: 'Kuchyň – skříňka s dřezem', w: 0.692, d: 0.8, h: 1.1, tall: false, grp: 'kitchen', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_kt_kcabinetwithcookstove: { name: 'Kuchyň – skříňka s varnou deskou', w: 0.692, d: 0.8, h: 0.873, tall: false, grp: 'kitchen', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_kt_kcabinetwithstoveandoven: { name: 'Kuchyň – sporák (deska a trouba)', w: 0.704, d: 0.8, h: 0.873, tall: false, grp: 'kitchen', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_kt_kcabinet1: { name: 'Kuchyň – spodní skříňka', w: 0.692, d: 0.8, h: 0.861, tall: false, grp: 'kitchen', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_kt_kcabinet2: { name: 'Kuchyň – spodní skříňka 2', w: 0.692, d: 0.8, h: 0.861, tall: false, grp: 'kitchen', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_kt_kcupboard: { name: 'Kuchyň – horní skříňka', w: 0.435, d: 0.8, h: 0.8, tall: false, grp: 'kitchen', glb: true, rot: 0, elev: 1.45, title: 'Furniture Pack' },
    fp_kt_kcupboardrounded: { name: 'Kuchyň – horní rohové skříňky do L', w: 1.89, d: 1.89, h: 0.8, tall: false, grp: 'kitchen', glb: true, rot: 0, elev: 1.45, title: 'Furniture Pack' },
    fp_bd_bed1: { name: 'Postel jednolůžko (dřevěná)', w: 1.88, d: 0.847, h: 0.762, tall: false, grp: 'bed', glb: true, rot: 0, seat: true, title: 'Furniture Pack' },
    fp_bd_bed2: { name: 'Postel dvojlůžko (dřevěná)', w: 2.05, d: 1.66, h: 0.992, tall: false, grp: 'bed', glb: true, rot: 0, seat: true, title: 'Furniture Pack' },
    fp_ch_chair1: { name: 'Židle kov a dřevo', w: 0.465, d: 0.41, h: 0.79, tall: false, grp: 'seat', glb: true, rot: 0, seat: true, title: 'Furniture Pack' },
    fp_ch_chair2: { name: 'Židle dřevěná s příčkami', w: 0.503, d: 0.403, h: 0.963, tall: false, grp: 'seat', glb: true, rot: 0, seat: true, title: 'Furniture Pack' },
    fp_ch_chair3: { name: 'Židle s čalouněným sedákem', w: 0.466, d: 0.387, h: 0.946, tall: false, grp: 'seat', glb: true, rot: 0, seat: true, title: 'Furniture Pack' },
    fp_ch_chair4: { name: 'Křeslo dřevěné s polštáři', w: 0.912, d: 0.799, h: 0.832, tall: false, grp: 'seat', glb: true, rot: 0, seat: true, title: 'Furniture Pack' },
    fp_dr_bedsidetable1: { name: 'Noční stolek', w: 0.239, d: 0.386, h: 0.411, tall: false, grp: 'storage', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_dr_bedsidetable2: { name: 'Noční stolek 2', w: 0.389, d: 0.446, h: 0.448, tall: false, grp: 'storage', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_dr_dresser: { name: 'Komoda', w: 0.598, d: 1.36, h: 0.919, tall: false, grp: 'storage', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_sf_armchair: { name: 'Křeslo čalouněné', w: 0.801, d: 0.95, h: 0.812, tall: false, grp: 'seat', glb: true, rot: Math.PI / 2, seat: true, title: 'Furniture Pack' },
    fp_sf_sofa: { name: 'Pohovka trojsedák', w: 0.686, d: 2.05, h: 0.716, tall: false, grp: 'seat', glb: true, rot: Math.PI / 2, seat: true, title: 'Furniture Pack' },
    fp_tb_table1: { name: 'Psací stůl', w: 0.866, d: 1.73, h: 0.766, tall: false, grp: 'table', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_tb_table2: { name: 'Jídelní stůl velký', w: 1.04, d: 2.68, h: 0.767, tall: false, grp: 'table', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_tb_table3: { name: 'Konferenční stolek', w: 0.524, d: 1.8, h: 0.614, tall: false, grp: 'table', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_tb_table4: { name: 'Kulatý stůl', w: 1.01, d: 1.01, h: 0.692, tall: false, grp: 'table', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_tb_table5: { name: 'Kulatý jídelní stůl', w: 1.56, d: 1.56, h: 0.755, tall: false, grp: 'table', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_tb_table6: { name: 'Úzký stůl', w: 0.772, d: 2.02, h: 0.797, tall: false, grp: 'table', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_wr_wardrobe1: { name: 'Šatní skříň', w: 0.673, d: 1.02, h: 1.99, tall: true, grp: 'storage', glb: true, rot: 0, title: 'Furniture Pack' },
    fp_wr_wardrobe2: { name: 'Skříň s rákosovými dvířky', w: 0.52, d: 1.17, h: 1.97, tall: true, grp: 'storage', glb: true, rot: 0, title: 'Furniture Pack' }
  };
  // prostředí = celá místnost jako 3D model (sken / hotový ateliér); off = posun modelu do půdorysu, parts = pevné prvky kreslené v půdorysu
  var ENVS = {
    photostudio: { name: 'Fotoateliér (papírové pozadí, stůl s PC)', model: 'photostudio', room: { w: 10.1, h: 8.9, z: 3.75 }, off: [5.05, 4.45], walls: 'dark', floor: 'dark',
      parts: [{ label: 'Papírové pozadí', x0: 0.06, y0: 2.87, x1: 3.46, y1: 6.03, col: 'rgba(245,245,245,.55)' }, { label: 'Stůl s PC', x0: 6.5, y0: 6.05, x1: 7.6, y1: 8.22 }],
      credit: 'Zachey', title: 'Photo Studio' },
    cyclorama: { name: 'Hala s cykloramou (sken ateliéru)', model: 'cyclorama', room: { w: 22.75, h: 12.36, z: 4.7 }, off: [15.3, 6.63], walls: 'normal', floor: 'grey',
      parts: [{ label: 'Cyklorama (bílý horizont)', x0: 11.8, y0: 0.07, x1: 21.0, y1: 9.87, col: 'rgba(245,245,245,.35)' }],
      credit: 'tojek_vfx', title: 'Studio Scan with Cyclorama for realtime VR' },
    // exteriér: letní kemp s obytnými přívěsy (model posunutý o 0,79 m nahoru, aby tráva byla v nule; podlaha přívěsů je 0,79 m nad zemí)
    camp: { name: 'Letní kemp – obytné přívěsy (3D model)', model: 'camp', room: { w: 73, h: 66, z: 6 }, off: [16, 14], offY: 0.79, outdoor: true, walls: 'normal', floor: 'grass',
      parts: [{ label: 'Přívěs 1', x0: 15.88, y0: 8.76, x1: 19.62, y1: 23.87, col: 'rgba(200,205,210,.45)' }, { label: 'Přívěs 2', x0: 37.24, y0: 8.76, x1: 40.99, y1: 23.87, col: 'rgba(200,205,210,.45)' },
        { label: 'Přívěs 3', x0: 60.05, y0: 8.76, x1: 63.79, y1: 23.87, col: 'rgba(200,205,210,.45)' }, { label: 'Přívěs 4', x0: 15.88, y0: 47.4, x1: 19.62, y1: 62.6, col: 'rgba(200,205,210,.45)' },
        { label: 'Přívěs 5', x0: 37.24, y0: 47.4, x1: 40.99, y1: 62.6, col: 'rgba(200,205,210,.45)' }, { label: 'Přívěs 6', x0: 60.05, y0: 47.4, x1: 63.79, y1: 62.6, col: 'rgba(200,205,210,.45)' },
        { label: 'Silnice', x0: 0.1, y0: 32.9, x1: 63.5, y1: 39.4, col: 'rgba(70,70,72,.55)' }, { label: '', x0: 49.2, y0: 0.4, x1: 50.8, y1: 65, col: 'rgba(160,125,85,.35)' }],
      credit: 'Elbolillo', title: 'Trailer Park' },
    // interiéry z modelů: segs = řez stěnami ve výšce ~1,5 m (x1,y1,x2,y2;…) – stíní světlo v půdorysu a kreslí se jako zdi; wins = okna v obvodu (světlo zvenku, bez 3D okna – je v modelu)
    apt1: { name: 'Byt – obývák s kuchyní a 3 ložnice (3D model)', model: 'apt1', room: { w: 10.72, h: 10.74, z: 2.6 }, off: [-14.31, 22.23], offY: 0.01, walls: 'white', floor: 'wood', ceil: 2.6, exterior: { on: true, trees: 8 },
      // okna podle modelu (ložnice, koupelna, francouzské okno, balkon) + nové okno v jídelně (otvor vyříznutý do zdi)
      wins: [['top', 2.64, 3.69, 0.2], ['top', 4.79, 5.39, 0.2], ['top', 0.34, 1.54, 3.8], ['right', 1.24, 2.86, 1.23], ['right', 3.94, 5.19, 0.13],
        ['right', 7.63, 10.43, 0.15], ['bottom', 8.59, 10.44, 0.38], ['bottom', 5.0, 7.8, 0.14, null, 2, 0.3]],
      segs: '8.5,0,9.6,0;1.6,0.1,2.6,0.1;3.75,0.1,4.8,0.1;5.4,0.1,8.5,0.1;1.9,0.3,4.45,0.3;4.65,0.3,4.8,0.3;5.4,0.3,6.55,0.3;6.7,0.3,9.4,0.3;4.65,1.25,4.95,1.25;9.3,1.3,9.6,1.3;9.3,1.35,9.5,1.35;4.65,1.4,4.8,1.4;4.65,2,4.8,2;4.95,2,6.55,2;5.8,2.05,6.45,2.05;4.65,2.2,5.5,2.2;5.65,2.2,5.8,2.2;6.45,2.2,6.7,2.2;4.45,2.3,4.65,2.3;5.5,2.3,5.65,2.3;9.3,2.85,9.6,2.85;4.45,3,4.65,3;5.5,3,5.65,3;1.9,3.1,4.45,3.1;5.65,3.15,9.4,3.15;8.3,3.6,9.35,3.6;9.6,3.6,10.7,3.6;0,3.7,0.4,3.7;1.55,3.7,1.7,3.7;5.65,3.7,8.3,3.7;0.25,3.9,0.4,3.9;1.55,3.9,3.4,3.9;3.6,3.9,4.65,3.9;5.65,3.9,8.35,3.9;8.75,3.9,10.7,3.9;0.25,3.95,1.7,3.95;3.4,4,3.6,4;5.5,4,5.65,4;8.55,4.05,8.75,4.05;8.35,4.1,8.55,4.1;5.5,4.65,5.65,4.65;8.35,4.7,8.55,4.7;3.4,4.75,3.6,4.75;2.9,4.85,3.4,4.85;3.6,4.9,5.5,4.9;7.3,4.9,8.35,4.9;5.1,5.05,5.5,5.05;7.45,5.05,8.35,5.05;5.1,5.15,5.5,5.15;5.65,5.15,7.3,5.15;7.45,5.15,8.35,5.15;8.55,5.15,8.95,5.15;10.1,5.15,10.7,5.15;5.1,5.35,8.35,5.35;8.55,5.35,8.95,5.35;10.35,5.35,10.5,5.35;5.9,5.4,8.35,5.4;5.8,5.9,5.95,5.9;8.55,5.9,8.9,5.9;5.8,5.95,5.95,5.95;8.55,5.95,8.9,5.95;4.9,6,5.95,6;8.35,6,8.55,6;5.15,6.05,5.8,6.05;8.35,6.75,8.55,6.75;0.25,6.8,3.35,6.8;3.6,6.8,4.1,6.8;8.55,6.8,10.2,6.8;10.35,6.8,10.5,6.8;0,7,0.85,7;1.1,7,4.1,7;8.6,7.05,10.45,7.05;8.35,7.6,8.6,7.6;10.45,7.6,10.7,7.6;0.05,7.95,0.85,7.95;0.25,8.15,1.1,8.15;0,8.45,0.25,8.45;0,9.25,0.25,9.25;0,9.3,0.25,9.3;0.25,9.4,1.75,9.4;0.05,9.6,1.5,9.6;8.35,10.25,8.55,10.25;2.45,10.45,3.9,10.45;7.8,10.45,8.35,10.45;8.55,10.45,10.7,10.45;1.75,10.5,5,10.5;1.5,10.75,5,10.75;7.8,10.75,10.7,10.75;0,3.7,0,7;0.05,7.95,0.05,8.45;0.05,9.25,0.05,9.6;0.2,8.45,0.2,9.3;0.25,3.9,0.25,6.8;0.25,8.15,0.25,9.4;0.4,3.7,0.4,3.95;0.85,7,0.85,7.95;1.1,7,1.1,8.15;1.5,9.6,1.5,10.75;1.55,3.7,1.55,3.95;1.6,0.1,1.6,1.15;1.7,1.15,1.7,3.7;1.75,9.4,1.75,10.5;1.9,0.3,1.9,3.1;2.6,0.1,2.6,0.3;2.9,4.85,2.9,6.8;3.35,4.85,3.35,6.8;3.4,3.9,3.4,4.85;3.45,4,3.45,4.75;3.6,4.75,3.6,6.8;3.75,0.1,3.75,0.3;4.1,6.8,4.1,7;4.45,0.3,4.45,3.1;4.5,2.3,4.5,3;4.65,0.3,4.65,1.25;4.65,1.4,4.65,2;4.65,3,4.65,3.9;4.8,0.1,4.8,0.3;4.8,1.4,4.8,2;4.9,4.9,4.9,6;4.95,1.25,4.95,2;4.95,4.9,4.95,6;5.1,5.35,5.1,6;5.4,0.1,5.4,0.3;5.5,3,5.5,4;5.5,4.65,5.5,4.9;5.6,2.3,5.6,3;5.6,4,5.6,4.65;5.65,2.2,5.65,3.7;5.65,3.9,5.65,5.15;5.8,2,5.8,2.2;5.8,5.9,5.8,6.05;5.9,5.35,5.9,6;5.95,5.35,5.95,6;6.45,2,6.45,2.2;6.55,0.3,6.55,2;6.7,0.3,6.7,2.2;7.3,4.85,7.3,5.15;8.35,3.9,8.35,4.1;8.35,4.7,8.35,4.9;8.35,5.35,8.35,7.65;8.35,10.25,8.35,10.45;8.55,4.7,8.55,5.15;8.55,5.35,8.55,6;8.55,10.25,8.55,10.45;8.6,7.05,8.6,7.6;8.75,3.9,8.75,4.05;8.85,5.35,8.85,5.95;8.9,5.35,8.9,5.95;8.9,10.25,8.9,10.45;8.95,5.15,8.95,5.35;9.3,0.9,9.3,1.45;9.3,2.55,9.3,2.9;9.35,0.75,9.35,3.6;9.4,0.3,9.4,1.35;9.4,2.85,9.4,3.15;9.6,0,9.6,1.3;9.6,2.85,9.6,3.6;10.1,5.15,10.1,5.35;10.1,10.25,10.1,10.45;10.15,10.25,10.15,10.45;10.2,5.35,10.2,6.8;10.35,5.35,10.35,6.8;10.45,7.05,10.45,7.6;10.5,5.35,10.5,6.8;10.5,7.6,10.5,10.45;10.6,7.6,10.6,10.45;10.7,3.6,10.7,3.9;10.7,5.15,10.7,7.6;10.7,10.45,10.7,10.75', parts: [], credit: 'SrMonteiro', title: 'Apartment floor plan' },
    apt2: { name: 'Byt – obývák s kuchyní, ložnice (3D model)', model: 'apt2', room: { w: 7.05, h: 10.66, z: 2.4 }, off: [6.76, 6.27], offY: 0.01, walls: 'white', floor: 'wood', exterior: { on: true, trees: 8 },
      // okna jsou v modelu (rámy): ložnice vpravo, obývák dole, velké posuvné dveře z jídelny
      wins: [['right', 0.25, 1.15, 0.07], ['right', 3.37, 4.22, 0.07], ['bottom', 2.21, 3.11, 0.07], ['bottom', 4.25, 6.45, 0.94]],
      segs: '4.85,0,6.2,0;4.2,0.05,4.9,0.05;6.15,0.05,6.95,0.05;0,1.2,4.2,1.2;2.95,1.25,3.8,1.25;3.05,1.3,3.8,1.3;2.95,2.2,3.3,2.2;4.6,2.45,6.45,2.45;0,2.5,1.75,2.5;3.3,2.5,6.95,2.5;0,2.55,1.2,2.55;3.3,2.6,6.95,2.6;2.95,2.9,3.3,2.9;2.95,3,3.8,3;1.2,3.15,1.75,3.15;6.3,4.55,6.95,4.55;0,5.35,1.75,5.35;0.4,5.45,1.8,5.45;2.95,5.9,6.3,5.9;5.15,5.95,6.95,5.95;4.55,6.6,5.15,6.6;0.4,6.8,1.75,6.8;0,6.85,1.75,6.85;0.1,6.9,0.4,6.9;2.95,7,4.55,7;6.25,7.2,6.95,7.2;0.1,7.4,0.4,7.4;0.1,7.45,0.4,7.45;6.25,7.8,6.95,7.8;6.25,7.85,6.95,7.85;6.25,8.5,6.95,8.5;3.4,9.55,4.25,9.55;6.45,9.55,6.95,9.55;0.1,10,0.4,10;0,10.55,2.2,10.55;3.1,10.55,3.4,10.55;0,1.2,0,5.35;0.05,2.65,0.05,3;0.1,2.65,0.1,2.95;0.1,6.85,0.1,10.55;0.4,5.45,0.4,6.9;1.15,2.65,1.15,3;1.2,2.5,1.2,3.15;1.7,3.15,1.7,3.65;1.7,4.4,1.7,5.35;1.7,6.25,1.7,6.85;1.75,2.5,1.75,3.65;1.75,4.35,1.75,5.5;1.75,6.2,1.75,6.85;1.8,4.25,1.8,4.45;1.8,6.1,1.8,6.3;1.85,4.15,1.85,4.3;1.85,6,1.85,6.15;1.9,5.95,1.9,6.1;2,3.9,2,4.05;2,5.75,2,5.9;2.95,2,2.95,3;2.95,3.75,2.95,7;3,2,3,2.2;3,3.75,3,5.9;3.3,2.2,3.3,2.5;3.3,2.6,3.3,2.9;3.4,9.55,3.4,10.55;4.15,9.55,4.15,9.9;4.2,0,4.2,1.2;4.55,6.6,4.55,7;5.15,5.9,5.15,6.6;6.25,7.7,6.25,8.5;6.3,5.25,6.3,5.95;6.3,7.2,6.3,7.85;6.35,4.55,6.35,5.25;6.55,9.55,6.55,9.9;6.95,0,6.95,0.25;6.95,1.15,6.95,2.5;6.95,2.6,6.95,3.35;6.95,4.25,6.95,4.55;6.95,5.95,6.95,7.2;6.95,7.8,6.95,9.55', parts: [], credit: 'SrMonteiro', title: 'Appartement' },
    classroom: { name: 'Školní třída (3D model)', model: 'classroom', room: { w: 9.55, h: 15.65, z: 4.95 }, off: [4.13, 7.92], offY: 0.01, walls: 'normal', floor: 'wood', exterior: { on: true, trees: 6 },
      wins: [['left', 1.5, 7.3], ['left', 8.35, 14.2]], segs: '0,0,9.55,0;0.3,0.05,1.85,0.05;0.6,0.1,0.75,0.1;0.55,0.4,0.75,0.4;9.5,1.45,9.7,1.45;-0.3,1.5,0,1.5;9.5,1.6,9.7,1.6;9.5,3.75,9.7,3.75;9.5,3.8,9.7,3.8;9.5,3.95,9.7,3.95;-0.45,7.3,0,7.3;-0.45,8.35,0,8.35;-0.45,14.2,0,14.2;0.1,15.1,2.2,15.1;7.25,15.1,9.35,15.1;0,15.65,9.55,15.65;0,0,0,1.5;0,7.3,0,8.35;0,14.2,0,15.65;0.1,15.1,0.1,15.7;0.3,-0.15,0.3,0.4;0.35,0,0.35,0.4;0.55,0.15,0.55,0.4;0.65,0,0.65,0.4;0.7,0,0.7,0.4;0.75,0,0.75,0.4;1.15,15.1,1.15,15.7;1.85,-0.15,1.85,0.4;2.2,15.1,2.2,15.7;7.25,15.1,7.25,15.7;8.3,15.1,8.3,15.7;9.35,15.1,9.35,15.7;9.5,1.45,9.5,1.6;9.5,3.75,9.5,3.95;9.55,0,9.55,1.5;9.55,3.75,9.55,15.65;9.6,2.65,9.6,3.8;9.65,1.6,9.65,2.75', parts: [], credit: 'Zeps3D', title: 'Classroom' },
    // industriál: rozpadlá betonová remíza (sken), otevřené boky mezi sloupy = okna; podlaha (rampa) v nule, montážní jámy 1,1 m hluboké
    shed: { name: 'Industriál – betonová remíza s graffiti (3D model)', model: 'shed', room: { w: 18.24, h: 10.35, z: 6.5 }, off: [8.65, 5.19], offY: -1.21, groundHole: true, walls: 'normal', floor: 'grey', exterior: { on: true, trees: 8 },
      wins: [['top', 1.5, 5.7], ['top', 7.05, 10.8], ['top', 12.35, 16.1], ['bottom', 1.5, 5.7], ['bottom', 7.05, 10.8], ['bottom', 12.35, 16.1], ['right', 1.0, 9.2]],
      segs: '0.3,0.35,1.45,0.35;6.05,0.35,6.6,0.35;6.85,0.35,7,0.35;6.65,0.4,6.85,0.4;10.95,0.4,11.55,0.4;11.85,0.4,12.3,0.4;16.3,0.4,17.25,0.4;5.8,0.85,6,0.85;11.55,0.85,11.8,0.85;5.75,5,6,5;11.5,5.05,11.8,5.05;17.3,5.1,17.7,5.1;5.75,5.35,5.9,5.35;11.5,5.35,11.8,5.35;17.35,5.4,17.6,5.4;17.65,6.8,17.8,6.8;17.75,8.15,17.95,8.15;17.8,8.5,18,8.5;5.75,9.5,5.95,9.5;11.5,9.55,11.75,9.55;17.35,9.55,17.55,9.55;0.25,9.95,1.4,9.95;5.95,9.95,7,9.95;10.85,10,11.45,10;11.8,10,12.3,10;16.45,10,16.8,10;16.15,10.05,16.4,10.05;16.85,10.05,17.15,10.05;0.25,6.85,0.25,7.75;0.25,8.05,0.25,9.95;0.3,0.35,0.3,6.8;0.3,7.75,0.3,8.05;1.4,9.95,1.4,10.15;1.45,0.15,1.45,0.35;5.55,9.95,5.55,10.2;5.6,0.1,5.6,0.3;5.65,9.75,5.65,9.95;5.7,9.55,5.7,9.75;5.75,0.4,5.75,0.8;5.75,5,5.75,5.35;6,9.55,6,9.85;6.05,0.35,6.05,0.8;6.05,5.05,6.05,5.25;7,9.95,7,10.2;7.05,0.1,7.05,0.3;10.85,9.95,10.85,10.2;10.9,0.1,10.9,0.3;11.45,9.65,11.45,10;11.5,5.05,11.5,5.35;11.55,0.4,11.55,0.85;11.8,5.05,11.8,5.35;11.8,9.7,11.8,10;11.85,0.4,11.85,0.8;12.3,10,12.3,10.2;12.4,0.1,12.4,0.25;16.15,10,16.15,10.2;16.25,0.1,16.25,0.35;17.25,9.65,17.25,10;17.3,0.45,17.3,0.8;17.3,5.1,17.3,5.35;17.55,9.4,17.55,9.55;17.6,9.2,17.6,9.35;17.65,6,17.65,6.4;17.65,6.5,17.65,6.8;17.65,7.55,17.65,7.85;17.7,3.75,17.7,3.95;17.7,4.4,17.7,5.1;17.7,5.35,17.7,6;17.7,6.95,17.7,7.55;17.7,7.8,17.7,8.05;17.7,8.2,17.7,8.55;17.75,3.35,17.75,3.75;17.75,3.95,17.75,4.35;17.75,5.9,17.75,6.5;17.75,6.8,17.75,7.1;17.75,8.55,17.75,8.8;17.8,5.65,17.8,5.85;17.8,6.5,17.8,6.8;17.85,7.15,17.85,7.45', parts: [{ label: 'Montážní jáma', x0: 3.2, y0: 0.3, x1: 4.6, y1: 10.1, col: 'rgba(20,20,22,.55)' }, { label: 'Montážní jáma', x0: 8.2, y0: 0.3, x1: 9.6, y1: 10.1, col: 'rgba(20,20,22,.55)' }, { label: 'Montážní jáma', x0: 13.2, y0: 0.3, x1: 14.6, y1: 10.1, col: 'rgba(20,20,22,.55)' }], credit: 'orphanrtg', title: 'Decayed concrete train shed with graffiti' },
    // exteriér: čerpací stanice (přístřešek se 4 stojany, obchod, silnice); obchod stíní světlo, prosklená výloha ne
    gas: { name: 'Čerpací stanice s obchodem (3D model, exteriér)', model: 'gas', room: { w: 75, h: 90, z: 8 }, off: [30, 45], offY: 0, outdoor: true, walls: 'normal', floor: 'grey', exterior: { on: true, trees: 0 },
      segs: '27.4,15.8,41,15.8;27.4,15.8,27.4,31.4;41,15.8,41,31.4;27.4,31.4,29.6,31.4;40.6,31.4,41,31.4',
      parts: [{ label: 'Obchod', x0: 27.4, y0: 15.8, x1: 41, y1: 31.4, col: 'rgba(200,200,205,.35)' }, { label: 'Přístřešek', x0: 24.9, y0: 40.5, x1: 46.6, y1: 57.2, col: 'rgba(230,230,235,.18)' },
        { label: '', x0: 28.4, y0: 45.6, x1: 29.2, y1: 46.8 }, { label: '', x0: 28.4, y0: 51, x1: 29.2, y1: 52.3 }, { label: '', x0: 42.4, y0: 45.6, x1: 43.2, y1: 46.8 }, { label: '', x0: 42.4, y0: 51, x1: 43.2, y1: 52.3 },
        { label: 'Silnice', x0: 0, y0: 64.1, x1: 75, y1: 75.3, col: 'rgba(70,70,72,.45)' }],
      credit: 'Elbolillo', title: 'Gas station' },
    // exteriér: glamping chata (áčko) v lese
    glamping: { name: 'Glamping – chata v lese (3D model, exteriér)', model: 'glamping', room: { w: 24, h: 28, z: 9 }, off: [12, 19.5], offY: 0.05, outdoor: true, walls: 'normal', floor: 'grass', exterior: { on: true, trees: 12 },
      segs: '8.53,7.5,8.88,7.5;15.12,7.5,15.47,7.5;8.88,7.7,15.12,7.7;8.88,7.9,11.97,7.9;12.12,7.9,15.12,7.9;11.97,8.1,12.12,8.1;11.97,8.95,12.12,8.95;8.88,9.1,11.97,9.1;8.88,9.2,12.12,9.2;11.97,10.2,12.12,10.2;8.88,10.5,11.97,10.5;12.12,10.5,13.57,10.5;8.88,10.6,13.57,10.6;8.53,17.5,8.88,17.5;15.12,17.5,15.47,17.5;8.53,7.5,8.53,17.5;8.88,7.5,8.88,7.7;8.88,7.9,8.88,9.1;8.88,9.2,8.88,10.5;8.88,10.6,8.88,17.5;11.97,7.9,11.97,8.1;11.97,8.95,11.97,9.1;11.97,10.2,11.97,10.5;12.12,7.9,12.12,8.1;12.12,8.95,12.12,9.2;12.12,10.2,12.12,10.5;15.12,7.5,15.12,7.7;15.12,7.9,15.12,17.5;15.47,7.5,15.47,17.5', parts: [{ label: 'Chata', x0: 7.88, y0: 7.5, x1: 16.12, y1: 17.0, col: 'rgba(160,110,70,.25)' }, { label: 'Terasa', x0: 7.88, y0: 17.0, x1: 16.12, y1: 19.6, col: 'rgba(200,160,100,.3)' }], credit: null, title: 'Glamping chata' }
  };
  // kategorie nábytku: v panelu vlastností se pak volí konkrétní model (jako u postav)
  var FURN_GROUPS = { seat: 'Sezení', table: 'Stůl', bed: 'Postel', storage: 'Skříň / regál', kitchen: 'Kuchyň', bath: 'Koupelna', pc: 'Počítač', tree: 'Strom', car: 'Vozidlo', block: 'Box' };
  // 3D modely postav (soubory models/<id>.glb); výšky obličeje pro měření se doplní z pipeline
  var MODELS = {
    proc:  { name: 'Stylizovaná figura', stand: 1.5, sit: 1.2 },
    zena1: { name: 'Žena 1 – bílá halenka', file: 'models/zena1.glb', stand: 1.72, sit: 1.23, credit: 'Renderpeople', license: 'CC BY 4.0', source: 'sketchfab.com' },
    zena2: { name: 'Žena 2 – sako', file: 'models/zena2.glb', stand: 1.59, sit: 1.17, credit: 'Renderpeople', license: 'CC BY 4.0', source: 'sketchfab.com' },
    muz1:  { name: 'Muž 1 – vesta a kravata', file: 'models/muz1.glb', stand: 1.71, sit: 1.30, credit: '1-3D.com', license: 'CC BY 4.0', source: 'sketchfab.com' },
    muz2:  { name: 'Muž 2 – mikina, kšiltovka, brýle', file: 'models/muz2.glb', stand: 1.70, sit: 1.24, credit: 'Eyasu Biyaylgn', license: 'CC BY 4.0', source: 'sketchfab.com' },
    muz3:  { name: 'Muž 3 – dlouhý kabát a čepice', file: 'models/muz3.glb', solid: true, stand: 1.68, sit: 1.23, credit: 'Saitam', license: 'CC BY 4.0', source: 'sketchfab.com' },
    muz4:  { name: 'Muž 4 – mikina a modré tričko', file: 'models/muz4.glb', stand: 1.67, sit: 1.22, credit: 'Mike Alger', license: 'CC BY 4.0', source: 'sketchfab.com' },
    muz5:  { name: 'Muž 5 – ostraha (uniforma)', file: 'models/muz5.glb', stand: 1.50, sit: 1.10, credit: 'Q.SARDOR', license: 'CC BY 4.0', source: 'sketchfab.com' },
    zena3: { name: 'Žena 3 – červený top a sukně', file: 'models/zena3.glb', stand: 1.64, sit: 1.20, credit: 'Veterock', license: 'CC BY 4.0', source: 'sketchfab.com' },
    // postavy z MakeHumanu (kostra „game engine“ přejmenovaná na naši, pózy přenesené z Mixama); autor bude doplněn
    muz6:  { name: 'Muž 6 – košile a džíny', file: 'models/muz6.glb', stand: 1.70, sit: 1.26 },
    muz7:  { name: 'Muž 7 – pracovník v montérkách', file: 'models/muz7.glb', stand: 1.65, sit: 1.23 }
  };
  // atribuce pro použité modely (CC BY vyžaduje uvedení autora)
  function credits(scene) {
    var out = [], seen = {}, items = scene.items || [];
    items.forEach(function (i) { if (i.kind !== 'person') return; var m = MODELS[i.model]; if (!m || !m.file || seen[i.model]) return; seen[i.model] = 1; out.push(m.credit ? '3D model „' + m.name + '“: ' + m.credit + ' (' + m.source + '), licence ' + m.license : '3D model „' + m.name + '“ (autor bude doplněn)'); });
    var types = {}; items.forEach(function (i) { if (i.kind === 'furniture' && FURNITURE[i.type] && FURNITURE[i.type].title) types[i.type] = 1; });
    if (exteriorTrees(scene).length) types.tree = 1;
    var outside = scene.outdoor || (scene.exterior && scene.exterior.on);
    if ((scene.windows || []).length && !scene.outdoor) out.push('3D model „Plastic window“: Annelida (sketchfab.com), licence CC BY 4.0');
    if ((scene.doors || []).some(function (d) { return d.w <= 1.4; }) && !scene.outdoor) out.push('3D model „Door with frame“: witnessk (sketchfab.com), licence CC BY 4.0');
    if (outside && scene.fence !== false) out.push('3D model „Fence (Wood)“: trentspi (sketchfab.com), licence CC BY 4.0');
    if (outside || (scene.windows || []).length) out.push('3D model „FREE - SkyBox Basic Sky“: Paul (sketchfab.com), licence CC BY 4.0');
    if (items.some(function (i) { return i.kind === 'light'; })) out.push('3D model „Simple Studio Light“: AleixoAlonso (sketchfab.com), licence CC BY 4.0');
    if (items.some(function (i) { return i.kind === 'light' && FIXTURES[i.fixture] && FIXTURES[i.fixture].model === 'lightpack'; })) out.push('3D model „Light Pack“: OPREXT (sketchfab.com), licence CC BY 4.0');
    if (items.some(function (i) { return i.kind === 'light' && i.fixture === 'hangfluo'; })) out.push('3D model „Low Poly hanging Light“: Avadhoot (sketchfab.com), licence CC BY 4.0');
    var env = scene.env && ENVS[scene.env]; if (env) out.push(env.credit ? '3D model „' + env.title + '“: ' + env.credit + ' (sketchfab.com), licence CC BY 4.0' : '3D model „' + env.title + '“ (autor bude doplněn)');
    Object.keys(types).forEach(function (t) { var f = FURNITURE[t], line = f.credit ? '3D model „' + f.title + '“: ' + f.credit + ' (sketchfab.com), licence CC BY 4.0' : '3D model „' + f.title + '“ (autor bude doplněn)'; if (out.indexOf(line) < 0) out.push(line); });
    if (items.some(function (i) { return i.kind === 'person' && MODELS[i.model] && MODELS[i.model].file; })) out.push('Animace: Mixamo (Adobe)');
    return out;
  }
  // pózy = klipy v modelech; sit: obličej ve výšce sedu
  var POSES = { stand: { name: 'Stojí (klid)', clip: 'idle', sit: false }, sit: { name: 'Sedí', clip: 'sitidle', sit: true }, talk: { name: 'Mluví (gesta)', clip: 'talk', sit: false }, point: { name: 'Ukazuje', clip: 'point', sit: false }, phone: { name: 'Telefonuje', clip: 'phone', sit: false }, type: { name: 'Píše na klávesnici (sedí)', clip: 'type', sit: true }, walk: { name: 'Jde', clip: 'walk', sit: false }, clap: { name: 'Tleská', clip: 'clap', sit: false }, lean: { name: 'Opírá se (zády ke zdi)', clip: 'lean', sit: false, face: 0.94 }, look: { name: 'Rozhlíží se', clip: 'look', sit: false }, crouch: { name: 'Dřepí', clip: 'crouch', sit: false, face: 0.68 }, lay: { name: 'Leží (na zádech)', clip: 'lay', sit: false, face: 0.13, lay: true }, layf: { name: 'Sedí na zemi (opřená o ruce, noha přes nohu)', clip: 'layf', sit: false, face: 0.47 }, wave: { name: 'Mává (oběma rukama)', clip: 'wave', sit: false }, ask: { name: 'Hlásí se / ptá se (sedí)', clip: 'ask', sit: true }, catwalk: { name: 'Jde jako modelka (přehlídka)', clip: 'catwalk', sit: false }, squat: { name: 'Dřepy (cvičí)', clip: 'squat', sit: false, face: 0.8 }, dance: { name: 'Tančí', clip: 'dance', sit: false }, kick: { name: 'Kope', clip: 'kick', sit: false, face: 0.93 }, carin: { name: 'Nastupuje do auta', clip: 'carin', sit: false, face: 0.8 } };
  function faceZ(person) { if (!person) return FACE_Z; var m = MODELS[person.model] || MODELS.proc, ps = POSES[person.pose] || POSES.stand; return ps.sit ? m.sit : (ps.face ? m.stand * ps.face : m.stand); }
  var SUN_E = 50000, SUN_CCT = 5200, WIN_Z0 = 0.9, WIN_Z1 = 2.1;
  // gobo: name + podíl propuštěného světla (orientačně)
  var GOBOS = {
    none:     { name: 'bez goba', open: 1 },
    window4:  { name: 'Okno – 4 tabulky', open: 0.7 },
    window6:  { name: 'Okno – 6 tabulek', open: 0.62 },
    blinds:   { name: 'Žaluzie (vodorovné)', open: 0.5 },
    slats:    { name: 'Lamely (svislé)', open: 0.5 },
    leaves:   { name: 'Listí', open: 0.45 },
    branches: { name: 'Větve', open: 0.7 },
    circle:   { name: 'Kruh (iris)', open: 0.5 },
    bars:     { name: 'Mříž', open: 0.6 },
    dots:     { name: 'Tečky (breakup)', open: 0.4 },
    cross:    { name: 'Kříž', open: 0.15 }
  };
  // roleta: podíl zakrytí okna shora (0 = otevřeno, 1 = zavřeno)
  var BLINDS = { none: 0, half: 0.5, closed: 1 };
  function blindOf(w) { return BLINDS[w.blind] || 0; }
  // nakreslená zeď: úsek p1→p2, parametr t = vzdálenost od p1 (m)
  function wallLen(w) { return Math.hypot(w.x2 - w.x1, w.y2 - w.y1); }
  function wallPoint(w, t) { var L = wallLen(w) || 1; return [w.x1 + (w.x2 - w.x1) / L * t, w.y1 + (w.y2 - w.y1) / L * t]; }
  function sunDir(scene) { var a = scene.sun ? scene.sun.az || 0 : 0; return [Math.cos(a), Math.sin(a)]; }
  function sunOn(scene) { return !!(scene.sun && scene.sun.on); }
  // barva slunce podle výšky: u obzoru teplé (zlatá hodinka ~3000 K), od 25° denní 5200 K
  var MOON_E = 6, MOON_CCT = 4300;
  function isNight(scene) { return scene.sky === 'night'; }
  function sunE(scene) { return isNight(scene) ? MOON_E : SUN_E; }
  function sunCCT(scene) { if (isNight(scene)) return MOON_CCT; var e = scene.sun && scene.sun.elev != null ? scene.sun.elev : 35; return e >= 25 ? SUN_CCT : Math.round(2900 + (SUN_CCT - 2900) * Math.max(0, e) / 25); }
  var curFaceZ = FACE_Z;

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

  // úsečky zdí prostředí (řez 3D modelem) – z řetězce „x1,y1,x2,y2;…“, rozparsováno jednou
  function envSegs(scene) { var E = scene.env && ENVS[scene.env]; if (!E || !E.segs) return []; if (!E._segs) E._segs = E.segs.split(';').map(function (t) { return t.split(',').map(Number); }); return E._segs; }
  function buildOccluders(scene) {
    var segs = [], circs = [];
    var W = scene.room.w, H = scene.room.h;
    function wall(x1, y1, x2, y2, side) {
      var ops = openings(scene, side), vert = (side === 'left' || side === 'right'), a = vert ? y1 : x1, b = vert ? y2 : x2, cur = a;
      ops.forEach(function (o) { if (o[0] > cur) segs.push(vert ? [x1, cur, x2, o[0]] : [cur, y1, o[0], y2]); cur = Math.max(cur, o[1]); });
      if (cur < b) segs.push(vert ? [x1, cur, x2, b] : [cur, y1, b, y2]);
    }
    if (!scene.outdoor) { wall(0, 0, W, 0, 'top'); wall(0, H, W, H, 'bottom'); wall(0, 0, 0, H, 'left'); wall(W, 0, W, H, 'right'); }
    envSegs(scene).forEach(function (q) { segs.push(q); }); // zdi z 3D modelu prostředí
    scene.items.forEach(function (it) {
      if (it.kind === 'wall') {
        var L = wallLen(it), ops = [], cur = 0;
        (scene.windows || []).forEach(function (w) { if (w.wall === it.id) ops.push([w.from, w.to]); });
        (scene.doors || []).forEach(function (d) { if (d.wall === it.id && d.open !== false) ops.push([d.at - d.w / 2, d.at + d.w / 2]); });
        ops.sort(function (p, q) { return p[0] - q[0]; });
        ops.forEach(function (o) { if (o[0] > cur) { var a = wallPoint(it, cur), b = wallPoint(it, o[0]); segs.push([a[0], a[1], b[0], b[1]]); } cur = Math.max(cur, o[1]); });
        if (cur < L) { var a2 = wallPoint(it, cur), b2 = wallPoint(it, L); segs.push([a2[0], a2[1], b2[0], b2[1]]); }
        return;
      }
      if (it.kind === 'person') circs.push([it.x, it.y, 0.11]);
      if (it.kind === 'flag' || it.kind === 'bounce' || it.kind === 'diffuser') {
        var h = it.len / 2, c = Math.cos(it.rot), s = Math.sin(it.rot);
        segs.push([it.x - c * h, it.y - s * h, it.x + c * h, it.y + s * h]);
      }
      if ((it.kind === 'box' || it.kind === 'furniture') && isTall(it)) {
        var c4 = corners(it);
        for (var q = 0; q < 4; q++) { var p1 = c4[q], p2 = c4[(q + 1) % 4]; segs.push([p1[0], p1[1], p2[0], p2[1]]); }
      }
    });
    return { segs: segs, circs: circs };
  }
  // otvory ve stěně (setříděné intervaly [od, do]) – okno + otevřené dveře
  function openings(scene, side) {
    var ops = [];
    (scene.windows || []).forEach(function (w) { if (w.wall === side) ops.push([w.from, w.to]); });
    (scene.doors || []).forEach(function (d) { if (d.wall === side && d.open !== false) ops.push([d.at - d.w / 2, d.at + d.w / 2]); });
    ops.sort(function (p, q) { return p[0] - q[0]; });
    return ops;
  }
  // nábytek, na kterém postava sedí (gauč, křeslo, židle, postel) – pak se nekreslí automatická židle
  function seatUnder(scene, person) {
    if (!person || !(POSES[person.pose] || POSES.stand).sit) return null;
    var found = null;
    scene.items.forEach(function (it) {
      if (found || it.kind !== 'furniture' || (['sofa', 'armchair', 'chair', 'bed', 'car'].indexOf(it.type) < 0 && !(FURNITURE[it.type] && FURNITURE[it.type].seat))) return;
      var r = it.rot || 0, c = Math.cos(r), sn = Math.sin(r), dx = person.x - it.x, dy = person.y - it.y, u = dx * c + dy * sn, v = -dx * sn + dy * c;
      if (Math.abs(u) <= it.w / 2 + 0.05 && Math.abs(v) <= it.d / 2 + 0.05) found = it;
    });
    return found;
  }
  // sedadla v autě (poměr k délce/šířce auta): řidič vlevo, spolujezdec vpravo
  // enter / enterDriver = postava u dveří spolujezdce / řidiče (klip z Mixama: auto má po pravé ruce, dívá se k zádi, usedá dozadu; u řidiče zrcadlově)
  function carSeat(car, which) { var ent = which === 'enter' || which === 'enterDriver', fx = ent ? 0.02 * car.w : -0.04 * car.w, fy = which === 'enter' ? 0.5 * car.d + 0.28 : which === 'enterDriver' ? -(0.5 * car.d + 0.28) : (which === 'passenger' ? 0.2 : -0.2) * car.d, r = car.rot || 0, c = Math.cos(r), sn = Math.sin(r); return { x: car.x + fx * c - fy * sn, y: car.y + fx * sn + fy * c, rot: ent ? r + Math.PI : r }; }
  // o kolik se nastupující postava na konci klipu dosune dovnitř na sedadlo (m), podle nejbližšího auta
  function carSlide(scene, p) {
    var best = 0; (scene.items || []).forEach(function (it) { if (it.kind !== 'furniture' || it.type !== 'car') return; var c = Math.cos(it.rot || 0), sn = Math.sin(it.rot || 0), dx = p.x - it.x, dy = p.y - it.y, u = dx * c + dy * sn, v = -dx * sn + dy * c;
      if (Math.abs(u) > it.w / 2 || Math.abs(v) > it.d / 2 + 1.2) return; var d = Math.abs(v) - 0.27 * it.d; if (d > best) best = d; });
    return best;
  }
  // místa na gauči (střed sedáku, čelem ven) – podle délky 2 nebo 3 místa
  function sofaSeats(sofa) {
    var n = sofa.d >= 2.1 ? 3 : 2, r = sofa.rot || 0, c = Math.cos(r), sn = Math.sin(r), out = [], use = sofa.d - 0.5; // pánev kousek za středem hloubky
    for (var i = 0; i < n; i++) { var lz = -use / 2 + use * (i + 0.5) / n, lx = -0.01 * sofa.w / 0.95; out.push({ x: sofa.x + lx * c - lz * sn, y: sofa.y + lx * sn + lz * c, rot: r }); }
    return out;
  }
  function deskSpots(desk) {
    if (desk.type === 'pcdesk') { // sedí se před stůl (strana u šipky otočení), čelem k monitoru
      var r2 = desk.rot || 0, off = desk.w / 2 + 0.24;
      return { person: { x: desk.x + Math.cos(r2) * off, y: desk.y + Math.sin(r2) * off, rot: r2 + Math.PI }, pc: null };
    }
    var w = desk.w, d = desk.d, aw = 0.6 * w / 2.11, ad = 0.6 * d / 1.55, r = desk.rot || 0, c = Math.cos(r), sn = Math.sin(r);
    function P(lx, lz) { return { x: desk.x + lx * c - lz * sn, y: desk.y + lx * sn + lz * c }; }
    var ps = P(-w / 2 + aw + 0.42, -d / 2 + ad + 0.42), pc = P(-w / 2 + aw * 0.5, -d / 2 + ad * 0.5), top = (desk.h || 1.475) * 0.798 / 1.57; // deska modelu je v 50,8 % jeho výšky
    return { person: { x: ps.x, y: ps.y, rot: r - 3 * Math.PI / 4 }, pc: { x: pc.x, y: pc.y, rot: r + Math.PI / 4, elev: top } };
  }
  function isTall(it) { if (it.kind === 'box') return !!it.tall; var f = FURNITURE[it.type] || FURNITURE.block; if (it.type === 'block') return (it.h == null ? f.h : it.h) >= 1.3; return it.tall != null ? !!it.tall : f.tall; }
  // zorné úhly kamery (rad) pro ohnisko (mm, full frame 36×24) a poměr stran záběru
  var FORMATS = { free: { name: 'volný (podle okna)', a: 0 }, '43': { name: '4:3', a: 4 / 3 }, '169': { name: '16:9', a: 16 / 9 }, '916': { name: '9:16 (na výšku)', a: 9 / 16 }, scope: { name: '2.39:1 cinemascope', a: 2.39 } };
  function fovs(focal, aspect) {
    var f = focal || 35, A = aspect || 1.5, hw = A >= 1 ? 18 : 18 * A, hh = A >= 1 ? 18 / A : 18;
    return { h: 2 * Math.atan(hw / f), v: 2 * Math.atan(hh / f) };
  }
  // exteriér: stromy kolem domu (deterministicky podle rozměrů místnosti a počtu)
  function exteriorTrees(scene) {
    var ex = scene.exterior; if (!ex || !ex.on) return [];
    var n = ex.trees == null ? 6 : ex.trees, W = scene.room.w, H = scene.room.h, out = [], seed = 12345 + Math.round(W * 7 + H * 13);
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < n; i++) {
      var a = (i + 0.5) / n * Math.PI * 2 + (rnd() - 0.5) * 0.6, r = 2.5 + rnd() * 4;
      var cx = W / 2 + Math.cos(a) * (W / 2 + r), cy = H / 2 + Math.sin(a) * (H / 2 + r);
      var th = 4.5 + rnd() * 3.5; out.push({ x: cx, y: cy, h: th, r: th * 0.3, kind: rnd() < 0.5 ? 'a' : 'b', rot: rnd() * 6.283 });
    }
    return out;
  }
  function corners(it) {
    var w2 = it.w / 2, d2 = it.d / 2, r = it.kind === 'furniture' ? (it.rot || 0) : 0, c = Math.cos(r), s = Math.sin(r), out = [];
    [[-w2, -d2], [w2, -d2], [w2, d2], [-w2, d2]].forEach(function (p) { out.push([it.x + p[0] * c - p[1] * s, it.y + p[0] * s + p[1] * c]); });
    return out;
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
    var beam = m.zoom ? (L.zoom || 30) : (m.panel && fx.beam ? fx.beam : m.beam);
    if (L.grid && m.soft) beam = Math.min(beam, 50);
    var mult = m.mult;
    if (m.zoom) mult = mult * Math.pow(30 / beam, 1.6);
    if (L.grid && m.soft) mult *= 0.75;
    var cct = L.cct || fx.cct;
    if (L.gel === 'cto') { cct = cct * 3200 / 5600; mult *= 0.55; }
    if (L.gel === 'ctb') { cct = Math.min(9000, cct * 5600 / 3200); mult *= 0.4; }
    if (L.diff) mult *= 0.6;
    if (!m.soft && L.gobo && GOBOS[L.gobo]) mult *= GOBOS[L.gobo].open;
    var size = m.panel ? (fx.pw || m.size) : m.size + (L.diff && !m.soft ? 0.25 : 0);
    var aspect = m.panel ? (fx.ph || fx.pw || m.size) / (fx.pw || m.size) : (L.mod === 'frame' ? 1 : 0.75);
    var E1 = fx.lux1m * mult * ((L.power == null ? 70 : L.power) / 100), col = cctColor(cct), rgb = null, Y = 1;
    if (L.rgb && L.color) { // barevné světlo (RGB/HSI režim): luxmetr měří jen jas barvy → saturované barvy „ztrácí“ lux
      var hx = parseInt(String(L.color).replace('#', ''), 16) || 0, sr = [(hx >> 16 & 255) / 255, (hx >> 8 & 255) / 255, (hx & 255) / 255];
      var lin = sr.map(function (v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }), mx = Math.max(lin[0], lin[1], lin[2], 1e-4);
      rgb = [lin[0] / mx, lin[1] / mx, lin[2] / mx]; Y = Math.max(0.05, 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]); E1 *= Y;
      var smx = Math.max(sr[0], sr[1], sr[2], 1e-4), sn = [sr[0] / smx, sr[1] / smx, sr[2] / smx], mean = (sn[0] + sn[1] + sn[2]) / 3;
      col = [sn[0] / Math.max(0.33, mean), sn[1] / Math.max(0.33, mean), sn[2] / Math.max(0.33, mean)];
    }
    return { fx: fx, mod: m, beam: beam, mult: mult, cct: cct, size: size, aspect: aspect, E1: E1, col: col, rgb: rgb, Y: Y, soft: m.soft, omni: beam >= 300, h: L.h == null ? 1.7 : L.h };
  }

  // automatický náklon světla: míří na výšku obličeje 2,2 m před sebou (°)
  function autoTilt(L) { var P = lightParams(L); return Math.atan2(FACE_Z - P.h, 2.2) * 180 / Math.PI; }
  function lightEmitter(L) {
    var P = lightParams(L), beam = P.beam, m = P.mod;
    var nx = Math.cos(L.rot), ny = Math.sin(L.rot);
    var half = beam / 2 * Math.PI / 180;
    var exp = half >= Math.PI / 2 ? (half > 2.5 ? 0 : 1) : Math.log(0.5) / Math.log(Math.cos(half));
    var n = P.size < 0.2 ? 1 : Math.min(9, Math.max(3, Math.round(P.size / 0.15)));
    var pts = [], tx = -ny, ty = nx;
    for (var i = 0; i < n; i++) { var o = n === 1 ? 0 : (i / (n - 1) - 0.5) * P.size; pts.push([L.x + tx * o + nx * 0.02, L.y + ty * o + ny * 0.02]); }
    return { pts: pts, nx: nx, ny: ny, z: P.h, E1: P.E1, exp: exp,
             cosCut: m.soft ? (beam >= 300 ? -2 : 0.0) : Math.cos(Math.min(Math.PI * 0.97, half * 1.5)), col: P.col, hard: !m.soft,
             barn: L.barn ? Math.cos(half * 1.02) : null, omni: P.omni, id: L.id, tilt: L.tiltDeg != null ? L.tiltDeg * Math.PI / 180 : null };
  }
  function windowEmitters(scene) {
    var out = [], sk = SKY[scene.sky] || SKY.overcast;
    if (scene.outdoor) return out;
    (scene.windows || []).forEach(function (w) {
      if (typeof w.wall !== 'string') return;
      var pts = [], n = 16, nx, ny;
      for (var i = 0; i < n; i++) {
        var t = w.from + (i + 0.5) / n * (w.to - w.from);
        if (w.wall === 'left') { pts.push([-0.01, t]); nx = 1; ny = 0; }
        else if (w.wall === 'right') { pts.push([scene.room.w + 0.01, t]); nx = -1; ny = 0; }
        else if (w.wall === 'top') { pts.push([t, -0.01]); nx = 0; ny = 1; }
        else { pts.push([t, scene.room.h + 0.01]); nx = 0; ny = -1; }
      }
      var open = 1 - blindOf(w) * 0.97; if (open <= 0.001) return;
      out.push({ pts: pts, nx: nx, ny: ny, z: FACE_Z - blindOf(w) * 0.4, E1: sk.E * (w.to - w.from) / 1.2 * open, exp: 1, cosCut: 0.02, col: cctColor(sk.cct), hard: false, omni: false, win: true, id: 'win' + w.id });
    });
    return out;
  }
  // přímé slunce: vrací 1, když bod (x,y) ve výšce obličeje vidí slunce skrz okno ve vnější stěně
  function sunVisible(scene, occ, x, y) {
    if (!sunOn(scene)) return 0;
    if (scene.outdoor) { var dd = sunDir(scene), L = 30, ex2 = x + dd[0] * L, ey2 = y + dd[1] * L; return visible(occ, x, y, ex2, ey2) ? 1 : 0; }
    var d = sunDir(scene), W = scene.room.w, H = scene.room.h, best = null;
    function hit(t, side, coord) { if (t > 0 && (best === null || t < best.t)) best = { t: t, side: side, c: coord }; }
    if (d[0] < -1e-9) hit((0 - x) / d[0], 'left', y + (0 - x) / d[0] * d[1]);
    if (d[0] > 1e-9) hit((W - x) / d[0], 'right', y + (W - x) / d[0] * d[1]);
    if (d[1] < -1e-9) hit((0 - y) / d[1], 'top', x + (0 - y) / d[1] * d[0]);
    if (d[1] > 1e-9) hit((H - y) / d[1], 'bottom', x + (H - y) / d[1] * d[0]);
    if (!best) return 0;
    var z = curFaceZ + best.t * Math.tan((scene.sun.elev == null ? 35 : scene.sun.elev) * Math.PI / 180);
    var ok = (scene.windows || []).some(function (w) { return w.wall === best.side && best.c >= w.from && best.c <= w.to && z >= WIN_Z0 && z <= WIN_Z1 - blindOf(w) * (WIN_Z1 - WIN_Z0); });
    if (!ok) return 0;
    var ex = x + d[0] * best.t * 0.999, ey = y + d[1] * best.t * 0.999;
    return visible(occ, x, y, ex, ey) ? 1 : 0;
  }
  function sunIllum(scene, occ, x, y, snx, sny) {
    var v = sunVisible(scene, occ, x, y); if (!v) return 0;
    var ce = Math.cos((scene.sun.elev == null ? 35 : scene.sun.elev) * Math.PI / 180), d = sunDir(scene);
    if (snx === undefined) return sunE(scene);
    var lam = (snx * d[0] + sny * d[1]) * ce; return lam > 0 ? sunE(scene) * lam : 0;
  }
  function doorEmitters(scene) {
    var out = []; if (scene.outdoor) return out;
    (scene.doors || []).forEach(function (d) {
      var L = DOORLIGHT[d.light] || DOORLIGHT.none; if (typeof d.wall !== 'string' || d.open === false || L.E <= 0) return; // dveře v nakreslené zdi = průchod mezi místnostmi
      var pts = [], n = 8, nx, ny, from = d.at - d.w / 2, to = d.at + d.w / 2;
      for (var i = 0; i < n; i++) {
        var t = from + (i + 0.5) / n * d.w;
        if (d.wall === 'left') { pts.push([-0.01, t]); nx = 1; ny = 0; }
        else if (d.wall === 'right') { pts.push([scene.room.w + 0.01, t]); nx = -1; ny = 0; }
        else if (d.wall === 'top') { pts.push([t, -0.01]); nx = 0; ny = 1; }
        else { pts.push([t, scene.room.h + 0.01]); nx = 0; ny = -1; }
      }
      out.push({ pts: pts, nx: nx, ny: ny, z: 1.3, E1: L.E * d.w / 0.9, exp: 1, cosCut: 0.02, col: cctColor(L.cct), hard: false, omni: false, door: true, id: 'door' + d.id });
    });
    return out;
  }

  function illum(em, occ, x, y, snx, sny) {
    var sum = 0, n = em.pts.length, per = em.E1 / n, dz = (em.z == null ? curFaceZ : em.z) - curFaceZ, dz2 = dz * dz;
    for (var i = 0; i < n; i++) {
      var p = em.pts[i], dx = x - p[0], dy = y - p[1], d2 = dx * dx + dy * dy;
      if (d2 < 0.0025) d2 = 0.0025;
      var d = Math.sqrt(d2), cs = em.omni ? 1 : (dx * em.nx + dy * em.ny) / d;
      if (em.tilt != null && !em.omni) { var ct = Math.cos(em.tilt), st = Math.sin(em.tilt); cs = (dx * em.nx * ct + dy * em.ny * ct - dz * st) / Math.sqrt(d2 + dz2); } // ruční náklon: úhel k ose ve 3D
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

  // desky: odrazivost / propustnost, plocha, výška středu; stříbrná odráží víc a do užšího kužele (lalok cos^4 → ~3× v ose)
  var GRIDS = { quarter: { name: '1/4 grid (lehká difuze)', t: 0.8 }, half: { name: '1/2 grid', t: 0.65 }, full: { name: 'plná difuze (full grid)', t: 0.45 } };
  function boardParams(it) {
    if (it.kind === 'diffuser') { var g = GRIDS[it.grid] || GRIDS.half, hh = it.hgt || it.len; return { k: g.t, area: it.len * hh, z: it.h == null ? 1.6 : it.h, hgt: hh, exp: 1, gain: 1 }; }
    return { k: it.black ? 0.03 : (it.silver ? 0.85 : 0.75), area: it.len * 1.0, z: 1.5, hgt: 1.0, exp: it.silver ? 4 : 1, gain: it.silver ? 3 : 1 };
  }
  // světlo míří skrz difuzní rám (osa světla 3 m vpřed protíná rám) → přímé světlo nahradí rám
  function diffusedBy(scene, L) {
    var ax = L.x, ay = L.y, bx = L.x + Math.cos(L.rot) * 3, by = L.y + Math.sin(L.rot) * 3, hit = null;
    (scene.items || []).forEach(function (it) { if (it.kind !== 'diffuser' || hit) return; var h = it.len / 2, c = Math.cos(it.rot), sn = Math.sin(it.rot);
      if (segHit(ax, ay, bx, by, it.x - c * h, it.y - sn * h, it.x + c * h, it.y + sn * h)) hit = it; });
    return hit;
  }
  function emitters(scene, occ) {
    var ems = [];
    scene.items.forEach(function (it) { if (it.kind === 'light' && it.on !== false) ems.push(lightEmitter(it)); });
    windowEmitters(scene).forEach(function (e) { ems.push(e); });
    doorEmitters(scene).forEach(function (e) { ems.push(e); });
    var sd = sunDir(scene), sunCol = cctColor(sunCCT(scene));
    // odrazky a difuzní rámy: sečíst světlo dopadající na desku a vyzářit ho jako plošný zdroj
    // odrazka = lícová strana (normála), difuzní rám = světlo zezadu, vyzáří dopředu
    scene.items.forEach(function (it) {
      if (it.kind !== 'bounce' && it.kind !== 'diffuser') return;
      var dif = it.kind === 'diffuser', nx = Math.cos(it.rot + Math.PI / 2), ny = Math.sin(it.rot + Math.PI / 2);
      if (it.flip) { nx = -nx; ny = -ny; }
      var sgn = dif ? -1 : 1, cx = it.x + sgn * nx * 0.03, cy = it.y + sgn * ny * 0.03, col = [0, 0, 0], Etot = 0;
      ems.forEach(function (em) {
        if (em.bounce) return;
        var p = em.pts[Math.floor(em.pts.length / 2)];
        if (sgn * ((p[0] - it.x) * nx + (p[1] - it.y) * ny) <= 0) return;
        var e = illum(em, occ, cx, cy, sgn * nx, sgn * ny); Etot += e; // osvětlenost na plochu desky (s úhlem dopadu)
        col[0] += e * em.col[0]; col[1] += e * em.col[1]; col[2] += e * em.col[2];
      });
      if (sunOn(scene)) { var lamS = sgn * (nx * sd[0] + ny * sd[1]); if (lamS > 0) { var es = sunIllum(scene, occ, cx, cy) * lamS * Math.cos((scene.sun.elev == null ? 35 : scene.sun.elev) * Math.PI / 180); Etot += es; col[0] += es * sunCol[0]; col[1] += es * sunCol[1]; col[2] += es * sunCol[2]; } }
      if (Etot < 0.5) return;
      var P = boardParams(it), fx = it.x + nx * 0.03, fy = it.y + ny * 0.03;
      var pts = [], n = 7, tx = Math.cos(it.rot), ty = Math.sin(it.rot);
      for (var i = 0; i < n; i++) { var o = (i / (n - 1) - 0.5) * it.len; pts.push([fx + tx * o, fy + ty * o]); }
      ems.push({ pts: pts, nx: nx, ny: ny, z: P.z, E1: Etot * P.k * P.area / Math.PI * P.gain, exp: P.exp, cosCut: 0.02, tilt: it.tiltDeg ? it.tiltDeg * Math.PI / 180 : null,
                 col: [col[0] / Etot, col[1] / Etot, col[2] / Etot], hard: false, omni: false, bounce: true, id: it.id, Ein: Etot });
    });
    return ems;
  }

  function compute(scene, cell) {
    curFaceZ = faceZ(scene.items.find(function (i) { return i.kind === 'person'; }));
    var occ = buildOccluders(scene), ems = emitters(scene, occ), sun = sunOn(scene), sunCol = cctColor(sunCCT(scene));
    var skD = SKY[scene.sky] || SKY.overcast, skyE = scene.outdoor ? skD.E * 2.2 : 0, skyCol = cctColor(skD.cct);
    var W = scene.room.w, H = scene.room.h, nx = Math.ceil(W / cell), ny = Math.ceil(H / cell);
    var R = new Float32Array(nx * ny), G = new Float32Array(nx * ny), B = new Float32Array(nx * ny);
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
      var x = (i + 0.5) * cell, y = (j + 0.5) * cell, k = j * nx + i, r = 0, g = 0, b = 0;
      for (var e = 0; e < ems.length; e++) {
        var v = illum(ems[e], occ, x, y); if (v <= 0) continue;
        r += v * ems[e].col[0]; g += v * ems[e].col[1]; b += v * ems[e].col[2];
      }
      if (sun) { var sv = sunIllum(scene, occ, x, y); if (sv > 0) { r += sv * sunCol[0]; g += sv * sunCol[1]; b += sv * sunCol[2]; } }
      if (scene.outdoor) { r += skyE * skyCol[0]; g += skyE * skyCol[1]; b += skyE * skyCol[2]; }
      R[k] = r; G[k] = g; B[k] = b;
    }
    var refl = scene.outdoor ? 0.02 : ({ dark: 0.03, normal: 0.08, white: 0.15 }[scene.walls || 'normal'] || 0.08);
    var n = nx * ny, mr = 0, mg = 0, mb = 0;
    for (var q = 0; q < n; q++) { mr += R[q]; mg += G[q]; mb += B[q]; }
    var amb = [mr / n * refl, mg / n * refl, mb / n * refl];
    for (var q2 = 0; q2 < n; q2++) { R[q2] += amb[0]; G[q2] += amb[1]; B[q2] += amb[2]; }
    // černá deska = negativní fill: zakryje část okolí, ze které by jinak přišlo rozptýlené světlo (záporný plošný zdroj o jasu okolí)
    var ambM = (amb[0] + amb[1] + amb[2]) / 3;
    scene.items.forEach(function (it) { if (it.kind !== 'bounce' || !it.black || ambM <= 0) return;
      var nx = Math.cos(it.rot + Math.PI / 2), ny = Math.sin(it.rot + Math.PI / 2); if (it.flip) { nx = -nx; ny = -ny; }
      [1, -1].forEach(function (sd) { var pts = [], tx = Math.cos(it.rot), ty = Math.sin(it.rot); for (var i = 0; i < 7; i++) { var o = (i / 6 - 0.5) * it.len; pts.push([it.x + sd * nx * 0.03 + tx * o, it.y + sd * ny * 0.03 + ty * o]); }
        ems.push({ pts: pts, nx: sd * nx, ny: sd * ny, z: 1.5, tilt: it.tiltDeg ? sd * it.tiltDeg * Math.PI / 180 : null, E1: -ambM * 0.5 / Math.PI * it.len * 1.0, exp: 1, cosCut: 0.02, col: [1, 1, 1], hard: false, omni: false, bounce: true, neg: true, id: it.id }); }); });
    return { nx: nx, ny: ny, cell: cell, R: R, G: G, B: B, ems: ems, occ: occ, amb: (amb[0] + amb[1] + amb[2]) / 3, ambCol: amb, faceZ: curFaceZ };
  }

  // měření na postavě: světlá a stinná strana obličeje (vždy vzhledem k natočení postavy)
  function measure(scene, res) {
    var person = scene.items.find(function (i) { return i.kind === 'person'; });
    if (!person) return null;
    curFaceZ = faceZ(person);
    var r = 0.125, out = [], base = person.rot;
    [0.75, -0.75].forEach(function (off) {
      var a = base + off, nx = Math.cos(a), ny = Math.sin(a);
      var x = person.x + nx * r, y = person.y + ny * r, E = (res.amb || 0) * 0.5, per = {}, negSum = 0;
      res.ems.forEach(function (em) { var v = illum(em, res.occ, x, y, nx, ny); if (em.neg) { v = Math.max(v, -(res.amb || 0) * 0.5 - negSum); negSum += v; } E += v; if (em.id != null) per[em.id] = (per[em.id] || 0) + v; if (em.win) per.win = (per.win || 0) + v; if (em.door) per.doors = (per.doors || 0) + v; });
      if (sunOn(scene)) { var sv = sunIllum(scene, res.occ, x, y, nx, ny); E += sv; per.sun = sv; }
      if (scene.outdoor) { var skD2 = SKY[scene.sky] || SKY.overcast, se = skD2.E * 2.2 * 0.5 * (0.6 + 0.4 * Math.max(0, -(nx * 0) )); E += se; per.sky = se; }
      E = Math.max(0.05, E); out.push({ x: x, y: y, E: E, per: per });
    });
    var a = out[0].E, b = out[1].E, hi = Math.max(a, b), lo = Math.max(Math.min(a, b), 0.01);
    var bright = a >= b ? out[0] : out[1], dark = a >= b ? out[1] : out[0];
    return { sides: out, lux: hi, lo: lo, ratio: hi / lo, stops: Math.log(hi / lo) / Math.LN2, per: bright.per, perDark: dark.per };
  }

  var API = { ceilHeight: ceilHeight, envSegs: envSegs, sunCCT: sunCCT, sunE: sunE, isNight: isNight, MODS: MODS, FIXTURES: FIXTURES, SKY: SKY, POSES: POSES, FORMATS: FORMATS, fovs: fovs, exteriorTrees: exteriorTrees, GOBOS: GOBOS, BLINDS: BLINDS, blindOf: blindOf, SUN_E: SUN_E, SUN_CCT: SUN_CCT, WIN_Z0: WIN_Z0, WIN_Z1: WIN_Z1, wallLen: wallLen, wallPoint: wallPoint, sunDir: sunDir, sunOn: sunOn, sunVisible: sunVisible, DOORLIGHT: DOORLIGHT, FURNITURE: FURNITURE, MODELS: MODELS, credits: credits, seatUnder: seatUnder, carSeat: carSeat, carSlide: carSlide, deskSpots: deskSpots, autoTilt: autoTilt, GRIDS: GRIDS, boardParams: boardParams, diffusedBy: diffusedBy, sofaSeats: sofaSeats, ENVS: ENVS, FURN_GROUPS: FURN_GROUPS, FACE_Z: FACE_Z, faceZ: faceZ, openings: openings, corners: corners, isTall: isTall, compute: compute, measure: measure, cctColor: cctColor, kelvinRGB: kelvinRGB, lightEmitter: lightEmitter, lightParams: lightParams };
  if (typeof module !== 'undefined') module.exports = API; else root.LightSim = API;
})(this);
