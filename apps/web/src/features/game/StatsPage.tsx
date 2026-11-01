import { useState } from "react";
import type { DerivedPlayer } from "@scheisse/shared";
import { PageHeader, SkewRow, cx } from "../../ui";
import { NoMatch, useRunningMatch } from "./shared";
import styles from "./StatsPage.module.css";

interface ListDef {
  key: string;
  title: string;
  value: (p: DerivedPlayer) => number;
  format?: (v: number) => string;
}

const signed = (v: number) => (v > 0 ? `+${v} ${v === 1 ? "Sieg" : "Siege"}` : v < 0 ? `−${-v} ${v === -1 ? "Niederlage" : "Niederlagen"}` : "–");

const LISTS: ListDef[] = [
  { key: "current", title: "Aktuelle Serien", value: (p) => (p.stats.onWinStreak ? p.stats.winStreak : -p.stats.loseStreak), format: signed },
  { key: "first", title: "Meiste 1. Plätze", value: (p) => p.stats.firstPlaces },
  { key: "last", title: "Meiste letzte Plätze", value: (p) => p.stats.lastPlaces },
  { key: "win", title: "Längste Siegesserie", value: (p) => p.stats.maxWinStreak },
  { key: "lose", title: "Längste Pechsträhne", value: (p) => p.stats.maxLoseStreak },
  { key: "called", title: "Meiste angesagte Stiche", value: (p) => p.stats.maxCalledStiche },
  { key: "won", title: "Meiste gewonnene Stiche", value: (p) => p.stats.maxWonStiche },
];

function sortedBy(players: DerivedPlayer[], def: ListDef) {
  return players
    .map((p, i) => ({ p, i, v: def.value(p) }))
    .sort((a, b) => b.v - a.v || a.i - b.i);
}

function PlayerStatCard({ player }: { player: DerivedPlayer }) {
  const [open, setOpen] = useState(false);
  const s = player.stats;
  const id = `stats-${player.id}`;
  const rows: [string, string | number][] = [
    ["Aktuelle Siegesserie", s.onWinStreak ? s.winStreak : 0],
    ["Längste Siegesserie", s.maxWinStreak],
    ["Aktuelle Pechsträhne", s.onWinStreak ? 0 : s.loseStreak],
    ["Längste Pechsträhne", s.maxLoseStreak],
    ["Runden auf Platz 1", s.firstPlaces],
    ["Runden auf letztem Platz", s.lastPlaces],
    ["Max. gewonnene Stiche", s.maxWonStiche],
    ["Max. angesagte Stiche", s.maxCalledStiche],
  ];
  return (
    <section className={cx(styles.card, open && styles.open)}>
      <h3>
        <button type="button" className={styles.cardHead} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          <span className={styles.pname}>{player.name}</span>
          <span className={styles.pmeta}>
            {player.placement !== null ? `${player.placement}. · ` : ""}
            {player.total} Punkte
          </span>
          <span className={styles.chev} aria-hidden="true">
            ▾
          </span>
        </button>
      </h3>
      {open && (
        <dl id={id} className={styles.dl}>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export function StatsPage() {
  const run = useRunningMatch();
  if (!run) return <NoMatch title="Statistik" />;
  const { match } = run;

  return (
    <>
      <PageHeader title="Statistik" back="/game" />
      <main className={styles.page}>
        {match.roundsPlayed === 0 && <p className={styles.note}>Noch keine Runde gewertet. Die Statistik füllt sich nach der ersten Runde.</p>}

        <h2 className={styles.h2}>Spieler</h2>
        <div className={styles.cards}>
          {match.players.map((p) => (
            <PlayerStatCard key={p.id} player={p} />
          ))}
        </div>

        <h2 className={styles.h2}>Allgemein</h2>
        <div className={styles.lists}>
          {LISTS.map((def) => (
            <section key={def.key} className={styles.list} aria-label={def.title}>
              <h3>{def.title}</h3>
              <ol>
                {sortedBy(match.players, def).map(({ p, v }, i) => (
                  <SkewRow as="li" key={p.id} tone={i % 2 ? "alt" : "default"}>
                    <span className={styles.lname}>{p.name}</span>
                    <span className={styles.lval}>{def.format ? def.format(v) : v}</span>
                  </SkewRow>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
