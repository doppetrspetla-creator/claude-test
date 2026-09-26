# LightLab – simulátor nasvícení

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
| Zapnout/vypnout světlo | `H` |
| Zpět / znovu | `Ctrl+Z` / `Ctrl+Y` |
| Přepnout pohled | `1` půdorys + kamera, `2` půdorys, `3` kamera |
| Nástroje půdorysu | `W` zeď, `O` okno, `Esc` výběr |

## Struktura

- `index.html`, `style.css` – rozhraní
- `sim.js` – simulační jádro (bez závislostí, jde použít i v Node)
- `view3d.js` – 3D pohled (Three.js)
- `app.js` – půdorys, interakce, panely
- `vendor/three-bundle.js` – Three.js 0.160 + OrbitControls + RectAreaLight (sestaveno přes esbuild)

Simulace je orientační: hodnoty luxů jsou přibližné, ale principy (vzdálenost, velikost zdroje,
směr, stíny, poměr světel) odpovídají realitě. 3D pohled je náhled, ne fotometrický render.
