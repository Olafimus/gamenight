# Spiele, Spieltypen & Regelwerke (Datenebene)

Gamenight ist ein reiner Punktezähler für mehrere Spiele. Die Datenebene ist dreistufig:

| Ebene | Was | Wo | Neu anlegen |
|---|---|---|---|
| **Spieltyp** (`kind`) | Wertungsmechanik, bestimmt Form von `MatchState` und Engine | `packages/shared/src/kinds/<kind>/` | Code |
| **Spiel** (`GameDefinition`) | konkretes Spiel = Spieltyp + Metadaten + Default-Regelwerk | `packages/shared/src/games/<spiel>.ts` | Code (kleine Datei) |
| **Regelwerk** (`Ruleset`) | Konfiguration eines Spieltyps für ein Spiel | eingebaut: `games/*`, eigene: DB-Tabelle `rulesets` | Daten (API) |

Ein Match speichert einen **Snapshot** der Regeln (`state.rules`) plus Verweis (`state.ruleset = {id, name}`).
Spätere Änderungen/Löschungen eines Regelwerks ändern laufende oder alte Matches nie.

## Spieltypen

### `trick-bidding` – Stichansage (Scheisse, Wizard)
Pro Runde sagt jeder Stiche an, danach wird das Ergebnis erfasst.

| Regel | Bedeutung | Scheisse | Wizard |
|---|---|---|---|
| `players` | min/max Spieler | 2–10 | 3–6 |
| `deck.sizes` / `defaultSize` | wählbare Deckgrößen | 32/52/64, 32 | 60 |
| `rounds.schedule` | `pyramid` 1…n…1, `ascending` 1…n, `descending` n…1, `fixed` | pyramid | ascending |
| `rounds.allowMaxCards` | Höchstkartenzahl im Setup begrenzbar | ja | ja |
| `bidding.sumRule` | `free` oder `notEqualCards` (Summe darf nicht aufgehen) | free | free (Variante „Nicht aufgehen“) |
| `entry` | `hit` (✓/✗) oder `tricks` (tatsächliche Stiche) | hit | tricks |
| `tricksMustSumToCards` | Stiche müssen Kartenzahl ergeben | – | ja |
| `scoring` | richtig: `hitBase + hitPerTrick·Ansage`; falsch: `missBase + missPerTrickDiff·|Ansage−Stiche|` | 10/1/−10/0 | 20/10/0/−10 |
| `winner` | `highest` / `lowest` | highest | highest |

State: `setup {players, deckSize, maxCards}`, `rounds[] {giverId, bids, correct, tricks?}`, `current`, `currentGiverId`.

### `score-sheet` – Punkteblock (Kniffel)
Jeder Spieler hat einen Block mit Kategorien, jede wird (pro Spalte) genau einmal gefüllt.

| Regel | Bedeutung |
|---|---|
| `dice` | `{count, faces}` oder `null` (nur manuelle Felder) |
| `sections[]` | Abschnitte mit `categories[]` und `bonuses[]` (Schwelle auf Abschnittssumme, mehrere = Stufen) |
| Kategorie-`scoring` | `faceSum`, `ofAKind` (n gleiche, `"sum"` oder fix), `groups` ([3,2] = Full House), `straight`, `chance`, `manual` (min/max/step) |
| `columns[]` | Spalten mit Multiplikator (z. B. Dreifach-Kniffel ×1/×2/×3) |
| `fillOrder` | `any` oder `topDown` |
| `repeatBonus` | Bonus für weitere „alle gleich“-Würfe + Joker `none`/`free`/`forced`, oder `null` |

State: `setup {players}`, `entries[] {playerId, column, categoryId, points, dice?, repeat?}` (Ereignisliste, Undo = letzten Eintrag entfernen).
Punkte werden aus `dice` berechnet oder als Zahl eingegeben und gegen die Kategorie validiert; 0 (= streichen) ist immer erlaubt.

Eingebaute Regelwerke: `scheisse.standard`, `wizard.standard`, `wizard.not-even`, `kniffel.standard`, `kniffel.joker`.

## Generische API (`match.ts`)
- `MatchState = TrickMatchState | SheetMatchState` (Diskriminator `kind`), `matchStateSchema` (zod).
- `deriveMatch(state)` – gemeinsame Felder aller Typen: `players[] {id,name,userId,seat,total,placement}`, `roundNumber`, `totalRounds`, `roundsPlayed`, `finished`.
- `createMatch(ruleset, players, options)`, `rematchMatch`, `assertMatchConsistent`, `mapPlayers`.
- `upgradeMatchState(raw)`: alte Scheisse-States (ohne `kind`) → `trick-bidding` mit `scheisse.standard`. Das Schema wendet das automatisch an (alte PWA-Clients funktionieren weiter); Migration `0003_generic_games.sql` macht dasselbe für gespeicherte Matches.

## Statistik
Ergebnisse (`match_results.game_id`) und Elo werden **pro Spiel** getrennt. Leaderboard/Profil nehmen `?game=` (Default `scheisse`).
`hitRate`/`correctRounds` sind nur für `trick-bidding` aussagekräftig.

## Neues Spiel hinzufügen
1. Passt ein bestehender Spieltyp? → nur `games/<spiel>.ts` mit `GameDefinition` + Regelwerken, in `games/index.ts` registrieren.
2. Sonst neuen Spieltyp unter `kinds/<kind>/` (rules, types, engine) und in `core.ts` (`GAME_KINDS`), `ruleset.ts`, `match.ts` eintragen.
