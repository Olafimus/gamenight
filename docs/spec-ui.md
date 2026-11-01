# UI-Spec (Design & Screens)

**Sprache: durchgehend Deutsch.** Dark-Theme only. Mobile-first (Spiel wird am Handy am Tisch bedient), skaliert bis Desktop. Kein DOM-Gefummel – alle Zustände über React-State. Barrierearm: Labels, Fokus-Ringe, Richtig/Falsch nie nur über Farbe (✓/✗ Symbol + aria-pressed).

## Design-Tokens (CSS-Variablen in `apps/web/src/styles/tokens.css`)
| Token | Wert | Verwendung |
|---|---|---|
| --bg | #141414 | Seite |
| --surface | #1e1e1e | Karten/Panels |
| --surface-2 | #191919 | Modal |
| --text | #ffffff | Text |
| --cream | #faebd7 | Akzent-Text, Hover-Invert |
| --teal | rgb(11,181,166) | Kacheln, Primär-Links |
| --teal-hover | rgb(0,220,200) | |
| --cyan | #02aff0 | Spielerkarte, Rahmen rgb(180,220,255) |
| --green | #25d366 | richtig / Primäraktion |
| --green-dark | #008800 | „Nächste Runde“ |
| --red | #ff3131 | falsch / Entfernen |
| --red-dark | #900603 | „Letzte Runde“ |
| --iris | #505ac9 | Sekundär-Buttons |
| --blue | #304ffe | Suche |
| --magenta | #880e4f | „Bekannte Spieler“ |
| --yellow | #ffd60a | Reset (schwarzer Text) |
| --orange | #f57c00 | Korrekturmodus |
| --gold / --silver / --bronze | rgb(205,167,0) / silver / #cd7f32 | Medaillen |
| --radius-sm/md/lg/pill | .4rem / 1rem / 1.5rem / 999px | |

Schrift: Roboto (Google Fonts, 400/500/700/900), letter-spacing 1px wie Original. Rundenkopf-Text mit dunklem Text-Shadow.
Markenzeichen: **schräge Listenzeilen** (`skewX(-25deg)` / `15deg`, Inhalt gegen-geschert) für Startliste, Bestenliste, Abschlusstabelle. Große abgerundete Kacheln mit Bild (blend-mode luminosity, Hover normal + scale 1.01).
Animationen 0.2–0.4s, Modal slide-in von oben, `prefers-reduced-motion` beachten.

## Komponenten-Bibliothek (`apps/web/src/ui/`)
Button (Varianten: primary, secondary, danger, ghost, success; Größen sm/md/lg; disabled-Zustand sichtbar), IconButton, Modal (Header/Body/Footer, ESC + Backdrop schließen, Fokusfalle), ConfirmDialog, Dropdown/Menu, Tile (Kachel mit Bild), SkewRow, NumberInput (pill, große Ziffern, +/- Stepper für Touch), CheckToggle (✓/✗ Paar), Tabs/Segmented (für 32/52/64 und Filter-Chips), PageHeader (Logo-Home-Link links, Titel, Zurück-Button), Spinner, EmptyState, ErrorState, RelativeTime (deutsch, „vor 5 Min.“), Toast.

## Screens
- `/` Start: Logo (`assets/logo_transparent.png`, 320px), 3 Kacheln „Spielen“ (cards.svg) → /game, „Zuschauen“ (binoculars2.png) → /watch, „Statistiken“ (statistic.svg) → /stats. 1 Spalte mobil, 3 ab 1000px. Oben rechts: Login-Status („Anmelden“ bzw. Benutzername + Abmelden). Wenn ein Match läuft: Banner „Laufendes Match fortsetzen“.
- `/login`, `/register`: einfache Formulare, Fehlermeldungen deutsch, nach Erfolg zurück zur vorherigen Seite. Hinweis: „Ohne Konto spielen geht auch – dann zählen deine Matches nicht in der Bestenliste.“
- `/game` Setup: links Hinzufügen-Bereich (Tabs/Buttons „Bekannte“, „Suchen“ (registrierte User), „Neu (Gast)“ mit Eingabe + „+“; eingeloggter User per Button „Mich hinzufügen“), rechts/unten Startliste (schräge Zeilen, Drag-Handle, Pfeile, X, Badge „Gast“/„Konto“). Darunter Deck-Segment 32/52/64, „Max. Karten“-Eingabe, „N Runden“, großer „Spiel starten“-Button (#5d8a11-Stil mit 3D-Schatten; deaktiviert < 2 Spieler).
- `/game` laufend: fixer Kopf (Rundeninfo, Sortieren-Dropdown links, Hamburger rechts, Sync-Status-Punkt), Grid Spielerkarten (cyan, `repeat(auto-fill,minmax(300px,1fr))`, mobil 1 Spalte, kompakt), fixe Aktionsleiste unten (Letzte Runde als Pfeilform links, alle ✗, Reset, alle ✓, Nächste Runde als Pfeilform rechts); Seite hat genug padding-bottom.
- `/game/scoreboard`, `/game/ceremony`, `/game/stats` (siehe spec-game.md). Ohne laufendes Match → Hinweis + Link zu /game.
- `/watch` Lobby: Titel „Finde dein Match“, Segment „Aktive Matches“ / „Alle Matches“, Suchfeld „Match-Code oder Spieler suchen“, Liste (Code · Spielerzahl | Namen (ellipsis) · Runde x/y · relative Startzeit), abwechselnde Zeilen (`rgba(0,202,253,.15)`), live aktualisiert (SSE-Lobby-Stream), Leerzustand passend zum Filter. Eingabe eines Codes direkt → /watch/:code.
- `/watch/:code` Live: „Runde x von y · Geber: Name“, Tabelle Platz · Name · Ansage (aktuelle Runde) · Punkte, sortiert nach Platz, Zeilenfarbe letzte Runde richtig `rgb(0,92,75)` / falsch `#9b0000` / neutral `rgb(68,68,68)`; Umschalter „Tabelle / Scoreboard“; „Live“-Indikator (verbunden/neu verbinden); bei Spielende Banner mit Endstand/Podest-Kurzansicht.
- `/stats` Übersicht: Kacheln „Aktuelles Match“, „Bestenliste“, „Matches“, „Auf diesem Gerät“.
- `/stats/players`, `/stats/players/:id`, `/stats/matches`, `/stats/local` (siehe spec-stats.md). Alle mit Lade-, Leer- und Fehlerzustand.
