# Statistik-Spec

Nur **beendete** Matches zählen. Bestenliste/Profile enthalten registrierte User und **Gäste** (Gäste nach `lower(trim(name))` gruppiert, Badge „Gast“, Profil `/stats/guests/:name`). Ein eingeloggter User kann einen Gast per `POST /api/auth/claim-guest` auf sein Konto übernehmen (match_results, match_players und matches.state werden umgehängt; Matches, in denen der User schon selbst spielt, werden übersprungen). Namen sind überall case-insensitiv; ein **neuer** Gast darf nicht heißen wie ein bestehendes Konto (`400 guest_name_taken` bei `POST /api/matches` und bei `PUT`, wenn ein neuer Gast-Platz hinzukommt; bereits gespeicherte Gast-Plätze bleiben gültig). Eine Registrierung mit dem Namen eines bestehenden Gasts ist erlaubt (danach per claim-guest übernehmen).

## Pro Match und Spieler (`match_results`)
`final_score`, `placement` (Wettbewerbs-Rang, Gleichstand teilt besten Rang), `player_count`, `rounds`, `avg_score` (= final_score / rounds), `correct_rounds` (richtig angesagte Runden, aus `DerivedPlayer.correct`), `finished_at` (Zeitpunkt des Matchendes, bleibt bei erneutem Speichern erhalten). Migration `0001_stats_elo` legt die Spalten an und füllt bestehende Zeilen aus `matches.state` / `matches.finished_at` nach (Backfill).
`rating`/`calcMatchRating`/`aggregateResults` bleiben aus Kompatibilitätsgründen in `@gamenight/shared`, werden aber nicht mehr angezeigt.

## Formeln (`packages/shared/src/elo.ts`, reine Funktionen)
- **Elo (mehrspielerfähig)**: Start 1000. Matches chronologisch nach `(finished_at, id)`. Pro Match paarweise Vergleich aller Spieler: Sieg 1, Gleichstand 0,5, Niederlage 0 nach Platzierung; `K = 32 / (n − 1)` pro Paar; erwartet `E = 1 / (1 + 10^((R_gegner − R_ich)/400))`; Delta = Σ K·(S − E). Alle Deltas eines Matches werden gleichzeitig angewendet (Summe = 0). Es gibt **eine** Elo über alle Matches; in Kategorie-/Zeitraum-Ansichten wird `eloDelta` („Elo ±“) = Summe der Deltas der Matches im Scope gezeigt.
- **Platzierungs-Score** je Match `(n − Platz)/(n − 1)` (0–100 %), gemittelt.
- **Siegquote** = Siege/Matches; **Erwartung** = Mittel von `1/n`; Anzeige „42 % vs. 25 % erw. (+17 pp)“.
- **Ø Punkte** = Mittel von `avg_score` (Punkte pro Runde); **Trefferquote** = Σ richtige Runden / Σ gespielte Runden.
- **Vorläufig**: < 3 Matches im gewählten Scope. Gewertete Spieler stehen zuerst (nach Elo), vorläufige danach; Umschalter „Vorläufige anzeigen“ (Default an).
- **Form**: normalisierte Platzierung (0–1) der letzten 5 Matches, älteste zuerst (Punkte: grün Sieg, türkis obere Hälfte, gelb untere Hälfte, rot Letzter).

## Kategorien (`STATS_CATEGORIES`)
`gesamt` „Gesamt“; Gruppen `klein` „Kleine Runden (2–3)“, `mittel` „Mittlere Runden (4–5)“, `gross` „Große Runden (6+)“; je Spielerzahl `2` „Duell (2 Spieler)“, `3` „Dreierrunde“, `4` „Viererrunde“, `5` „Fünferrunde“, `6` „Sechserrunde“, `7` „Siebenerrunde“, `8` „Achterrunde“, `9` „Neunerrunde“, `10` „Zehnerrunde“ (Kurzlabel für Phones: Duell, Dreier, …). Angeboten werden nur Kategorien mit Daten (im gewählten Zeitraum) samt Match-Anzahl. Zeiträume: `all`, `365d`, `90d`, `30d` (nach `finished_at`).

## API
- `GET /api/stats/leaderboard?category=<id>&period=all|365d|90d|30d&search=` → `{ category, period, categories:[{id,label,matchCount}], entries:[{kind,key,userId,name,provisional,rank,elo,eloDelta,matchCount,wins,winRate,expectedWinRate,placementScore,avgPoints,hitRate,form}] }`. `rank` ist die Position in der Liste (vor der Namenssuche vergeben). Unbekannte Kategorie → 400. Die frühere Liste `GET /api/stats/players` entfällt.
- `GET /api/stats/players/:userId`, `GET /api/stats/guests/:name` → Profil: `subject`, `overall` (Eintrag + `placements`), `elo`, `eloHistory [{matchId,at,elo}]`, `categories` (Aufschlüsselung mit Labels, nur mit Daten), `versus`, `matches` (mit `eloDelta`, `finishedAt`).
- **Cache**: alle Zeilen + Elo werden im Speicher gehalten (`StatsCache`) und über einen Versionszähler invalidiert, wenn ein Match angelegt/aktualisiert/gelöscht wird oder ein Gast übernommen wird. Ergebnisse je (Kategorie, Zeitraum) werden zusätzlich memoisiert; Anfragen nach dem ersten Laden brauchen keine DB-Abfrage.

## Bestenliste (`/stats/players`)
- Kategorie-Chips (horizontal scrollbar; Gruppen, dann Spielerzahlen; Kurzlabels auf Phones, volle Labels ab Tablet; Match-Anzahl), Zeitraum-Segmented, Suche, „Vorläufige anzeigen“, Info-Modal „Wie wird gerechnet?“.
- Podium der Top 3 (gewertete Spieler): Rang, Name, Elo, Siegquote.
- Liste: Rang · Name (+ Badges Gast / vorläufig) · Elo mit ±Delta · Siegquote mit Erwartung · Score · Ø Pkt · Treffer · Spiele · Form. Phone: Rang/Name/Elo/Quote/Spiele, Rest per aufklappbarer Zeile. Sortierung per Klick auf den Spaltenkopf (Wiederholung kehrt die Richtung um), Default Elo absteigend; vorläufige bleiben hinter gewerteten. Ab Tablet (≥768×700) scrollt nur die Liste, Kopf/Filter bleiben stehen.
- Animationen (motion, `prefers-reduced-motion` respektiert): gestaffeltes Einblenden, Layout-Animation beim Umsortieren, Count-up der Elo, Podium-Spring.

## Profil (`/stats/players/:id`, `/stats/guests/:name`)
Elo, Matches/Siege, Siegquote vs. Erwartung, Platzierungs-Score, Trefferquote, Ø Punkte; Elo-Verlauf (Inline-SVG, Draw-in); Tabelle je Kategorie mit Labels; Platzierungs-Histogramm; „Gegen andere Spieler“; Match-Liste (Datum, Spieler, Platz, Punkte, Elo ±) mit Link auf `/watch/:code`. Gast-Profile: Button „Das bin ich“ (claim-guest).

## Matches (`/stats/matches`) und Lokale Statistik (`/stats/local`)
Unverändert: Suchliste aller Matches mit Vorschau bzw. lokaler Verlauf aus localStorage.
