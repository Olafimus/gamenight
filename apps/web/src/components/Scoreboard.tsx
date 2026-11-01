import type { TrickDerivedMatch as DerivedMatch } from "@gamenight/shared";
import styles from "./Scoreboard.module.css";
import { cx } from "../ui/cx";
import { Tooltip } from "../ui/Tooltip";

export interface ScoreboardProps {
  match: DerivedMatch;
  /** Correction mode: cells are coloured right/wrong, get an orange border and are clickable. */
  correctionMode?: boolean;
  /** roundIndex is 0-based. */
  onCellClick?: (roundIndex: number, playerId: string) => void;
}

const medal = (placement: number | undefined) =>
  placement === 1 ? styles.gold : placement === 2 ? styles.silver : placement === 3 ? styles.bronze : undefined;

/** Round-by-round table: cell = "Ansage ┊ Gesamtpunkte". Used read-only (watch) and with correction mode (game). */
export function Scoreboard({ match, correctionMode = false, onCellClick }: ScoreboardProps) {
  const roundIndexes = Array.from({ length: match.roundsPlayed }, (_, i) => i);

  if (match.roundsPlayed === 0) {
    return <p className={styles.empty}>Noch keine Runde gewertet.</p>;
  }

  return (
    <div>
      <div className={styles.scroll} tabIndex={0} role="region" aria-label="Scoreboard">
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.rowHead}>
                <Tooltip content="Rundennummer und Anzahl Karten pro Spieler" side="bottom">
                  <span>Runde</span>
                </Tooltip>
              </th>
              {match.players.map((p) => (
                <th scope="col" key={p.id}>
                  <Tooltip content={p.placement !== null ? `${p.name} · ${p.placement}. Platz` : p.name} side="bottom">
                    <span className={styles.playerHead}>{p.name}</span>
                  </Tooltip>
                  {p.placement !== null && <span className={styles.rank}>{p.placement}. Platz</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roundIndexes.map((r) => (
              <tr key={r}>
                <th scope="row" className={styles.rowHead}>
                  <Tooltip content={`Runde ${r + 1} · ${match.roundCards[r] ?? 0} Karten`} side="right">
                    <span>{r + 1}</span>
                  </Tooltip>
                  <span className={styles.cards}>{match.roundCards[r] ?? 0} Karten</span>
                </th>
                {match.players.map((p) => {
                  const bid = p.bids[r];
                  const score = p.scores[r];
                  const right = p.correct[r];
                  const tricks = p.tricks[r] ?? null;
                  const placement = p.placements[r];
                  const label = `Runde ${r + 1}, ${p.name}: Ansage ${bid ?? "–"}, ${right ? "richtig" : "falsch"}, ${score ?? "–"} Punkte, Platz ${placement ?? "–"}`;
                  const content = (
                    <>
                      <span>
                        {bid}
                        {tricks !== null && tricks !== bid && <span className={styles.tricks}>/{tricks}</span>}
                      </span>
                      <span className={styles.sep} aria-hidden="true">
                        ┊
                      </span>
                      <span className={styles.score}>{score}</span>
                      {correctionMode && (
                        <span className={styles.mark} aria-hidden="true">
                          {right ? "✓" : "✗"}
                        </span>
                      )}
                    </>
                  );
                  const tip = `Ansage ${bid ?? "–"}${tricks !== null ? ` · ${tricks} Stiche` : ""} · ${right ? "richtig" : "falsch"} · ${score ?? "–"} Punkte · Platz ${placement ?? "–"}${
                    correctionMode && onCellClick ? " · Antippen zum Korrigieren" : ""
                  }`;
                  const clickable = correctionMode && !!onCellClick;
                  return (
                    <td
                      key={p.id}
                      data-testid={`cell-${r}-${p.id}`}
                      data-placement={placement}
                      data-correct={correctionMode ? String(!!right) : undefined}
                      className={cx(
                        styles.cell,
                        correctionMode ? (right ? styles.right : styles.wrong) : medal(placement),
                        clickable && styles.clickable,
                      )}
                    >
                      <Tooltip content={tip}>
                        {clickable ? (
                          <button type="button" className={styles.cellBtn} aria-label={label} onClick={() => onCellClick(r, p.id)}>
                            {content}
                          </button>
                        ) : (
                          <span aria-label={label}>{content}</span>
                        )}
                      </Tooltip>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.legend}>
        {correctionMode
          ? "Zelle antippen, um Ansage oder Ergebnis zu korrigieren. ✓ richtig · ✗ falsch"
          : "Zelle: Ansage ┊ Gesamtpunkte · Gold, Silber, Bronze = Platz 1–3 in dieser Runde"}
      </p>
    </div>
  );
}
