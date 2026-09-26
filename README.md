# Viewfinder Light – simulátor nasvícení

Interaktivní nástroj pro plánování svícení scény (rozhovor, portrét, noční interiér).
Půdorys s orientační fotometrií + 3D náhled toho, co uvidí kamera.

## Spuštění

Stačí otevřít `index.html` v prohlížeči (Chrome, Edge, Firefox, Safari). Nic se neinstaluje,
Three.js je přibalen ve složce `vendor/`, aplikace funguje i offline.

## Co umí

- **Půdorys** – mapa osvětlenosti ve výšce obličeje (1,5 m), stíny od vlajek, postavy a nábytku,
  jeden odraz od odrazek, rozptyl od stěn, zebra pro přepal, obrysy paprsků a záběru kamery.
- **Pohled kamery (3D)** – místnost, postava, světla se stojany, okno, odrazky a vlajky.
  Ohnisko, výška a náklon kamery, fyzikálně škálované intenzity (softbox = plošné světlo,
  reflektor = spot se stíny, tuba/praktikál = bodové světlo). Expozice je svázaná s měřákem
  („exponovat na obličej“). Tlačítko **Volný pohled** přepne na volnou orbitální kameru.
- **Měřák** – luxy na světlé straně obličeje, poměr světlá : stinná strana v EV, orientační ISO
  při f/2,8 a 1/50 s, příspěvek každého zdroje na světlou i stinnou tvář.
- **Objekty** – COB 100/300/600 W s modifikátory (reflektor, fresnel se zoomem, softboxy, oktabox,
  lampion, deštník, difuzní rám), LED tuba, praktikál, postava, kamera, vlajka, odrazka
  (bílá/stříbrná/černá). U světel výška, výkon, teplota, voština, difuze, klapky, gel.
- **Postava** – jednoduchá kloubová figura (trup, paže, nohy, hlava). Umí stát nebo sedět
  (na židli, která se přikreslí automaticky, nebo ji posaď na gauč či křeslo). Sedící postava má
  obličej ve výšce 1,2 m, stojící 1,5 m – měřák i kamera to respektují.
- **Nábytek z boxů** – židle, gauč, křeslo, stůl, konferenční stolek, skříň, postel, regál, obecný
  blok. Otočitelný, s nastavitelnou šířkou a hloubkou; vysoké kusy (skříň, regál) stíní.
- **Kreslení zdí** – nástroj **Zeď** nad půdorysem (klávesa W): táhni a vznikne rovná příčka
  (vodorovně/svisle, se Shiftem šikmo po 15°), při kreslení vidíš délku v metrech. Zeď má plnou
  výšku, stíní a ve 3D je z ní stěna. Konce zdi jdou chytit a posunout, mezera mezi zdmi = průchod.
- **Okna** – nástroj **Okno** (klávesa O): táhni podél vnější nebo nakreslené zdi, označený úsek
  se stane oknem (parapet 0,9 m, nadpraží 2,1 m). Oken může být libovolný počet, seznam je v panelu
  „Okna a obloha“. Okna ve vnějších stěnách svítí oblohou, okna v příčkách jsou průhledný otvor.
- **Slunce** – zapni „Přímé slunce“, nastav výšku nad obzorem a směr (posuvník, nebo chyť žlutý
  kotouč vně místnosti v půdorysu a táhni ho). Slunce svítí okny dovnitř: v půdorysu vzniká
  sluneční skvrna (počítá se výška okna i výška obličeje), ve 3D vrhá ostré stíny. Odrazka umí
  slunce odrazit.
- **Rolety** – u každého okna zvlášť: otevřená, napůl, zatažená. Roleta stahuje okno shora,
  omezuje světlo oblohy i slunce a ve 3D je vidět jako panel s lamelami.
- **Gobo** – u tvrdých světel (reflektor, fresnel, holá hlava) volba promítaného tvaru: okno se
  4 nebo 6 tabulkami, žaluzie, lamely, listí, větve, kruh, mříž, tečky, kříž. Ve 3D se promítá
  na stěnu i postavu, půdorys počítá s propuštěným podílem světla.
