/** Maps the (English) engine error messages to German UI messages. */
const RULES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^Unknown player id/, () => "Unbekannter Spieler."],
  [/^Invalid bid/, () => "Ungültiger Stich-Tipp (ganze Zahl ab 0 erforderlich)."],
  [/^A match needs at least 2 players/, () => "Ein Match braucht mindestens 2 Spieler."],
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
