import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { canUndoRound, rankTotals, roundPoints, type DerivedPlayer } from "@scheisse/shared";
import { cx } from "../../../ui";
import { AnimatedNumber } from "./AnimatedNumber";
import { MarkToggle } from "./controls";
import { RankBadge } from "./RankBadge";
import type { ViewProps } from "./types";
import styles from "./WizardView.module.css";

type Phase = "bid" | "result" | "summary";

const PHASES: Array<{ id: Phase; label: string }> = [
  { id: "bid", label: "Ansagen" },
  { id: "result", label: "Ergebnis" },
  { id: "summary", label: "Zusammenfassung" },
];

/** Players in bidding order: the giver bids first, then the following seats, wrapping around. */
export function biddingOrder(players: DerivedPlayer[], giverId: string): DerivedPlayer[] {
  const g = Math.max(
    0,
    players.findIndex((p) => p.id === giverId),
  );
  return [...players.slice(g), ...players.slice(0, g)];
}

/** Becomes true `ms` after `on` turned true (false again immediately when `on` drops). */
function useDelayedFlag(on: boolean, ms: number): boolean {
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    if (!on) return setFlag(false);
    const t = window.setTimeout(() => setFlag(true), ms);
    return () => window.clearTimeout(t);
  }, [on, ms]);
  return on && flag;
}

const lineSpring = { type: "spring", stiffness: 260, damping: 28 } as const;

