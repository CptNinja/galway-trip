# Ontwerp van de Galway-app

Deze app gaat mee de kroeg in. Alles wat hieronder staat is gekozen voor één
hand, een felle zon of een donkere pub, en voor het feit dat mensen hem tachtig
keer per avond openslikken. Het is geen landingspagina.

## Wat de app moet aanvoelen

Een goed gedrukt pubboekje: donker groen, room, één gouden accent dat alleen
oplicht waar het ertoe doet. Rustig, ruim, leesbaar. Liefst zo saai dat niemand
eraan ziet dat hij door een computer is opgeschreven.

## Kleuren

| Token      | Waarde    | Gebruik                                        |
| ---------- | --------- | ---------------------------------------------- |
| `--bg`     | `#0a1f18` | achtergrond, overal egaal                      |
| `--surface`| `#123027` | kaarten, ze zijn allemaal hetzelfde vlak       |
| `--vlak`   | `#193a2f` | alleen binnen een kaart (lijst, invoer)       |
| `--line`   | `#2f5645` | hairlines, de enige scheiding                  |
| `--ink`    | `#f4ead3` | tekst                                          |
| `--muted`  | `#a9c1b3` | tweede tekst, altijd ≥ 4,5:1 op `--surface`    |
| `--gold`   | `#e3c169` | knoppen, punten, focusring, één ding per scherm|
| `--alert`  | `#c4756a` | slopen en fouten                               |

Goud is spaarzaam: een scherm met drie gouden elementen heeft er twee te veel.

## Type

Systeemletter, geen geïmporteerde fonts (de app werkt offline).

- h1 `1.375rem` / 700, room, geen schreefletter en geen cursief.
- h2 `1.0625rem` / 700, `--ink`; koppen schreeuwen niet, ze ordenen.
- body `1rem` / 1.5; `small` en `.muted` nooit kleiner dan `0.8125rem`.
- Navigatie `0.75rem`. Kleiner dan 12px bestaat niet in deze app.
- `letter-spacing` alleen positief voor losse labeltjes, nooit uppercase met
  wijde spaties als versiersel.

## Vorm

- Radius 10px, kaarten 12px. Niet ronder.
- Scheidingen met `1px solid var(--line)`. Schaduwen alleen op zwevende lagen
  (dialog, toast), daar 0 2px 8px #0006. Kaarten hebben geen schaduw en geen
  kleurverloop: hun rand is hun vorm.
- Afstanden op een 4px-raster: 4, 8, 12, 16, 24, 32.
- Alle knoppen minstens 44px hoog.

## Wat verboden is

Deze lijst is samengesteld uit wat mensen zelf noemen als "dit is door een
computer gemaakt". De app doet geen van allen:

1. Gloeiende kleurplaspots op de achtergrond (`radial-gradient`-vlekken).
2. Reuzengrote symbolen als watermerk door een header of kaart heen.
3. Volgelopen kleurverlopen in kaarten, knoppen of headers.
4. Schaduwsoep: elke kaart een eigen zachte klap.
5. Doorzichtige, vervaagde navigatiebalken (frosted glass).
6. Gouden lustige woordjes in hoofdletters met wijde letterspatie boven
   titels (eyebrows).
7. "Premium"-koppen met schreefletters, cursief of drie kleuren in één regel.
8. emoji als bedieningselement of lijsticoon.
9. Animaties zonder boodschap (pulse, zwevende kaarten, schudden).
10. Knoppen die bij het indrukken krimpen (`transform: scale`).
11. Tekst kleiner dan 12px.
12. Geen zichtbare focusring voor mensen met een toetsenbord.
13. Beweging die niet uitgezet kan worden met `prefers-reduced-motion`.

Mag wél: één rustige animatie waar hij informatie overdraagt (het rad dat
uitdraait, het slot dat rolt), kort en met een begin en een eind, en altijd
stilstaand bij `prefers-reduced-motion`.

## Iconen

Waar een symbool iets moet aanduiden (bewerken, verwijderen, sluiten) staat een
inline-tekening in een viewBox van 24 bij 24, lijndikte 1,7px in `currentColor`.
Geen emoji, geen icoonfont, geen extern bestand — het symbool kleurt mee met de
tekst en weegt niets in de download. Een knop met alleen een symbool is vierkant
van 44 bij 44 en krijgt altijd een `aria-label` en `title`, zodat de functie ook
in de toegankelijke naam staat. Een rij met acties houdt het op twee symbolen en
de verwoestende staat als rood rechts. De helper `ico(naam)` en de knopvariant
`ibtn(naam, tekst, actie, klasse)` in `index.html` zijn de enige plek waar
symbolen gedefinieerd worden; `controle/ontwerp.mjs` faalt op een knop zonder
naam en `controle/rondloop.mjs` op een actieknop zonder of met een te klein
symbool.

## Tekst

Nederlands met Ierse kleur, zoals de groep het zelf zou zeggen. Kleine letters,
eerlijk, soms grappig, nooit "Ontdek de magie van". Lege staten leggen uit wat
er hoort te staan; knoppen zeggen wat ze doen ("Publiceer app" niet "Aan de
slag"). Fouten noemen wat er misging en wat daarna te doen.

## Toetsen

Na elke stijlwijziging:

```
node controle/ontwerp.mjs
```

Die opent de app in een echte browser (Chrome met `--remote-debugging-port=9333`,
dev-server op 8765; commando's staan in het kopje van het script) en meet de
berekende stijl. Hij faalt op: kleurverloop of schaduw op kaarten, een gloed op de
achtergrond, emoji als watermerk of icoon, vervaagde navigatie, koppen met
letterspatie in hoofdletters, ontbrekende focusringen, ontbrekende
bewegingsuitzondering, knoppen die krimpen bij indrukken, oneindige animaties,
zichtbare tekst onder 12px, tikdoelen onder 40px, contrast onder 4,5:1, knoppen
zonder toegankelijke naam, aktieknoppen zonder of met te klein symbool, en
horizontaal schuif op 390px breed. De schermafbeeldingen van elke pagina komen in
`controle/scherm/`.

Ernaast staan `controle/pwa.mjs` (manifest, service worker en offline herladen),
`controle/rondloop.mjs` (elke tab en subpagina doorlopen) en
`controle/wedstrijd.mjs` (de duelspellen in een namaak-DOM).
