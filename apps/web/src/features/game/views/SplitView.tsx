import { useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { Scoreboard } from "../../../components/Scoreboard";
import { Segmented, cx } from "../../../ui";
import { AnimatedNumber } from "./AnimatedNumber";
import { CompactView } from "./CompactView";
import { ProgressChart, seriesColor } from "./ProgressChart";
import type { ViewProps } from "./types";
import styles from "./SplitView.module.css";

type Panel = "standings" | "board" | "chart";

/** Left: input rows. Right: live standings, full scoreboard or points chart. */
export function SplitView(props: ViewProps) {
  return (
    <div className={styles.split}>
      <div className={styles.input}>
        <CompactView {...props} embedded />
      </div>
      <SplitSide match={props.match} />
    </div>
  );
}

/** Right-hand panel: standings, full scoreboard or points chart. Also used beside the wizard. */
export function SplitSide({ match, initial = "standings" }: { match: ViewProps["match"]; initial?: Panel }) {
  const reduce = useReducedMotion();
  const [panel, setPanel] = useState<Panel>(initial);
  const ranked = [...match.players].sort((a, b) => b.total - a.total || a.seat - b.seat);
  const last = match.roundsPlayed - 1;

  return (
      <aside className={styles.side} aria-label="Zwischenstand">
        <Segmented
          ariaLabel="Anzeige"
          full
          value={panel}
          onChange={setPanel}
          options={[
            { value: "standings", label: "Stand" },
            { value: "board", label: "Scoreboard" },
            { value: "chart", label: "Verlauf" },
          ]}
        />
        <div className={styles.panel}>
          {panel === "standings" && (
            <LayoutGroup>
            <ol className={styles.rank}>
              {ranked.map((p) => {
                const delta = last >= 0 ? p.roundPoints[last] : undefined;
                const place = p.placement ?? 1;
                return (
                  <motion.li layout={!reduce} transition={{ type: "spring", stiffness: 400, damping: 34 }} key={p.id} className={cx(styles.rankRow, place === 1 && match.roundsPlayed > 0 && styles.first)}>
                    <span className={styles.pos}><AnimatedNumber value={place} />.</span>
                    <span className={styles.swatch} style={{ background: seriesColor(p.seat) }} aria-hidden="true" />
                    <span className={styles.rname}>{p.name}</span>
                    {delta !== undefined && (
                      <span className={cx(styles.delta, delta >= 0 ? styles.up : styles.down)} aria-label={`Letzte Runde ${delta >= 0 ? "plus" : "minus"} ${Math.abs(delta)}`}>
                        {delta > 0 ? "+" : delta < 0 ? "−" : "±"}
                        {Math.abs(delta)}
                      </span>
                    )}
                    <span className={styles.total}><AnimatedNumber value={p.total} /></span>
                  </motion.li>
                );
              })}
            </ol>
            </LayoutGroup>
          )}
          {panel === "board" && <Scoreboard match={match} />}
          {panel === "chart" && <ProgressChart players={match.players} rounds={match.roundsPlayed} />}
        </div>
      </aside>
  );
}
