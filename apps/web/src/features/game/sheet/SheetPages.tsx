import { getGame } from "@gamenight/shared";
import { PageHeader, SkewRow } from "../../../ui";
import { NoMatch, useRunningSheet } from "../shared";
import { SheetBoard } from "./SheetBoard";
import { strikesOf } from "./sheetUtils";
import styles from "../StatsPage.module.css";

/** /game/scoreboard for score-sheet games: the read-only sheet. */
export function SheetScoreboardPage() {
  const run = useRunningSheet();
  if (!run) return <NoMatch title="Punkteblock" />;
  return (
    <>
      <PageHeader title={`Punkteblock · ${getGame(run.state.gameId)?.name ?? ""}`} back="/game" />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "0.75rem" }}>
        <SheetBoard state={run.state} match={run.match} />
      </main>
    </>
  );
}

/** /game/stats for score-sheet games: per player section sums, bonuses, strikes. */
export function SheetStatsPage() {
  const run = useRunningSheet();
  if (!run) return <NoMatch title="Statistik" />;
  const { state, match } = run;
  const { rules } = state;
  const ranked = [...match.players].sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0) || a.seat - b.seat);
  const sectionTotal = (p: (typeof match.players)[number], si: number) => p.columns.reduce((s, c) => s + (c.sections[si]?.total ?? 0), 0);
  const bonusCount = (p: (typeof match.players)[number]) => p.columns.reduce((s, c) => s + c.sections.reduce((t, x) => t + x.bonuses.length, 0), 0);

  return (
    <>
      <PageHeader title="Statistik" back="/game" />
      <main className={styles.page}>
        {state.entries.length === 0 && <p className={styles.note}>Noch nichts eingetragen.</p>}
        <h2 className={styles.h2}>Zwischenstand</h2>
        <div className={styles.lists}>
          <section className={styles.list} aria-label="Gesamt">
            <h3>Gesamt</h3>
            <ol>
              {ranked.map((p, i) => (
                <SkewRow as="li" key={p.id} tone={i % 2 ? "alt" : "default"}>
                  <span className={styles.lname}>
                    {p.placement ?? "–"}. {p.name}
                  </span>
                  <span className={styles.lval}>{p.total}</span>
                </SkewRow>
              ))}
            </ol>
          </section>
          {rules.sections.map((sec, si) => (
            <section key={sec.id} className={styles.list} aria-label={sec.label}>
              <h3>{sec.label}</h3>
              <ol>
                {[...match.players]
                  .sort((a, b) => sectionTotal(b, si) - sectionTotal(a, si))
                  .map((p, i) => (
                    <SkewRow as="li" key={p.id} tone={i % 2 ? "alt" : "default"}>
                      <span className={styles.lname}>{p.name}</span>
                      <span className={styles.lval}>{sectionTotal(p, si)}</span>
                    </SkewRow>
                  ))}
              </ol>
            </section>
          ))}
          {rules.sections.some((s) => s.bonuses.length > 0) && (
            <section className={styles.list} aria-label="Boni">
              <h3>Boni erreicht</h3>
              <ol>
                {[...match.players]
                  .sort((a, b) => bonusCount(b) - bonusCount(a))
                  .map((p, i) => (
                    <SkewRow as="li" key={p.id} tone={i % 2 ? "alt" : "default"}>
                      <span className={styles.lname}>{p.name}</span>
                      <span className={styles.lval}>{bonusCount(p)}</span>
                    </SkewRow>
                  ))}
              </ol>
            </section>
          )}
          <section className={styles.list} aria-label="Gestrichen">
            <h3>Gestrichene Felder</h3>
            <ol>
              {[...match.players]
                .sort((a, b) => strikesOf(state, b.id) - strikesOf(state, a.id))
                .map((p, i) => (
                  <SkewRow as="li" key={p.id} tone={i % 2 ? "alt" : "default"}>
                    <span className={styles.lname}>{p.name}</span>
                    <span className={styles.lval}>{strikesOf(state, p.id)}</span>
                  </SkewRow>
                ))}
            </ol>
          </section>
        </div>
      </main>
    </>
  );
}
