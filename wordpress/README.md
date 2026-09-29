# Viewfinder Light – napojení na WordPress / WooCommerce

Samostatný plugin `svh-viewfinder-light` zpřístupní aplikaci zákazníkům, kteří koupili
vybrané produkty (kurzy). Nezávisí na pluginu svh-kurzy, používá stejné principy:
build v `uploads/` chráněný před přímým přístupem, servírování přes PHP po ověření nákupu
(jen dokončená objednávka), záložka v „Můj účet“, vodoznak e‑mailu.

## Instalace

1. **Plugin:** Pluginy → Přidat → Nahrát: `svh-viewfinder-light.zip` → aktivovat.
2. **Build aplikace:** v menu **Viewfinder Light** nahrát `viewfinder-light-build.zip`
   (obsah: `index.html`, `app.js`, `sim.js`, `view3d.js`, `style.css`, `vendor/three-bundle.js`, `models/*.glb.js`).
   Verze se rovnou aktivuje. Starší verze zůstávají a jdou přepnout nebo smazat.
3. **Produkty:** do pole „ID produktů“ zadat ID kurzů (produktů), jejichž koupě aplikaci odemyká,
   oddělené čárkou. Správci WooCommerce mají přístup vždy.
4. Volitelně text karty v „Můj účet“ a zkratka `[viewfinder_light_button]` na libovolnou stránku.

## Co zákazník vidí

- V „Můj účet“ přibude záložka **Viewfinder Light** (jen když má nákup) s tlačítkem
  **Otevřít aplikaci na celou obrazovku**. Aplikace se otevře jako samostatná stránka bez šablony
  webu, v hlavičce má „← Můj účet“ a přepínač celé obrazovky.
- Rozpracovaná scéna se automaticky ukládá do účtu (REST `svhvl/v1/scene`), takže ji najde i na
  jiném zařízení. Novější verze (podle časové značky) má přednost před tou v prohlížeči.
- **Vstup do aplikace v objednávce** (od verze 1.1.0): aplikace je virtuální produkt, takže u
  **dokončené** objednávky se do e‑mailu zákazníkovi (Dokončená objednávka), na děkovací stránku
  a do detailu objednávky v „Můj účet“ vkládá blok **VSTUP DO APLIKACE** s tlačítkem a textem,
  že se do aplikace lze kdykoli vrátit po přihlášení v „Můj účet → Viewfinder Light“. U ostatních
  stavů (zpracovává se, čeká na platbu, zrušeno…) se odkaz neposílá. Nákup bez účtu vyzve
  k přihlášení či založení účtu se stejným e‑mailem. V e‑mailech pro správce se blok nezobrazuje.
- **Přístup** do aplikace dává jen **dokončená** objednávka některého z nastavených produktů
  (objednávky účtu i objednávky bez účtu se stejným e‑mailem). Správci WooCommerce mají přístup vždy.
- **Instalace do počítače / tabletu (PWA, od verze 1.2.0):** aplikace má vlastní adresu
  `/viewfinder-app/` a v hlavičce tlačítko **⤓ Nainstalovat** (Chrome/Edge nabídnou instalaci,
  Safari na Macu „Soubor → Přidat do Docku“, iPad „Sdílet → Přidat na plochu“). Nainstalovaná
  aplikace má vlastní ikonu a okno a běží i **bez internetu**. Při každém spuštění online si e‑shop
  ověří přihlášení a nákup (nepřihlášeného pošle na přihlášení, bez nákupu do „Můj účet“). Bez
  internetu běží z cache jen po nastavený počet dní od posledního ověření (výchozí 30, nastavení
  „Offline bez ověření“), pak ukáže výzvu „Je potřeba ověřit přístup“. Nová verze buildu se do
  nainstalovaných aplikací dostane sama při dalším spuštění online.
  Vyžaduje HTTPS a „hezké“ trvalé odkazy (Nastavení → Trvalé odkazy); bez nich aplikace běží
  jen v prohlížeči jako dosud. Staré odkazy `/?svhvl_app=index.html` se přesměrují.
- Bez přihlášení vede adresa aplikace na přihlášení, bez nákupu zpět na „Můj účet“.
  Soubory buildu nejde stáhnout přímo (`.htaccess` + `index.php` v kořeni buildů).

## Adresy

- Aplikace: `/viewfinder-app/` (soubory `/viewfinder-app/app.js?v=<verze>`, service worker
  `/viewfinder-app/sw.js`). Bez hezkých trvalých odkazů `/?svhvl_app=index.html`.
- Záložka: `/muj-ucet/viewfinder-light/` (endpoint se registruje při aktivaci, při potížích uložte
  Nastavení → Trvalé odkazy).

## Sestavení build ZIPu

Ve složce projektu (vygeneruje `sw.js` se seznamem souborů a verzí podle obsahu a zabalí ZIP):

```
node build.mjs viewfinder-light-build.zip
```
