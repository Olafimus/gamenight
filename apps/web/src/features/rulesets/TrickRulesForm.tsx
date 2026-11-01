import { useEffect, useState } from "react";
import { roundPlan, roundPoints, type FirstBidder, type TrickRules } from "@gamenight/shared";
import { Segmented } from "../../ui";
import { Check, Field, Num } from "./fields";
import { FIRST_BIDDER_LABELS, SCHEDULE_LABELS, scoringText } from "./summary";
import styles from "./Rulesets.module.css";

/** Editor for "trick-bidding" rules (Scheisse, Wizard & co.). */
export function TrickRulesForm({ rules, onChange }: { rules: TrickRules; onChange: (r: TrickRules) => void }) {
  const set = (patch: Partial<TrickRules>) => onChange({ ...rules, ...patch });
  const [deckText, setDeckText] = useState(rules.deck.sizes.join(", "));
  useEffect(() => setDeckText(rules.deck.sizes.join(", ")), [rules.deck.sizes]);
  const tricks = rules.entry === "tricks";
  const examplePlayers = Math.min(Math.max(4, rules.players.min), rules.players.max);
  const plan = roundPlan(rules, { deckSize: rules.deck.defaultSize, maxCards: null, playerCount: examplePlayers });

  const setDeckSizes = (text: string) => {
    setDeckText(text);
    const sizes = [...new Set(text.split(/[\s,;]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (sizes.length === 0) return;
    set({ deck: { sizes, defaultSize: sizes.includes(rules.deck.defaultSize) ? rules.deck.defaultSize : sizes[0]! } });
  };

  return (
    <>
      <section className={styles.section}>
        <h2>Spieler & Karten</h2>
        <div className={styles.grid}>
          <Field label="Spieler min.">
            <Num value={rules.players.min} min={2} max={10} onChange={(min) => set({ players: { ...rules.players, min } })} />
          </Field>
          <Field label="Spieler max.">
            <Num value={rules.players.max} min={2} max={10} onChange={(max) => set({ players: { ...rules.players, max } })} />
          </Field>
          <Field label="Deckgrößen" hint="mit Komma getrennt, z. B. 32, 52">
            <input className={styles.textIn} value={deckText} onChange={(e) => setDeckSizes(e.target.value)} />
          </Field>
          {rules.deck.sizes.length > 1 && (
            <Field label="Standard-Deck">
              <Segmented
                ariaLabel="Standard-Deck"
                value={rules.deck.defaultSize}
                onChange={(defaultSize: number) => set({ deck: { ...rules.deck, defaultSize } })}
                options={rules.deck.sizes.map((d) => ({ value: d, label: String(d) }))}
              />
            </Field>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Runden</h2>
        <Segmented
          ariaLabel="Rundenverlauf"
          full
          value={rules.rounds.schedule}
          onChange={(schedule) =>
            set({
              rounds: {
                ...rules.rounds,
                schedule,
                fixedCards: schedule === "fixed" ? (rules.rounds.fixedCards ?? 5) : rules.rounds.fixedCards,
                fixedRounds: schedule === "fixed" ? (rules.rounds.fixedRounds ?? 10) : rules.rounds.fixedRounds,
              },
            })
          }
          options={(Object.keys(SCHEDULE_LABELS) as TrickRules["rounds"]["schedule"][]).map((s) => ({ value: s, label: SCHEDULE_LABELS[s] }))}
        />
        {rules.rounds.schedule === "fixed" ? (
          <div className={styles.grid}>
            <Field label="Karten je Runde">
              <Num value={rules.rounds.fixedCards ?? 1} min={1} onChange={(fixedCards) => set({ rounds: { ...rules.rounds, fixedCards } })} />
            </Field>
            <Field label="Anzahl Runden">
              <Num value={rules.rounds.fixedRounds ?? 1} min={1} onChange={(fixedRounds) => set({ rounds: { ...rules.rounds, fixedRounds } })} />
            </Field>
          </div>
        ) : (
          <>
            <Check checked={rules.rounds.allowMaxCards} onChange={(allowMaxCards) => set({ rounds: { ...rules.rounds, allowMaxCards } })}>
              Höchstzahl an Karten beim Start begrenzbar
            </Check>
            <Check checked={rules.rounds.repeatPeak} onChange={(repeatPeak) => set({ rounds: { ...rules.rounds, repeatPeak } })}>
              Variante: Höchstzahl an Karten zweimal spielen (beim Start änderbar)
            </Check>
          </>
        )}
        <p className={styles.preview}>
          Beispiel {examplePlayers} Spieler, {rules.deck.defaultSize} Karten: <strong>{plan.length} Runden</strong> ({plan.slice(0, 12).join(", ")}
          {plan.length > 12 ? ", …" : ""})
        </p>
      </section>

      <section className={styles.section}>
        <h2>Ansagen & Ergebnis</h2>
        <Check
          checked={rules.bidding.sumRule === "notEqualCards"}
          onChange={(v) => set({ bidding: { ...rules.bidding, sumRule: v ? "notEqualCards" : "free" } })}
        >
          Summe der Ansagen darf nicht der Kartenzahl entsprechen („darf nicht aufgehen“)
        </Check>
        <Field label="Erste Ansage" hint="Variante, beim Start änderbar">
          <Segmented
            ariaLabel="Erste Ansage"
            value={rules.bidding.firstBidder}
            onChange={(firstBidder) => set({ bidding: { ...rules.bidding, firstBidder } })}
            options={(Object.keys(FIRST_BIDDER_LABELS) as FirstBidder[]).map((v) => ({ value: v, label: FIRST_BIDDER_LABELS[v] }))}
          />
        </Field>
        <Field label="Nach der Runde eintragen">
          <Segmented
            ariaLabel="Eintragen"
            value={rules.entry}
            onChange={(entry) =>
              set({
                entry,
                tricksMustSumToCards: entry === "tricks" ? rules.tricksMustSumToCards : false,
                scoring: entry === "hit" ? { ...rules.scoring, missPerTrickDiff: 0 } : rules.scoring,
              })
            }
            options={[
              { value: "hit", label: "✓ / ✗" },
              { value: "tricks", label: "Gemachte Stiche" },
            ]}
          />
        </Field>
        {tricks && (
          <Check checked={rules.tricksMustSumToCards} onChange={(tricksMustSumToCards) => set({ tricksMustSumToCards })}>
            Stiche müssen die Kartenzahl ergeben (aus bei Sonderkarten, die Stiche vernichten)
          </Check>
        )}
      </section>

      <section className={styles.section}>
        <h2>Wertung</h2>
        <div className={styles.grid}>
          <Field label="Richtig: Grundpunkte">
            <Num value={rules.scoring.hitBase} onChange={(hitBase) => set({ scoring: { ...rules.scoring, hitBase } })} />
          </Field>
          <Field label="Richtig: je angesagtem Stich">
            <Num value={rules.scoring.hitPerTrick} onChange={(hitPerTrick) => set({ scoring: { ...rules.scoring, hitPerTrick } })} />
          </Field>
          <Field label="Falsch: Grundpunkte">
            <Num value={rules.scoring.missBase} onChange={(missBase) => set({ scoring: { ...rules.scoring, missBase } })} />
          </Field>
          <Field label="Falsch: je Stich daneben" hint={tricks ? undefined : "nur mit „Gemachte Stiche“"}>
            <Num
              value={rules.scoring.missPerTrickDiff}
              disabled={!tricks}
              onChange={(missPerTrickDiff) => set({ scoring: { ...rules.scoring, missPerTrickDiff } })}
            />
          </Field>
          <Field label="Gewinner (Punkte)">
            <Segmented
              ariaLabel="Gewinner"
              value={rules.winner}
              onChange={(winner) => set({ winner })}
              options={[
                { value: "highest", label: "meiste" },
                { value: "lowest", label: "wenigste" },
              ]}
            />
          </Field>
        </div>
        <p className={styles.preview}>
          {scoringText(rules)} · z. B. 2 angesagt, richtig: <strong>{roundPoints(2, true, rules.scoring, 2)}</strong>, 2 angesagt, 0 gemacht:{" "}
          <strong>{roundPoints(2, false, rules.scoring, tricks ? 0 : null)}</strong>
        </p>
      </section>
    </>
  );
}
