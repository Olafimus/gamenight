import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MdOutlineRotateRight } from "react-icons/md";
import { cx, Tooltip } from "../../../ui";
import { useGameStore } from "../store";
import { AnimatedNumber, DeltaFloat } from "./AnimatedNumber";
import { BidStepper, ResultControl, currentHit } from "./controls";
import { CompactView } from "./CompactView";
import { RankBadge, useLeaderChange } from "./RankBadge";
import { fitSeats, seatDirections, type SeatLayout } from "./tableLayout";
import type { ViewProps } from "./types";
import styles from "./TableView.module.css";

interface Size {
  w: number;
  h: number;
}

const sameSize = (a: Size | null, b: Size) => !!a && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1;

/**
 * Measures the table, the (unscaled) seat cards and the middle block, and keeps them in state.
 * Runs before paint, so the first visible frame already uses the fitted layout.
 */
function useTableMeasure() {
  const [el, tableRef] = useState<HTMLDivElement | null>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const [table, setTable] = useState<Size | null>(null);
  const [seat, setSeat] = useState<Size | null>(null);
  const [center, setCenter] = useState<Size | null>(null);

  const measure = useCallback(() => {
    if (!el) return;
    const t = { w: el.clientWidth, h: el.clientHeight };
    setTable((old) => (sameSize(old, t) ? old : t));
    // offset sizes ignore the scale transform, so this is the natural card size
    const seats = el.querySelectorAll<HTMLElement>("[data-seat]");
    if (seats.length > 0) {
      const s = { w: 0, h: 0 };
      seats.forEach((x) => {
        s.w = Math.max(s.w, x.offsetWidth);
        s.h = Math.max(s.h, x.offsetHeight);
      });
      setSeat((old) => (sameSize(old, s) ? old : s));
    }
    const c = centerRef.current;
    if (c) {
      const cs = { w: c.offsetWidth, h: c.offsetHeight };
      setCenter((old) => (sameSize(old, cs) ? old : cs));
    }
  }, [el]);

  // card content (names, finished state) can change the natural size: re-measure after every render
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, measure]);

  return { tableRef, centerRef, table, seat, center };
}

/**
 * Players around an oval table in seat order (clockwise), turnable so any seat can sit at the bottom.
 * The seat cards have a fixed, roomy size and are scaled as large as the space allows without overlapping;
 * when even the minimum scale does not fit (many players on a phone) the compact list is shown instead.
 */
export function TableView(props: ViewProps) {
  const { state, match, actions } = props;
  const reduce = useReducedMotion();
  const rotation = useGameStore((s) => s.tableRotation ?? 0);
  const setRotation = useGameStore((s) => s.setTableRotation);
  // Seat order is fixed in this view (it mirrors the real table), independent of the sort mode.
  const seats = match.players;
  const n = seats.length;
  const { newLeaders, key: leaderKey } = useLeaderChange(seats);
  const { tableRef, centerRef, table, seat, center } = useTableMeasure();

  // null: does not fit. Before the first measurement (and in jsdom) the cards are shown unscaled.
  const layout = useMemo<SeatLayout | null>(() => {
    if (!table || !seat || table.w === 0 || table.h === 0 || seat.w === 0) return { scale: 1, dirs: seatDirections(n, 1, 1) };
    return fitSeats({ width: table.w, height: table.h, players: n, seatW: seat.w, seatH: seat.h, centerW: center?.w ?? 0, centerH: center?.h ?? 0 });
  }, [table, seat, center, n]);

  if (!layout) {
    return (
      <div ref={tableRef} className={styles.fallbackWrap}>
        <p className={styles.fallbackNote}>Tisch-Ansicht braucht mehr Platz – Kompakt-Darstellung.</p>
        <CompactView {...props} players={seats} />
      </div>
    );
  }
  const scaleVars = {
    "--s": layout.scale,
    ...(seat ? { "--hw": `${(seat.w * layout.scale) / 2}px`, "--hh": `${(seat.h * layout.scale) / 2}px` } : {}),
  } as CSSProperties;

  const bottom = ((rotation % n) + n) % n;
  const bottomName = seats[bottom]?.name ?? "";
  const newLeaderNames = seats.filter((p) => newLeaders.has(p.id)).map((p) => p.name);

  return (
    <div ref={tableRef} className={styles.table} style={scaleVars} aria-label="Spieltisch">
      <div className={styles.felt} aria-hidden="true" />
      <div ref={centerRef} className={styles.center}>
        <div className={styles.round}>
          Runde {match.roundNumber}/{match.totalRounds}
        </div>
        <div className={styles.cards}>
          <strong>{match.cardsThisRound}</strong> {match.cardsThisRound === 1 ? "Karte" : "Karten"}
        </div>
        <div className={cx(styles.sum, match.sumMatchesCards ? styles.sumOk : styles.sumBad)}>
          Stiche Σ {match.calledSum} / {match.cardsThisRound}
        </div>
        <Tooltip content={`Tisch drehen – unten sitzt jetzt ${bottomName}. So passt die Anzeige zu deinem Platz am echten Tisch.`}>
          <button type="button" className={styles.rotate} aria-label="Tisch drehen" onClick={() => setRotation((bottom + 1) % n)}>
            <MdOutlineRotateRight aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      <AnimatePresence>
        {newLeaderNames.length > 0 && (
          <motion.div
            key={leaderKey}
            className={styles.leaderToast}
            role="status"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 420, damping: 24 }}
          >
            👑 {newLeaderNames.join(" & ")} {newLeaderNames.length === 1 ? "übernimmt" : "übernehmen"} die Führung!
          </motion.div>
        )}
      </AnimatePresence>
      {seats.map((p, i) => {
        const pos = (i - bottom + n) % n;
        const dir = layout.dirs[pos] ?? { cx: 0, cy: 1 };
        const style = { "--cx": dir.cx.toFixed(4), "--cy": dir.cy.toFixed(4) } as CSSProperties;
        const isGiver = p.id === match.giverId;
        const correct = currentHit(state, p.id);
        const leads = p.placement === 1;
        return (
          <article
            key={p.id}
            className={cx(
              styles.seat,
              leads && styles.leader,
              newLeaders.has(p.id) && !reduce && styles.newLeader,
              isGiver && styles.giver,
              correct === true && styles.ok,
              correct === false && styles.bad,
            )}
            style={style}
            data-testid={`player-${p.id}`}
            data-seat
          >
            <DeltaFloat delta={p.roundPoints[match.roundsPlayed - 1]} trigger={match.roundsPlayed} />
            <header className={styles.head}>
              <RankBadge placement={p.placement} />
              <span className={styles.name}>{p.name}</span>
              {isGiver && (
                <span className={styles.dealer} title="Geber" aria-label="Geber">
                  G
                </span>
              )}
            </header>
            <div className={styles.pts}>
              <strong>
                <AnimatedNumber value={p.total} />
              </strong>{" "}
              Pkt
            </div>
            <div className={styles.ctl}>
              <BidStepper name={p.name} value={state.current.bids[p.id] ?? 0} max={match.cardsThisRound} disabled={match.finished} onChange={(v) => actions.setBid(p.id, v)} />
            </div>
            <div className={styles.ctl}>
              <ResultControl state={state} player={p} max={match.cardsThisRound} disabled={match.finished} actions={actions} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