- **Mlhostroj** – posuvníky „Mlha“ a „Zrno“ v Zobrazení: mlha lehce zešedí obraz do dálky
  v tónu převládajícího světla, tvrdá i měkká světla v ní ukážou světelný kužel a slunce
  paprsek oknem, zrno přidá filmový šum (i do exportu snímku).
- **Vzhled 3D** – procedurální textury omítky, dřevěných prken, betonu a látek; postava s trupem,
  pažemi, nohama, obličejem a volbou barvy oblečení; světla a odrazky na C‑stojanech, kamera na
  stativu; gauč a křeslo s polštáři, postel s dekou, regál s knihami.
- **Chůze kamerou** – v pohledu kamery: W/S vpřed a vzad, A/D do stran, Q/E dolů a nahoru,
  levé tlačítko myši = rozhlížení, kolečko = ohnisková vzdálenost. Kamera v půdorysu se
  posouvá s tebou.
- **Exteriér** – zapnutím „Zahrada kolem domu“ vznikne venku tráva, obloha, obrubník a stromy
  (počet nastavitelný, rozmístění je dané rozměry domu). Okna jsou pak průhledná a je vidět ven,
  slunce vrhá stíny stromů i domu. V půdorysu jsou stromy jako zelené kruhy.
- **Formát záběru** – v pohledu kamery volba volný / 4:3 / 16:9 / 9:16 / 2.39:1 cinemascope;
  záběr se zobrazí s maskou, ohnisko se přepočítá na daný formát (full frame 36 mm) a snímek
  kamery se exportuje oříznutý na formát. Výseč záběru v půdorysu formát respektuje.
- **Box (Š×H×V)** – obecný kvádr s nastavitelnou šířkou, hloubkou a výškou, materiálem (dřevo,
  bílá, tmavá, kov, beton, látka) a popiskem – pro kuchyňskou linku, lednici, auto v garáži apod.
  Box vyšší než 1,3 m stíní.
- **Postava** – tři realistické 3D modely (muž, dvě ženy; riggované postavy Renderpeople ze
  Sketchfabu, klipy stání a sezení z Mixama přemapované na jejich kostru) plus stylizovaná figura
  s volbou účesu, barvy vlasů, pleti a oblečení. Modely jsou ve složce `models/` (asi 2 MB každý),
  načítají se až při použití. Výška obličeje pro měření odpovídá modelu.
- **Šablona Dům s garáží** – 12×9 m, kuchyně, obývák, ložnice a garáž z nakreslených zdí, okna,
  vchod a garážová vrata, nábytek z boxů, zahrada se stromy a slunce.
- **Cvaky (lišta dole)** – tlačítko „📸 Cvaknout“ (klávesa C) uloží záběr kamery, schéma
  půdorysu, hodnoty měřáku, seznam světel a celý stav scény. Cvaky se řadí v liště, jdou přejmenovat,
  opatřit poznámkou, přesouvat, uložit jako JPG nebo z nich obnovit scénu. Ukládají se v prohlížeči
  (IndexedDB), nejsou součástí JSON scény.
- **PDF storyboard** – všechny cvaky do PDF (A4 na šířku): záběr, schéma nasvícení, luxy a poměr,
  ohnisko, formát, varianta, seznam světel, poznámka. Bez externí knihovny, plná diakritika.
- **Varianty nasvícení** – v hlavičce „+ Varianta“ uloží aktuální stav, výběrem se přepíná,
  „Aktualizovat“ přepíše, „✕“ smaže. Varianty jsou součástí scény (JSON, účet).
- **Render (path tracing)** – tlačítko 🎬 Render v pohledu kamery vyrenderuje snímek fyzikálně
  (three-gpu-pathtracer): skutečné odrazy světla od stěn a podlahy, měkké stíny podle velikosti
  zdroje, správně prosvětlené rohy. Běží progresivně (vzorky podle zvolené kvality: náhled 32,
  standard 128, ultra 512), na běžné grafice desítky sekund. Výsledek zůstane v pohledu, dokud se
  scéna nezmění; cvak (C) a PNG ho uloží. Vyžaduje WebGL 2 s float texturami (Safari 15+,
  Chrome, Firefox, Edge). Mlha a zrno se do renderu nepromítají.
