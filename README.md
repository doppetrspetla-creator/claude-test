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
- **Cesta** – nástroj **Cesta** (jen v exteriéru: režim „Jen exteriér“ nebo zahrada kolem domu):
  táhni a vznikne asfaltová cesta. Nastavitelná šířka, přerušovaná středová čára, bílé krajní čáry;
  konce se přichytí ke konci jiné cesty (zatáčka, křižovatka). Do domu cesta nevede.
- **Instalovatelná aplikace (PWA)** – ve verzi z e‑shopu (plugin 1.2.0+) jde aplikaci nainstalovat do
  počítače nebo iPadu (tlačítko ⤓ Nainstalovat), běží ve vlastním okně i bez internetu a nákup si
  pravidelně ověřuje přes účet v e‑shopu. Build se sestavuje `node build.mjs` (vygeneruje `sw.js`).
- **Různá zařízení** – boční lišty mají pevnou šířku, přizpůsobuje se jen obraz uprostřed.
  Na menších obrazovkách jdou méně častá tlačítka (kvalita, varianty, otevřít/uložit, PNG) do nabídky ⋯.
  Tablet (iPad na výšku, do 1180 px): pravá lišta se vysouvá tlačítkem ⚙ Vlastnosti.
  Telefon: jeden pohled s přepínáním Půdorys / Kamera, dole lišta Scéna · Půdorys · Kamera ·
  Vlastnosti · Cvak, obě boční lišty jako výsuvné panely. Na dotykových zařízeních ovládají kameru
  šipky v rohu obrazu (chůze, nahoru/dolů) a dva prsty (sevřít/roztáhnout = ohnisko).
- **Nová místnost / nový exteriér** – v menu Šablona. Zadáte délku, šířku a výšku stropu
  (místnost 3–30 m, strop 2,2–6 m), u exteriéru rozměry do 50 × 50 m, povrch (tráva, asfalt,
  beton), stromy a plot.
- **Zdi zvenku** – obvodové zdi mají fasádu a plochou střechu: kamera venku vidí dům zvenku
  (a okny dovnitř). Zeď se schová jen ve chvíli, kdy jí kamera prochází.
- **Slunce** – zapni „Přímé slunce“, nastav výšku nad obzorem a směr (posuvník, nebo chyť žlutý
  kotouč vně místnosti v půdorysu a táhni ho). Barva slunce se mění s výškou (u obzoru teplá zlatá hodinka, od 25° denní). Slunce svítí okny dovnitř: v půdorysu vzniká
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
- **Pózy** – 12 klipů z Mixama přemapovaných na všechny modely: stojí, sedí, mluví, ukazuje,
  telefonuje, píše (vsedě), jde, tleská, opírá se, rozhlíží se, dřepí, leží. Posuvník „Okamžik
  klipu“ vybere snímek gesta, nesedící pózy se automaticky položí na zem, výška obličeje pro měření
  odpovídá póze. Editor kostry (🦴, klávesa K) doladí jednotlivé klouby.
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
- **Render** – tlačítko 🎬 Render v pohledu kamery spočítá kvalitní snímek: 12/24/48 průchodů
  (podle kvality) s náhodně posunutými zdroji světla a subpixelovým posunem kamery, zprůměrované do
  jednoho obrazu. Výsledkem jsou vyhlazené hrany a měkké stíny odpovídající velikosti zdrojů (softbox,
  okno, slunce). Trvá pár sekund, nezatěžuje paměť, snímek se rovnou uloží do lišty cvaků jako
  „Záběr n (HQ)“ a zůstane v pohledu, dokud se scéna nezmění.
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
- Auto „Classic Muscle car“: **Lexyc16**, sketchfab.com, CC BY 4.0
- Postel „Bed“: **rickmaolly**, sketchfab.com, CC BY 4.0
- Rohový stůl „L shape desk, drawers and shelfs“: **fthylmaz**, sketchfab.com, CC BY 4.0
- Počítač „Desktop Computer“: **Tyler P Halterman**, sketchfab.com, CC BY 4.0
- Kuchyňská linka „Kitchen Counter“: **euanford12321**, sketchfab.com, CC BY 4.0
- Stromy „Tree low poly“: **00amza**, sketchfab.com, CC BY 4.0
- Pracovní stůl „PC Desk“: **Ren Viro Store**, sketchfab.com, CC BY 4.0
- Fotoateliér „Photo Studio“: **Zachey**, sketchfab.com, CC BY 4.0
- Hala „Studio Scan with Cyclorama for realtime VR“: **tojek_vfx**, sketchfab.com, CC BY 4.0 (odstraněno robotické rameno a oktabox)
- Plastové okno „Plastic window“: **Annelida**, sketchfab.com, CC BY 4.0
- Dveře „Door with frame“: **witnessk**, sketchfab.com, CC BY 4.0
- Plot „Fence (Wood)“: **trentspi**, sketchfab.com, CC BY 4.0
- Obloha „FREE - SkyBox Basic Sky“: **Paul**, sketchfab.com, CC BY 4.0
- Postavy: Muž 2 „Fully Rigged Man“ – **Eyasu Biyaylgn**; Muž 3 „Man In Coat“ – **Saitam**; Muž 4 „Rigged T-Pose Human Male“ – **Mike Alger**; Muž 5 „Security Guard“ – **Q.SARDOR**; Žena 3 „Linda“ – **Veterock** (vše sketchfab.com, CC BY 4.0; převedeny na společnou kostru, pózy z Mixama)
- Gauč „Sofa_3230“: **vasycrukov**, sketchfab.com, CC BY 4.0 (zjednodušeno, bez ozdobných polštářů)
- Softbox „Simple Studio Light“: **AleixoAlonso**, sketchfab.com, CC BY 4.0 (hlava softboxu + stativ pro všechna světla)
- Světla ARRI SkyPanel, ARRI 650, Kino Flo, filmová kamera (FBX) a COB s reflektorem „Studio light“ (OBJ): autor bude doplněn

Modely nábytku jsou zmenšené pro web (zjednodušená síť postele, textury 512 px JPEG) a zabalené
v `models/*.glb.js` stejně jako postavy.

## Struktura

- `index.html`, `style.css` – rozhraní
- `sim.js` – simulační jádro (bez závislostí, jde použít i v Node)
- `view3d.js` – 3D pohled (Three.js)
- `app.js` – půdorys, interakce, panely
- `vendor/three-bundle.js` – Three.js 0.160 + OrbitControls + RectAreaLight + GLTFLoader + SkeletonUtils (esbuild)
- `models/*.glb.js` – 3D postavy (glTF zabalené v base64 skriptu, aby se načetly i z disku přes file://) s klipy `idle` a `sit`; zdrojové `.glb` se v repozitáři neverzují

Simulace je orientační: hodnoty luxů jsou přibližné, ale principy (vzdálenost, velikost zdroje,
směr, stíny, poměr světel) odpovídají realitě. 3D pohled je náhled, ne fotometrický render.
