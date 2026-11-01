import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { rankTotals, type DerivedPlayer } from "@gamenight/shared";
import { Button, EmptyState, ButtonLink, PageHeader, SkewRow, cx } from "../../ui";
import { haptic } from "./haptics";
import { flushSync } from "./sync";
import { NoMatch, useRunningMatch } from "./shared";
import { useGameStore } from "./store";
import styles from "./CeremonyPage.module.css";

interface Ranked {
  player: DerivedPlayer;
  rank: number;
}

/** Final order: by points (rules decide whether highest or lowest wins), ties keep seat order and share the rank. */
function finalRanking(players: readonly DerivedPlayer[], winner: "highest" | "lowest"): Ranked[] {
  const ranks = rankTotals(players.map((p) => p.total), winner);
  return players
    .map((player, i) => ({ player, rank: ranks[i] ?? 1, seat: i }))
    .sort((a, b) => a.rank - b.rank || a.seat - b.seat);
}

function winnerHeadline(ranking: Ranked[]): string {
  const winners = ranking.filter((r) => r.rank === 1).map((r) => r.player.name);
  if (winners.length > 1) return `Unentschieden: ${winners.join(" & ")}`;
  return `${winners[0] ?? ""} gewinnt!`;
}

const PODIUM_ORDER = [1, 0, 2]; // visual order: 2nd, 1st, 3rd
const BLOCK_DELAY = [0.9, 0.45, 0];

/** A handful of gold particles rising from the winner's podium block (no extra library). */
function Sparkles() {
  const parts = useMemo(
    () => Array.from({ length: 18 }, (_, i) => ({ x: ((i * 37) % 100) - 50, dy: 90 + ((i * 53) % 90), d: 2.4 + (i % 6) * 0.18, s: 5 + (i % 3) * 2 })),
    [],
  );
  return (
    <div className={styles.sparkles} aria-hidden="true">
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className={styles.spark}
          style={{ width: p.s, height: p.s, left: `calc(50% + ${p.x}%)` }}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 1, 0], y: [0, -p.dy], x: [0, p.x / 3] }}
          transition={{ duration: 1.6, delay: p.d, repeat: 2, repeatDelay: 0.6, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

export function CeremonyPage() {
  const run = useRunningMatch();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const ranking = useMemo(() => (run ? finalRanking(run.match.players, run.state.rules.winner) : []), [run]);
  if (!run) return <NoMatch title="Siegerehrung" />;

  if (!run.match.finished) {
    return (
      <>
        <PageHeader title="Siegerehrung" back="/game" />
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
          <EmptyState
            title="Das Spiel läuft noch"
            text="Die Siegerehrung gibt es nach der letzten Runde."
            action={
              <ButtonLink to="/game" variant="primary">
                Zurück zum Spiel
              </ButtonLink>
            }
          />
        </main>
      </>
    );
  }

  // Leaving the ceremony archives the finished match (it is already in the local history; setup players stay).
  const rematch = async () => {
    haptic(10);
    await flushSync();
    if (!useGameStore.getState().rematch()) navigate("/game");
  };
  const home = async () => {
    await flushSync();
    navigate("/menu");
    useGameStore.getState().archiveMatch();
  };

  return (
    <>
      <PageHeader title="Siegerehrung" back="/game" />
      <main className={styles.page}>
        <h2 className={styles.winner}>
          <span aria-hidden="true">🏆</span> {winnerHeadline(ranking)}
        </h2>

        <div className={styles.podium} role="list" aria-label="Podest">
          {PODIUM_ORDER.map((slot) => {
            const entry = ranking[slot];
            return (
              <div
                key={slot}
                role="listitem"
                className={cx(styles.place, styles[`p${slot + 1}`], !entry && styles.empty)}
                aria-hidden={entry ? undefined : true}
              >
                {entry && (
                  <>
                    <div className={styles.who}>
                      <span className={styles.pname}>{entry.player.name}</span>
                      <span className={styles.pscore}>{entry.player.total} Punkte</span>
                    </div>
                    <motion.div
                      className={styles.block}
                      initial={reduce ? false : { scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ type: "spring", stiffness: 110, damping: 13, delay: BLOCK_DELAY[slot] }}
                    >
                      <span className={styles.num}>{entry.rank}</span>
                    </motion.div>
                    {slot === 0 && !reduce && <Sparkles />}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <ol className={styles.table} aria-label="Endergebnis">
          <li className={styles.head} aria-hidden="true">
            <span>#</span>
            <span>Name</span>
            <span>Punkte</span>
          </li>
          {ranking.map(({ player, rank }, i) => (
            <SkewRow
              as="li"
              key={player.id}
              tone={rank === 1 ? "gold" : i % 2 ? "green" : "default"}
              className={styles.row}
              style={{ animationDelay: `${4.2 + i * 0.25}s` }}
            >
              <span className={styles.c1}>{rank}</span>
              <span className={styles.c2}>{player.name}</span>
              <span className={styles.c3}>{player.total}</span>
            </SkewRow>
          ))}
        </ol>

        <div className={styles.actions}>
          <Button size="lg" onClick={rematch}>
            Noch ein Match
          </Button>
          <Button size="lg" variant="secondary" onClick={home}>
            Zur Startseite
          </Button>
        </div>
      </main>
    </>
  );
}
