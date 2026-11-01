/** Maps the (English) engine error messages to German UI messages. */
const RULES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^Unknown player id/, () => "Unbekannter Spieler."],
  [/^Invalid bid/, () => "Ungültiger Stich-Tipp (ganze Zahl ab 0 erforderlich)."],
  [/^A match needs at least (\d+) player/, (m) => `Ein Match braucht mindestens ${m[1]} Spieler.`],
  [/^A match allows at most (\d+) players/, (m) => `Bei diesen Regeln sind höchstens ${m[1]} Spieler möglich.`],
  [/^deck size (\d+) not allowed/, (m) => `Die Deckgröße ${m[1]} ist bei diesen Regeln nicht erlaubt.`],
  [/^Invalid tricks/, () => "Ungültige Stichzahl (ganze Zahl ab 0 erforderlich)."],
  [/the sum of bids must not equal/, () => "Die Ansagen dürfen in Summe nicht der Kartenzahl entsprechen."],
  [/tricks don't add up/, () => "Die Stiche ergeben nicht die Kartenzahl der Runde."],
  [/is already filled$/, () => "Dieses Feld ist bereits ausgefüllt."],
  [/^Column must be filled top-down/, () => "Die Felder müssen von oben nach unten ausgefüllt werden."],
  [/^(-?\d+) is not a possible score for „(.+)“/, (m) => `${m[1]} Punkte sind bei „${m[2]}“ nicht möglich.`],
  [/^Joker: „(.+)“ must be filled first/, (m) => `Joker: Zuerst muss „${m[1]}“ ausgefüllt werden.`],
  [/^Repeat bonus is not possible here/, () => "Der Extra-Bonus ist hier nicht möglich."],
  [/^Points or dice required/, () => "Bitte Punkte oder Würfel eingeben."],
  [/^Expected (\d+) dice/, (m) => `Bitte alle ${m[1]} Würfel eingeben.`],
  [/^No entry to undo/, () => "Kein Eintrag zum Zurücknehmen vorhanden."],
  [/^Invalid entry index/, () => "Ungültiger Eintrag."],
  [/^Not a (trick-bidding|score-sheet) match|record right\/wrong, not tricks/, () => "Diese Aktion passt nicht zum laufenden Spiel."],
  [/^Duplicate player ids/, () => "Doppelte Spieler-IDs."],
  [/match is already finished/, () => "Das Match ist bereits beendet."],
  [/not all players are marked/, () => "Es sind noch nicht alle Spieler markiert."],
  [/^No committed round to undo/, () => "Keine Runde zum Rückgängigmachen vorhanden."],
  [/^Invalid round index/, () => "Ungültige Runde."],
  [/^Seat order must contain/, () => "Ungültige Sitzordnung."],
  [/^Deck size (\d+) allows only (\d+) rounds, but (\d+) were already played/, (m) =>
    `Mit ${m[1]} Karten sind nur ${m[2]} Runden möglich, es wurden aber schon ${m[3]} gespielt.`],
];

export function translateEngineError(e: unknown, fallback = "Aktion nicht möglich"): string {
  if (!(e instanceof Error)) return fallback;
  for (const [re, fn] of RULES) {
    const m = e.message.match(re);
    if (m) return fn(m);
  }
  return fallback;
}
