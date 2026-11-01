# Spiel-Spec (Regeln & Ablauf)

Quelle: Analyse der Original-App `Scheisse-App-React`. Die App ist ein **reiner Punktezähler**, Karten/Stiche werden nicht simuliert.

## Setup
- Spieler hinzufügen: registrierter User oder früherer Gast (Suche über `GET /api/players?search=`), zuletzt benutzte Spieler auf diesem Gerät (lokal gemerkt), oder neuer **Gast** (nur Name, `userId: null`).
- Name: erster Buchstabe groß (`firstUpper`), getrimmt. Doppelte Namen im selben Match verboten (case-insensitive) → Hinweis „Spieler bereits hinzugefügt!“. Ein User kann nur einmal pro Match vorkommen.
- Reihenfolge = Sitzordnung = Geberreihenfolge. Umsortieren per Drag & Drop **und** Pfeil hoch/runter, Entfernen per X.
- Deckgröße: 32 | 52 | 64 (Default 32).
- „Max. Karten“: optional 1..floor(deck/n). Leer = Maximum. Wird zurückgesetzt, wenn er nach Änderung von Deck/Spielerzahl zu groß ist. Anzeige: aktueller Cap oder das Maximum als Placeholder.
- Anzeige vor Start: „N Runden“ (= 2·peak−1).
- Start nur mit ≥ 2 Spielern (max 10). Erster Geber = erster Sitzplatz.

## Runden
- peak = maxCards ?? floor(deck/n); Runden = 2·peak − 1; Karten in Runde r = r ≤ peak ? r : 2·peak − r (1,2,…,peak,…,2,1). **Der Cap wird hier berücksichtigt** (Original-Bug behoben).
- Kopf: „Runde r von R“, „Geber: Name“, „Stiche: Σ Ansagen / Karten dieser Runde“ – grün wenn gleich, sonst rot (nur Hinweis, keine Sperre – wie Original).
- Pro Spieler: Ansage-Eingabe (Zahl ≥ 0, max = Karten dieser Runde), Buttons ✓ / ✗ („Richtig?“). Erneutes Markieren überschreibt.
- Leiste: „Letzte Runde“ (Undo) · „alle ✗“ · „Reset“ (Ansagen + Markierungen der laufenden Runde leeren) · „alle ✓“ · „Nächste Runde“ (nur aktiv, wenn alle markiert – sichtbar deaktiviert sonst).
- Wertung: richtig → +10 + Ansage; falsch → −10 (Ansage egal). Punkte können negativ werden.
- Platzierung nach jeder Runde: Rang = 1 + #(Spieler mit strikt mehr Punkten), Gleichstand teilt den besten Rang. Anzeige „Name · 1.“.
- Geber rückt nach jeder Runde einen Sitz weiter (wrap).
- Nach der letzten Runde: Spiel beendet → Leiste wird zu „Zur Siegerehrung“.
- Undo („Letzte Runde“): letzte gewertete Runde entfernen, deren Ansagen **und** Markierungen in die laufende Runde zurückholen, Geber zurück. Auch nach Spielende möglich (Original nicht – bewusst verbessert). Alle Statistiken werden neu abgeleitet.
- Korrektur (Scoreboard, „Einträge korrigieren“): Zelle anklicken → Popover mit Runde, Ansage-Eingabe, ✓/✗-Toggle, Abbrechen/Speichern. Alles (Summen, Platzierungen, Streaks) wird neu abgeleitet.

## Sortierung der Spielerkarten (nur Anzeige)
Menü/Dropdown „Sortieren“: „Sitzordnung“ (Default), „Nach Platzierung“ (Rang aufsteigend, vor Runde 1 Sitzordnung), „Geber zuerst“ (Sitzordnung rotiert, sodass der aktuelle Geber oben steht). Ändert nicht die Sitzordnung.

## Einstellungen (Modal im laufenden Spiel)
- Anzeige: Spielerzahl, Deck, Runden, Match-Code (für Zuschauer, mit Kopier-Button).
- Deck ändern (32/52/64) – abgelehnt mit Meldung, wenn bereits mehr Runden gespielt als dann erlaubt.
- Sitzordnung ändern (DnD + Pfeile) mit Speichern/Abbrechen (Abbrechen verwirft wirklich).
- Geber setzen (Dropdown).

## Menü (Hamburger, laufendes Spiel)
Start · Scoreboard · Statistik (aktuelles Match) · Einstellungen · „Noch ein Match“ (gleiche Spieler, neue Runden; Bestätigung) · „Spiel beenden“ (alles zurück zum Setup leeren; Bestätigung).

## Siegerehrung
- Podest: 2. – 1. – 3. (bei 2 Spielern bleibt Platz 3 leer). Animation: Blöcke wachsen (1. höchster), Namen blenden ein, dann wackeln; danach wird die Abschlusstabelle („# / Name / Punkte“) eingeblendet, Zeilen gleiten nacheinander herein (schräge Zeilen, Gold-Verlauf `#ffb003→#ffcb03` / Grün-Verlauf `#39b385→#9be15d`). Mobil: untereinander, responsive Breiten. `prefers-reduced-motion` respektieren.
- Gleichstand: gleicher Rang, Reihenfolge nach Sitz.

## Scoreboard
Tabelle: Spalte „Runde“ + je Spieler; Zelle = „Ansage ┊ Gesamtpunkte“; Färbung nach Platzierung in dieser Runde (Gold `rgb(205,167,0)`, Silber, Bronze `#cd7f32`); im Korrekturmodus Färbung richtig/falsch (`#43a048b0` / `#d32f2fa9`), oranger Rahmen `#ff9800`. Gleiche Komponente read-only für Zuschauer.

## Statistik zum aktuellen Match
Pro Spieler (aufklappbar): Siegesserie aktuell/max, Pechsträhne aktuell/max, Runden auf Platz 1, Runden auf letztem Platz, max. gewonnene Stiche, max. angesagte Stiche.
Allgemeine Listen (je absteigend sortiert, Duplikate des Originals entfernt): Aktuelle Serien (+n Siege / −n Niederlagen), Meiste 1. Plätze, Meiste letzte Plätze, Längste Siegesserie, Längste Pechsträhne, Meiste angesagte Stiche, Meiste gewonnene Stiche.

Streak-Regeln pro Runde: richtig → winStreak++, loseStreak=0, onWinStreak=true, maxWonStiche=max(bid); falsch → loseStreak++, winStreak=0, onWinStreak=false. maxCalledStiche=max(bid) immer. firstPlaces++ wenn Rang 1 nach dieser Runde; lastPlaces++ wenn Rang == Spielerzahl.

## Persistenz & Sync (Web)
- Laufender Match in localStorage (Zustand persist) → Reload setzt exakt fort.
- Beim Start `POST /api/matches` → `{match, writeToken}` speichern. Jede Änderung → `PUT` mit 300 ms Debounce (sofort bei Spielende). Bei Netzwerkfehler weiterspielen, Status-Indikator („offline – wird synchronisiert“), später erneut senden. Bei 409: lokalen Zustand behalten und mit neuer Version erneut senden (dieses Gerät ist die Quelle der Wahrheit).
- Beendete Matches (Code, Datum, Spieler, Ergebnis) lokal in einer Geräte-Historie für „Lokale Statistik“; zuletzt benutzte Spieler lokal gemerkt.