function Slide({ children, dir }: { children: ReactNode; dir: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={styles.phase}
      initial={reduce ? false : { opacity: 0, x: 40 * dir }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

/** Resets (via key) after every committed / undone round so a new round always starts at phase 1. */
export function WizardView(props: ViewProps) {
  return <Wizard key={props.match.roundsPlayed} {...props} />;
}

function Wizard({ state, match, players: _sorted, actions }: ViewProps) {
  const navigate = useNavigate();
  const order = useMemo(() => biddingOrder(match.players, match.giverId), [match.players, match.giverId]);
  const n = order.length;
  const hasBid = (id: string) => state.current.bids[id] !== undefined;
  const anyMarked = order.some((p) => state.current.correct[p.id] !== undefined);

  const [phase, setPhase] = useState<Phase>(() =>
    match.allMarked ? "summary" : anyMarked || order.every((p) => hasBid(p.id)) ? "result" : "bid",
  );
  const [idx, setIdx] = useState(() => {
    const first = order.findIndex((p) => !hasBid(p.id));
    return first < 0 ? 0 : first;
  });
  const canUndo = canUndoRound(state);
  const reduce = useReducedMotion();
  // Result phase: once everybody is marked, show the new totals/placements (after a short beat).
  const reveal = useDelayedFlag(phase === "result" && match.allMarked, reduce ? 0 : 350);
  // Summary phase: start in the old order, then move the lines to their new placement.
  const resort = useDelayedFlag(phase === "summary", reduce ? 0 : 500);

  if (match.finished) {
    return (
      <div className={styles.wiz}>
        <div className={styles.body}>
          <div className={styles.done}>
            <h2>Spiel beendet</h2>
            <p>Alle {match.totalRounds} Runden sind gespielt.</p>
          </div>
        </div>
        <div className={styles.foot}>
          <button type="button" className={cx(styles.btn, styles.back)} disabled={!canUndo} onClick={actions.undo}>
            Letzte Runde
          </button>
          <button type="button" className={cx(styles.btn, styles.next)} onClick={() => navigate("/game/ceremony")}>
            Zur Siegerehrung
          </button>
        </div>
      </div>
    );
  }

  const cards = match.cardsThisRound;
  const current = order[idx] ?? order[0]!;
  const isLast = idx === n - 1;
  const bidOf = (id: string) => state.current.bids[id] ?? 0;
  const sumOthers = order.reduce((s, p) => (p.id === current.id ? s : s + bidOf(p.id)), 0);
  // Hint only: the last bidder would make the sum equal the number of cards.
  const forbidden = isLast ? cards - sumOthers : -1;
  const hint = isLast && forbidden >= 0 && forbidden <= cards ? forbidden : null;
  const sumNow = match.calledSum;

  const pick = (v: number) => {
    actions.setBid(current.id, v);
    if (isLast) setPhase("result");
    else setIdx(idx + 1);
  };

  const projected = order.map((p) => {
    const ok = state.current.correct[p.id] === true;
    const delta = roundPoints(bidOf(p.id), ok);
    return { p, ok, delta, total: p.total + delta };
  });
  const places = rankTotals(projected.map((x) => x.total));
  const projectedOf = new Map(projected.map((x, i) => [x.p.id, { ...x, place: places[i]! }]));
  const byOld = [...projected].sort((a, b) => (a.p.placement ?? 0) - (b.p.placement ?? 0));
  const summaryLines = resort ? [...byOld].sort((a, b) => projectedOf.get(a.p.id)!.place - projectedOf.get(b.p.id)!.place) : byOld;

  return (
    <div className={styles.wiz}>
      <ol className={styles.steps} aria-label="Phasen">
        {PHASES.map((ph, i) => (
          <li key={ph.id} className={cx(styles.step, ph.id === phase && styles.stepOn)} aria-current={ph.id === phase ? "step" : undefined}>
            <span className={styles.stepNo}>{i + 1}</span> {ph.label}
          </li>
        ))}
      </ol>

      {phase === "bid" && (
        <Slide key="bid" dir={1}>
          <div className={styles.body}>
            <div className={styles.chips} role="tablist" aria-label="Spieler springen">
              {order.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={i === idx}
                  className={cx(styles.chip, i === idx && styles.chipOn, hasBid(p.id) && styles.chipDone)}
                  onClick={() => setIdx(i)}
                >
                  <span className={styles.chipName}>
                    <RankBadge placement={p.placement} className={styles.chipRank} />
                    {p.name}
                  </span>
                  <span className={styles.chipBid}>{hasBid(p.id) ? bidOf(p.id) : "–"}</span>
                </button>
              ))}
            </div>

            <h2 className={styles.who}>
              Ansage von <span>{current.name}</span>
              {current.id === match.giverId && <em className={styles.dealer}>Geber</em>}
            </h2>
            <p className={styles.standing}>
              <RankBadge placement={current.placement} />
              <strong>{current.total}</strong> Pkt
            </p>
            <p className={cx(styles.sumLine, sumNow === cards && styles.sumEq)} data-testid="wizard-sum">
              Summe: <strong>{sumNow}</strong> von {cards} {cards === 1 ? "Karte" : "Karten"}
            </p>
            {hint !== null && (
              <p className={styles.hint} role="note">
                Letzter Ansager: Mit {hint} wäre die Summe gleich den Karten.
              </p>
            )}

            <div className={styles.pad} role="group" aria-label={`Ansage für ${current.name}`}>
              {Array.from({ length: cards + 1 }, (_, v) => (
                <button
                  key={v}
                  type="button"
                  className={cx(styles.key, hasBid(current.id) && bidOf(current.id) === v && styles.keyOn, hint === v && styles.keyWarn)}
                  aria-pressed={hasBid(current.id) && bidOf(current.id) === v}
                  aria-label={`${v} ansagen`}
                  onClick={() => pick(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.foot}>
            <button type="button" className={cx(styles.btn, styles.back)} disabled={!canUndo} onClick={actions.undo}>
              Letzte Runde
            </button>
            <button type="button" className={cx(styles.btn, styles.back)} disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
              ‹ Zurück
            </button>
            <button type="button" className={cx(styles.btn, styles.next)} onClick={() => (isLast ? setPhase("result") : setIdx(idx + 1))}>
              {isLast ? "Zum Ergebnis ›" : "Weiter ›"}
            </button>
          </div>
        </Slide>
      )}

      {phase === "result" && (
        <Slide key="result" dir={1}>
          <div className={styles.body}>
            <div className={styles.bulk}>
              <button type="button" className={cx(styles.btn, styles.bad)} onClick={() => actions.setAll(false)}>
                alle ✗
              </button>
              <button type="button" className={cx(styles.btn, styles.good)} onClick={() => actions.setAll(true)}>
                alle ✓
              </button>
            </div>
            <ul className={styles.list} aria-label="Ergebnis">
              {order.map((p) => {
                const proj = projectedOf.get(p.id)!;
                return (
                <li key={p.id} className={cx(styles.line, reveal && (proj.ok ? styles.lineOk : styles.lineBad))} data-testid={`player-${p.id}`}>
                  <span className={styles.lwho}>
                    <span className={styles.lnameRow}>
                      <RankBadge placement={reveal ? proj.place : p.placement} />
                      <span className={styles.lname}>{p.name}</span>
                    </span>
                    <span className={styles.lpts}>
                      <strong>
                        <AnimatedNumber value={reveal ? proj.total : p.total} />
                      </strong>{" "}
                      Pkt
                      {reveal && (
                        <motion.span
                          className={cx(styles.ldelta, proj.delta >= 0 ? styles.up : styles.down)}
                          initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                        >
                          {proj.delta >= 0 ? "+" : "−"}
                          {Math.abs(proj.delta)}
                        </motion.span>
                      )}
                    </span>
                  </span>
                  <span className={styles.lbid}>
                    sagt <strong>{bidOf(p.id)}</strong>
                  </span>
                  <MarkToggle big name={p.name} value={state.current.correct[p.id]} onChange={(v) => actions.setCorrect(p.id, v)} />
                </li>
                );
              })}
            </ul>
          </div>
          <div className={styles.foot}>
            <button type="button" className={cx(styles.btn, styles.back)} onClick={() => { setIdx(n - 1); setPhase("bid"); }}>
              ‹ Ansagen
            </button>
            <button type="button" className={cx(styles.btn, styles.next)} disabled={!match.allMarked} onClick={() => setPhase("summary")}>
              Zusammenfassung ›
            </button>
          </div>
        </Slide>
      )}

      {phase === "summary" && (
        <Slide key="summary" dir={1}>
          <div className={styles.body}>
            <ul className={styles.list} aria-label="Zusammenfassung">
              {summaryLines.map(({ p, ok, delta, total }) => (
                <motion.li
                  key={p.id}
                  layout={reduce ? false : "position"}
                  transition={lineSpring}
                  className={cx(styles.line, ok ? styles.lineOk : styles.lineBad)}
                >
                  <span className={styles.lnameRow}>
                    <RankBadge placement={resort ? projectedOf.get(p.id)!.place : p.placement} />
                    <span className={styles.lname}>{p.name}</span>
                  </span>
                  <span className={styles.lbid}>
                    {bidOf(p.id)} {ok ? "✓" : "✗"}
                  </span>
                  <strong className={cx(styles.delta, delta >= 0 ? styles.up : styles.down)} data-testid={`delta-${p.id}`}>
                    {delta >= 0 ? "+" : "−"}
                    {Math.abs(delta)}
                  </strong>
                  <span className={styles.newTotal}>
                    <b>
                      <AnimatedNumber value={resort ? total : p.total} />
                    </b>{" "}
                    Pkt
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>
          <div className={styles.foot}>
            <button type="button" className={cx(styles.btn, styles.back)} onClick={() => setPhase("result")}>
              ‹ Zurück
            </button>
            <button type="button" className={cx(styles.btn, styles.next)} onClick={actions.commit}>
              Runde speichern
            </button>
          </div>
        </Slide>
      )}
    </div>
  );
}
