import { useEffect, useRef, useState } from "react";
import type { MatchDtoOf, TrickMatchState } from "@gamenight/shared";

type MatchDto = MatchDtoOf<TrickMatchState>;
import { AnimatePresence, cx, motion, useReducedMotion } from "../../ui";
import { CLOSED_HOLD_MS, liveRound, roundPhase, type RoundPhase } from "./watchTable";
import styles from "./LiveRoundCard.module.css";

const PHASE_LABEL: Record<RoundPhase, string> = {
  closed: "Abgeschlossen",
  bidding: "Ansagen laufen",
  marking: "Auswertung",
  finished: "Beendet",
};

/** Time (client clock) the last round was committed; derived from updatedAt on first load. */
function useCommitTime(match: MatchDto, roundsPlayed: number): number | null {
  const [at, setAt] = useState<number | null>(() => {
    const untouched = Object.keys(match.state.current.bids).length === 0 && Object.keys(match.state.current.correct).length === 0;
    return roundsPlayed > 0 && untouched ? Math.min(Date.now(), Date.parse(match.updatedAt)) : null;
  });
  const prev = useRef(roundsPlayed);
  useEffect(() => {
    if (roundsPlayed > prev.current) setAt(Date.now());
    prev.current = roundsPlayed;
  }, [roundsPlayed]);
  return at;
}

/** Current round as it is being played: bids in bidding order (giver first), right/wrong, round status. */
export function LiveRoundCard({ match, roundsPlayed }: { match: MatchDto; roundsPlayed: number }) {
  const reduce = useReducedMotion();
  const commitAt = useCommitTime(match, roundsPlayed);
  const [now, setNow] = useState(() => Date.now());
  const since = commitAt === null ? null : now - commitAt;

  // Re-render once the "closed" hold expires, so the card switches to pending by itself.
  useEffect(() => {
    if (since === null || since >= CLOSED_HOLD_MS) return;
    const t = window.setTimeout(() => setNow(Date.now()), CLOSED_HOLD_MS - since + 50);
    return () => window.clearTimeout(t);
  }, [since]);
  useEffect(() => setNow(Date.now()), [match]);

  const phase = roundPhase(match.state, since);
  const lr = liveRound(match.state, phase);
  // Same colouring as at the table: green when the bids add up to the number of cards.
  const sumOk = lr.calledSum === lr.cards;

  return (
    <section className={styles.card} aria-label="Aktuelle Runde">
      <header className={styles.head}>
        <div>
          <div className={styles.title}>
            Runde {lr.round} · {lr.cards} {lr.cards === 1 ? "Karte" : "Karten"}
          </div>
          <div className={styles.sub}>Geber: {lr.giverName}</div>
        </div>
        <span className={cx(styles.phase, styles[phase])} role="status">
          {phase === "bidding" && <span className={styles.spinner} aria-hidden="true" />}
          {PHASE_LABEL[phase]}
        </span>
      </header>
      <ol className={styles.rows}>
        {lr.rows.map((r) => (
          <li key={r.id} className={cx(styles.row, r.correct === true && styles.ok, r.correct === false && styles.bad)}>
            <span className={styles.name}>
              {r.name}
              {r.isGiver && <span className={styles.giver}>G</span>}
            </span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={`${lr.round}-${r.bid}`}
                className={cx(styles.bid, r.bid === null && styles.empty)}
                initial={reduce ? false : { scale: 1.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                aria-label={r.bid === null ? "noch keine Ansage" : `Ansage ${r.bid}`}
              >
                {r.bid ?? "–"}
              </motion.span>
            </AnimatePresence>
            <span className={styles.mark} aria-label={r.correct === null ? undefined : r.correct ? "richtig" : "falsch"}>
              {r.correct === null ? "" : r.correct ? "✓" : "✗"}
            </span>
            {r.points !== null && (
              <span className={cx(styles.points, r.points < 0 && styles.neg)}>
                {r.points >= 0 ? "+" : "−"}
                {Math.abs(r.points)}
              </span>
            )}
          </li>
        ))}
      </ol>
      <footer className={cx(styles.sum, sumOk ? styles.sumOk : styles.sumBad)}>
        Stiche angesagt Σ {lr.calledSum} / {lr.cards}
      </footer>
    </section>
  );
}