- **Kvalita zobrazení** – náhled (rychlé rozestavování: nižší rozlišení, malé stínové mapy, hrubší
  výpočet mapy), standard, ultra (měkké stíny softboxů ze čtyř vzorků, ostřejší stíny reflektorů
  a slunce, jemnější mlha, jemnější výpočet mapy). Nastavení kvality nemění výsledky měření.
- **Dveře** – libovolný počet dveří na stěnách, otevřené nebo zavřené. Otevřené dveře jsou otvor
  ve zdi a mohou propouštět světlo z vedlejší místnosti (tma / slabé teplé / silné / denní),
  které se počítá v půdorysu i zobrazuje ve 3D (chodba za dveřmi, otevřené křídlo).
- **Praktické** – seznam objektů s rychlým zapnutím/vypnutím, zpět/znovu, automatické ukládání
  do prohlížeče, šablony, uložení/načtení scény (JSON), export půdorysu a snímku kamery (PNG),
  přichytávání na 10 cm.

## Ovládání

| Akce | Ovládání |
|---|---|
| Přesun | tažení myší, šipky (Shift = 25 cm) |
| Otočení | zlatý bod nebo kolečko myši nad vybraným objektem, Shift = krok 15° |
| Duplikovat / smazat | `D` / `Delete` |
| Cvaknout | `C` |
| Zapnout/vypnout světlo | `H` |
| Zpět / znovu | `Ctrl+Z` / `Ctrl+Y` |
| Přepnout pohled | `1` půdorys + kamera, `2` půdorys, `3` kamera |
| Nástroje půdorysu | `W` zeď, `O` okno, `Esc` výběr |
| Pohled kamery | `W A S D` chůze, `Q E` výška, levé tlačítko rozhlížení, kolečko ohnisko |

## Napojení na WordPress (e‑shop)

Ve složce `wordpress/svh-viewfinder-light/` je samostatný plugin pro WooCommerce. Nahraje se jako
běžný plugin, v administraci (Viewfinder Light) se nahraje ZIP s buildem aplikace a zadají se ID
produktů, jejichž koupě aplikaci odemyká. Zákazník ji pak najde v „Můj účet“ → „Viewfinder Light“
a otevře ji tlačítkem na celou obrazovku. Soubory aplikace se servírují přes PHP až po ověření
nákupu, rozpracovaná scéna se ukládá do účtu (REST), takže je dostupná i z jiného zařízení.
Podrobnosti v `wordpress/README.md`.

## Licence a autoři 3D postav

Modely postav jsou pod licencí **CC BY 4.0** a vyžadují uvedení autora (aplikace to dělá v dialogu
ⓘ, u výběru postavy a v patičce PDF):

- Žena 1 – bílá halenka: **Renderpeople**, sketchfab.com
- Žena 2 – sako: **Renderpeople**, sketchfab.com
- Muž – vesta a kravata: **1-3D.com**, sketchfab.com
- Pózy: animace Mixamo (Adobe), přemapované na kostru modelů

## Struktura

- `index.html`, `style.css` – rozhraní
- `sim.js` – simulační jádro (bez závislostí, jde použít i v Node)
- `view3d.js` – 3D pohled (Three.js)
- `app.js` – půdorys, interakce, panely
- `vendor/three-bundle.js` – Three.js 0.160 + OrbitControls + RectAreaLight + GLTFLoader + SkeletonUtils (esbuild)
- `vendor/pathtracer-bundle.js` – three-gpu-pathtracer 0.0.23 (MIT), načítá se až při prvním renderu
- `models/*.glb.js` – 3D postavy (glTF zabalené v base64 skriptu, aby se načetly i z disku přes file://) s klipy `idle` a `sit`; zdrojové `.glb` se v repozitáři neverzují

Simulace je orientační: hodnoty luxů jsou přibližné, ale principy (vzdálenost, velikost zdroje,
směr, stíny, poměr světel) odpovídají realitě. 3D pohled je náhled, ne fotometrický render.
