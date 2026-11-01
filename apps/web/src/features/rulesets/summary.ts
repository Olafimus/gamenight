import { sheetCategories, type FirstBidder, type Ruleset, type TrickRules } from "@gamenight/shared";

export const SCHEDULE_LABELS: Record<TrickRules["rounds"]["schedule"], string> = {
  pyramid: "1 → Max → 1",
  ascending: "1 → Max",
  descending: "Max → 1",
  fixed: "feste Kartenzahl",
};

export const FIRST_BIDDER_LABELS: Record<FirstBidder, string> = {
  giver: "Geber",
  afterGiver: "Spieler nach dem Geber",
};

const signed =(n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");

/** Points formula in words, e.g. "richtig: 20 + 10 je Stich · falsch: −10 je Stich daneben". */
export function scoringText(rules: TrickRules): string {
  const s = rules.scoring;
  const hit = [s.hitBase !== 0 ? String(s.hitBase) : null, s.hitPerTrick !== 0 ? `${s.hitPerTrick} je Stich` : null].filter(Boolean).join(" + ") || "0";
  const miss =
    [s.missBase !== 0 ? signed(s.missBase) : null, s.missPerTrickDiff !== 0 ? `${signed(s.missPerTrickDiff)} je Stich daneben` : null]
      .filter(Boolean)
      .join(", ") || "0";
  return `richtig: ${hit} · falsch: ${miss}`;
}

/** A few facts for list views. */
export function summarizeRules(r: Ruleset): string[] {
  const players = `${r.rules.players.min}–${r.rules.players.max} Spieler`;
  const winner = r.rules.winner === "lowest" ? "wenigste Punkte gewinnen" : null;
  if (r.kind === "trick-bidding") {
    const t = r.rules;
    return [
      players,
      `Deck ${t.deck.sizes.join("/")}`,
      t.rounds.schedule === "fixed" ? `${t.rounds.fixedRounds} Runden à ${t.rounds.fixedCards} Karten` : `Runden ${SCHEDULE_LABELS[t.rounds.schedule]}`,
      t.entry === "tricks" ? "Stiche eintragen" : "✓/✗ eintragen",
      ...(t.rounds.repeatPeak && t.rounds.schedule !== "fixed" ? ["Höchstzahl 2× gespielt"] : []),
      ...(t.bidding.sumRule === "notEqualCards" ? ["Ansagen dürfen nicht aufgehen"] : []),
      ...(t.bidding.firstBidder === "afterGiver" ? ["Spieler nach dem Geber sagt zuerst an"] : []),
      scoringText(t),
      ...(winner ? [winner] : []),
    ];
  }
  const s = r.rules;
  const bonuses = s.sections.flatMap((x) => x.bonuses.map((b) => `Bonus ${b.points} ab ${b.threshold}`));
  return [
    players,
    `${sheetCategories(s).length} Felder${s.columns.length > 1 ? ` × ${s.columns.length} Spalten` : ""}`,
    s.dice ? `${s.dice.count} Würfel (W${s.dice.faces})` : "ohne Würfel",
    ...bonuses,
    ...(s.repeatBonus ? [`Extra-Bonus ${s.repeatBonus.points}${s.repeatBonus.joker !== "none" ? " + Joker" : ""}`] : []),
    ...(s.fillOrder === "topDown" ? ["von oben nach unten"] : []),
    ...(winner ? [winner] : []),
  ];
}
