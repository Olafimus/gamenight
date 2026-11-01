import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FaCrown, FaMedal } from "react-icons/fa6";
import type { TrickDerivedPlayer as DerivedPlayer } from "@gamenight/shared";
import { cx } from "../../../ui";
import styles from "./RankBadge.module.css";

/**
 * Crown for 1st, medals for 2nd/3rd, plain number otherwise. Nothing before the first round.
 * When the placement changes the badge flips to the new icon and a ▲/▼ shows the direction for a moment.
 */
export function RankBadge({ placement, className }: { placement: number | null; className?: string }) {
  const reduce = useReducedMotion();
  // Previous placement, tracked during render so the new badge already mounts with its entry animation.
  const [last, setLast] = useState(placement);
  const [move, setMove] = useState<{ up: boolean; key: number }>({ up: true, key: 0 });
  if (placement !== last) {
    if (last !== null && placement !== null) setMove((m) => ({ up: placement < last, key: m.key + 1 }));
    setLast(placement);
  }
  const [arrow, setArrow] = useState(false);
  useEffect(() => {
    if (move.key === 0) return;
    setArrow(true);
    const t = window.setTimeout(() => setArrow(false), 1800);
    return () => window.clearTimeout(t);
  }, [move.key]);

  if (placement === null) return null;
  const label = `${placement}. Platz`;
  const tone = placement === 1 ? styles.first : placement === 2 ? styles.second : placement === 3 ? styles.third : styles.other;
  const animated = move.key > 0 && !reduce;

  return (
    <span className={cx(styles.wrap, className)} title={label} aria-label={label}>
      <motion.span
        key={`${placement}-${move.key}`}
        className={cx(styles.badge, tone, animated && move.up && styles.glowUp)}
        initial={animated ? { scale: 0.3, rotateY: 180, opacity: 0 } : false}
        animate={{ scale: 1, rotateY: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 18 }}
      >
        {placement === 1 ? (
          <FaCrown aria-hidden="true" />
        ) : placement <= 3 ? (
          <>
            <FaMedal aria-hidden="true" />
            <span className={styles.num}>{placement}</span>
          </>
        ) : (
          `${placement}.`
        )}
      </motion.span>
      <AnimatePresence>
        {arrow && !reduce && (
          <motion.span
            key={move.key}
            className={cx(styles.arrow, move.up ? styles.arrowUp : styles.arrowDown)}
            aria-hidden="true"
            initial={{ opacity: 0, y: move.up ? 8 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: move.up ? -8 : 8 }}
            transition={{ duration: 0.35 }}
          >
            {move.up ? "▲" : "▼"}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/**
 * Ids of players who just took over 1st place (empty on mount and while nobody new leads).
 * `key` changes with every takeover so it can re-trigger animations.
 */
export function useLeaderChange(players: DerivedPlayer[]): { newLeaders: Set<string>; key: number } {
  const leaders = players.filter((p) => p.placement === 1).map((p) => p.id);
  const sig = [...leaders].sort().join("|");
  const prev = useRef<string[] | null>(null);
  const [state, setState] = useState<{ newLeaders: Set<string>; key: number }>({ newLeaders: new Set(), key: 0 });

  useEffect(() => {
    const before = prev.current;
    prev.current = leaders;
    if (before === null || before.length === 0) return;
    const fresh = leaders.filter((id) => !before.includes(id));
    if (fresh.length === 0) return;
    setState((s) => ({ newLeaders: new Set(fresh), key: s.key + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => {
    if (state.key === 0) return;
    const t = window.setTimeout(() => setState((s) => ({ ...s, newLeaders: new Set() })), 2600);
    return () => window.clearTimeout(t);
  }, [state.key]);

  return state;
}
