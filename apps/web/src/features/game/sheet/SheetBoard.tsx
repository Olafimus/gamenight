import { Fragment, useEffect, useRef } from "react";
import type { SheetDerivedMatch, SheetDerivedPlayer, SheetMatchState } from "@gamenight/shared";
import { cx } from "../../../ui";
import { describeScoring, type CellRef } from "./sheetUtils";
import styles from "./Sheet.module.css";

export interface SheetBoardProps {
  state: SheetMatchState;
  match: SheetDerivedMatch;
  /** Interactive when set: tap on a cell (open or filled). */
  onCell?: (ref: CellRef) => void;
  /** Fill the parent (a flex column) and be its only scroller. */
  fill?: boolean;
}

const MEDAL: Record<number, string> = { 1: styles.gold!, 2: styles.silver!, 3: styles.bronze! };

/** The score sheet: categories as rows, players (× columns) as columns, with section sums, bonuses and totals. */
export function SheetBoard({ state, match, onCell, fill }: SheetBoardProps) {
  const { rules } = state;
  const cols = rules.columns;
  const multi = cols.length > 1;
  const span = cols.length;
  const players = match.players;
  const active = match.activePlayerId;
  const isActive = (p: SheetDerivedPlayer) => p.id === active;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Narrow screens: keep the player on turn in view (scroll the sheet sideways, not the page).
  useEffect(() => {
    const box = scrollRef.current;
    const head = box?.querySelector<HTMLElement>("[data-active-head]");
    if (!box || !head || box.scrollWidth <= box.clientWidth) return;
    const sticky = box.querySelector<HTMLElement>("thead th")?.offsetWidth ?? 0;
    const left = head.offsetLeft - sticky - (box.clientWidth - sticky - head.offsetWidth) / 2;
    box.scrollTo?.({ left: Math.max(0, left), behavior: "smooth" });
  }, [active]);

  /** One <td> per player × column. */
  const perColumn = (render: (p: SheetDerivedPlayer, ci: number) => React.ReactNode, cls?: string) =>
    players.map((p) =>
      cols.map((_, ci) => (
        <td key={`${p.id}-${ci}`} className={cx(cls, isActive(p) && styles.activeCol, ci === 0 && styles.playerStart)}>
          {render(p, ci)}
        </td>
      )),
    );

  return (
    <div className={cx(styles.scroll, fill && styles.fill)} ref={scrollRef}>
      <table className={styles.table} data-testid="sheet">
        <thead>
          <tr>
            <th className={styles.rowHead} rowSpan={multi ? 2 : 1}>
              {state.ruleset.name}
            </th>
            {players.map((p) => (
              <th
                key={p.id}
                colSpan={span}
                className={cx(styles.playerHead, isActive(p) && styles.activeHead, styles.playerStart)}
                scope="colgroup"
                data-active-head={isActive(p) || undefined}
              >
                <span className={styles.pname}>{p.name}</span>
                {isActive(p) && <span className={styles.turn}>am Zug</span>}
              </th>
            ))}
          </tr>
          {multi && (
            <tr>
              {players.map((p) =>
                cols.map((c, ci) => (
                  <th key={`${p.id}-${ci}`} className={cx(styles.colHead, isActive(p) && styles.activeHead, ci === 0 && styles.playerStart)}>
                    {c.label}
                    {c.multiplier > 1 && <span className={styles.mult}> ×{c.multiplier}</span>}
                  </th>
                )),
              )}
            </tr>
          )}
        </thead>
        <tbody>
          {rules.sections.map((sec, si) => (
            <Fragment key={sec.id}>
              {sec.categories.map((cat) => (
                <tr key={cat.id}>
                  <th scope="row" className={styles.rowHead} title={describeScoring(cat.scoring)}>
                    <span className={styles.long}>{cat.label}</span>
                    <span className={styles.short}>{cat.short ?? cat.label}</span>
                  </th>
                  {perColumn((p, ci) => {
                    const cell = p.columns[ci]?.cells[cat.id] ?? null;
                    const label = cell ? (cell.points === 0 ? "–" : String(cell.points)) : "";
                    const content = (
                      <>
                        {label}
                        {cell && cell.repeatBonus > 0 && <sup className={styles.bonusMark}>+{cell.repeatBonus}</sup>}
                      </>
                    );
                    if (!onCell) return content;
                    return (
                      <button
                        type="button"
                        className={cx(styles.cellBtn, !cell && styles.open, cell?.points === 0 && styles.struck)}
                        aria-label={`${p.name}${multi ? ` (${cols[ci]!.label})` : ""}, ${cat.label}: ${cell ? `${cell.points} Punkte` : "offen"}`}
                        data-testid={`cell-${p.id}-${ci}-${cat.id}`}
                        onClick={() => onCell({ playerId: p.id, column: ci, categoryId: cat.id })}
                      >
                        {cell ? content : (
                          <span className={styles.slot} aria-hidden="true">
                            +
                          </span>
                        )}
                      </button>
                    );
                  }, styles.cell)}
                </tr>
              ))}
              <tr className={styles.sumRow}>
                <th scope="row" className={styles.rowHead}>
                  Summe {rules.sections.length > 1 ? sec.label : ""}
                </th>
                {perColumn((p, ci) => p.columns[ci]?.sections[si]?.sum ?? 0)}
              </tr>
              {sec.bonuses.map((b) => (
                <tr key={b.id} className={styles.bonusRow}>
                  <th scope="row" className={styles.rowHead}>
                    {b.label}
                  </th>
                  {perColumn((p, ci) => {
                    const st = p.columns[ci]?.sections[si];
                    if (!st) return null;
                    if (st.bonuses.includes(b.id)) return <span className={styles.reached}>+{b.points}</span>;
                    if (st.filled) return "–";
                    const missing = b.threshold - st.sum;
                    return <span className={styles.missing} title={`Noch ${missing} bis zum Bonus`}>noch {missing}</span>;
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
          {rules.repeatBonus && (
            <tr className={styles.bonusRow}>
              <th scope="row" className={styles.rowHead}>
                Extra-Bonus
              </th>
              {perColumn((p, ci) => {
                const v = p.columns[ci]?.repeatBonusPoints ?? 0;
                return v > 0 ? <span className={styles.reached}>+{v}</span> : "–";
              })}
            </tr>
          )}
          {multi && (
            <tr className={styles.sumRow}>
              <th scope="row" className={styles.rowHead}>
                Spalte
              </th>
              {perColumn((p, ci) => {
                const c = p.columns[ci];
                return c ? (c.multiplier > 1 ? `${c.raw} ×${c.multiplier} = ${c.total}` : c.total) : 0;
              })}
            </tr>
          )}
          <tr className={styles.totalRow}>
            <th scope="row" className={styles.rowHead}>
              Gesamt
            </th>
            {players.map((p) => (
              <td
                key={p.id}
                colSpan={span}
                className={cx(styles.total, styles.playerStart, p.placement !== null && match.roundsPlayed > 0 && MEDAL[p.placement])}
                data-testid={`total-${p.id}`}
              >
                {p.total}
                {p.placement !== null && <span className={styles.place}> · {p.placement}.</span>}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
