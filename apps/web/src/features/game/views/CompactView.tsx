import { motion, useReducedMotion } from "motion/react";
import { cx } from "../../../ui";
import { AnimatedNumber, DeltaFloat } from "./AnimatedNumber";
import { BidStepper, ResultControl, currentHit } from "./controls";
import { RankBadge } from "./RankBadge";
import type { ViewProps } from "./types";
import styles from "./CompactView.module.css";

/** One dense row per player: seat, name (+giver), total + placement, bid stepper, ✓/✗. */
export function CompactView({ state, match, players, actions, embedded }: ViewProps & { embedded?: boolean }) {
  const reduce = useReducedMotion();
  const tricksMode = state.rules.entry === "tricks";
  return (
    <ul className={cx(styles.list, embedded && styles.embedded, tricksMode && styles.listTricks)} aria-label="Spieler">
      {players.map((p) => {
        const isGiver = p.id === match.giverId;
        const correct = currentHit(state, p.id);
        const bid = state.current.bids[p.id] ?? 0;
        return (
          <motion.li
            key={p.id}
            // rows glide to their new place when the sort order changes (e.g. sorted by placement)
            layout={reduce ? false : "position"}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cx(styles.row, tricksMode && styles.tricksRow, isGiver && styles.giver, correct === true && styles.ok, correct === false && styles.bad)}
            data-testid={`player-${p.id}`}
          >
            <DeltaFloat delta={p.roundPoints[match.roundsPlayed - 1]} trigger={match.roundsPlayed} />
            <span className={styles.seat} aria-label={`Sitz ${p.seat + 1}`}>
              {p.seat + 1}
            </span>
            <div className={styles.who}>
              <span className={styles.nameLine}>
                <RankBadge placement={p.placement} />
                <span className={styles.name}>{p.name}</span>
                {isGiver && (
                  <span className={styles.chip} title="Geber">
                    Geber
                  </span>
                )}
              </span>
              <span className={styles.points}>
                <strong><AnimatedNumber value={p.total} /></strong> Pkt
              </span>
            </div>
            <div className={styles.ctrls}>
              <BidStepper name={p.name} value={bid} max={match.cardsThisRound} disabled={match.finished} onChange={(v) => actions.setBid(p.id, v)} />
              <ResultControl state={state} player={p} max={match.cardsThisRound} disabled={match.finished} actions={actions} />
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}
