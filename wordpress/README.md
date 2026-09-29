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
- Bez přihlášení vede adresa aplikace na přihlášení, bez nákupu zpět na „Můj účet“.
  Soubory buildu nejde stáhnout přímo (`.htaccess` + `index.php` v kořeni buildů).

## Adresy

- Aplikace: `/?svhvl_app=index.html` (ostatní soubory `/?svhvl_app=app.js&v=<verze>`).
- Záložka: `/muj-ucet/viewfinder-light/` (endpoint se registruje při aktivaci, při potížích uložte
  Nastavení → Trvalé odkazy).

## Sestavení build ZIPu

Ve složce projektu:

```
zip -r viewfinder-light-build.zip index.html style.css sim.js view3d.js app.js vendor models/*.glb.js
```
