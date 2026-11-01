import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { previewDice, scoreDice, sheetCategories, type SheetCategory, type SheetDerivedMatch, type SheetMatchState } from "@gamenight/shared";
import { Button, Modal, NumberInput, Segmented, cx, useToast } from "../../../ui";
import { haptic } from "../haptics";
import { useGameStore } from "../store";
import { DicePicker } from "./DicePicker";
import { categoryById, describeScoring, entryIndexOf, pointRange, quickOptions, type CellRef } from "./sheetUtils";
import styles from "./Entry.module.css";

export type EntryTarget = { kind: "roll"; playerId: string } | { kind: "cell"; ref: CellRef };

/**
 * Entering scores:
 *   roll – enter the dice, then pick one of the open categories (with the points they would score)
 *   cell – a specific cell: pick points (or enter dice); filled cells can be corrected or cleared
 */
export function EntryDialog({
  state,
  match,
  target,
  onClose,
}: {
  state: SheetMatchState;
  match: SheetDerivedMatch;
  target: EntryTarget | null;
  onClose: () => void;
}) {
  const player = target ? match.players.find((p) => p.id === (target.kind === "roll" ? target.playerId : target.ref.playerId)) : undefined;
  const title = !target || !player ? "" : target.kind === "roll" ? `Wurf von ${player.name}` : `${player.name}: ${categoryById(state.rules, target.ref.categoryId)?.label ?? ""}`;
  return (
    <Modal open={!!target && !!player} onClose={onClose} title={title}>
      {target?.kind === "roll" && player && <RollEntry key={`roll-${player.id}`} state={state} playerId={player.id} onDone={onClose} />}
      {target?.kind === "cell" && player && <CellEntry key={`cell-${JSON.stringify(target.ref)}`} state={state} target={target.ref} onDone={onClose} />}
    </Modal>
  );
}

function useReport() {
  const toast = useToast();
  return (err: string | null, ok?: string): boolean => {
    if (err) {
      toast.show(err, { tone: "error" });
      return false;
    }
    haptic(10);
    if (ok) toast.show(ok, { tone: "success" });
    return true;
  };
}

/** Categories scored by a pattern (Pasch, Full House, Straße …): "reached" as soon as the dice entered so far form it. */
const isPattern = (c: SheetCategory) => c.scoring.type === "ofAKind" || c.scoring.type === "groups" || c.scoring.type === "straight";

const optionSpring = { type: "spring", stiffness: 420, damping: 34 } as const;

function RollEntry({ state, playerId, onDone }: { state: SheetMatchState; playerId: string; onDone: () => void }) {
  const dice = state.rules.dice!;
  const report = useReport();
  const reduce = useReducedMotion();
  const [roll, setRoll] = useState<number[]>([]);
  const complete = roll.length === dice.count;
  const cols = state.rules.columns;
  // A neutral full roll (not all the same, so no forced joker) tells which categories are still open.
  const probe = useMemo(() => Array.from({ length: dice.count }, (_, i) => (i % dice.faces) + 1), [dice]);
  const options = useMemo(() => {
    const list = cols.flatMap((col, ci) => {
      const preview = previewDice(state, playerId, ci, complete ? roll : probe);
      return sheetCategories(state.rules)
        .filter((c) => preview[c.id] !== undefined)
        .map((c, order) => {
          const partial = !complete && roll.length > 0 ? scoreDice(c.scoring, roll) : 0;
          return {
            column: ci,
            colLabel: cols.length > 1 ? col.label : null,
            cat: c,
            order,
            points: complete ? preview[c.id]! : null,
            reached: complete ? preview[c.id]! > 0 && isPattern(c) : partial > 0 && isPattern(c),
            partial,
          };
        });
    });
    // complete: best first (stable: ties keep sheet order), strikes last; while entering: reached patterns first
    return complete
      ? list.sort((a, b) => b.points! - a.points!)
      : list.sort((a, b) => Number(b.reached) - Number(a.reached) || a.column - b.column || a.order - b.order);
  }, [complete, cols, state, playerId, roll, probe]);
  const best = options.reduce((m, o) => Math.max(m, o.points ?? 0), 0);

  const pick = (column: number, categoryId: string) => {
    if (report(useGameStore.getState().scoreEntry({ playerId, column, categoryId, dice: roll }))) onDone();
  };

  return (
    <div className={styles.body}>
      <DicePicker count={dice.count} faces={dice.faces} value={roll} onChange={setRoll} />
      {!complete && (
        <p className={styles.hint}>
          {roll.length} von {dice.count} Würfeln eingegeben{roll.length === 0 ? " – noch offen:" : "."}
        </p>
      )}
      {options.length === 0 ? (
        complete && <p className={styles.hint}>Kein freies Feld passt – Feld zum Streichen in der Tabelle antippen.</p>
      ) : (
        <ul className={styles.options} aria-label={complete ? "Feld wählen" : "Offene Felder"}>
          {options.map((o) => (
            <motion.li key={`${o.column}-${o.cat.id}`} layout={reduce ? false : "position"} transition={optionSpring}>
              <button
                type="button"
                disabled={!complete}
                className={cx(
                  styles.option,
                  !complete && styles.optionPending,
                  o.reached && styles.optionReached,
                  o.points === 0 && styles.optionZero,
                  o.points === best && best > 0 && styles.optionBest,
                )}
                onClick={() => pick(o.column, o.cat.id)}
              >
                <span className={styles.optLabel}>
                  {o.cat.label}
                  {o.colLabel && <span className={styles.optCol}> · {o.colLabel}</span>}
                </span>
                {complete ? (
                  <span className={styles.optPts}>{o.points === 0 ? "streichen" : o.points}</span>
                ) : o.reached ? (
                  <motion.span
                    key="reached"
                    className={styles.optReached}
                    initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={optionSpring}
                  >
                    ✓ erreicht
                  </motion.span>
                ) : (
                  <span className={styles.optPartial}>{!isPattern(o.cat) && o.partial > 0 ? o.partial : "–"}</span>
                )}
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CellEntry({ state, target, onDone }: { state: SheetMatchState; target: CellRef; onDone: () => void }) {
  const report = useReport();
  const { rules } = state;
  const cat = categoryById(rules, target.categoryId)!;
  const idx = entryIndexOf(state, target);
  const existing = idx >= 0 ? state.entries[idx] : undefined;
  const canDice = !!rules.dice && cat.scoring.type !== "manual";
  const [mode, setMode] = useState<"points" | "dice">(existing?.dice ? "dice" : "points");
  const [points, setPoints] = useState<number | null>(existing ? existing.points : null);
  const [roll, setRoll] = useState<number[]>(existing?.dice ?? []);
  const [repeat, setRepeat] = useState<boolean>(existing?.repeat ?? false);
  const quick = quickOptions(cat.scoring, rules.dice);
  const range = pointRange(cat.scoring, rules.dice);
  const rollComplete = !!rules.dice && roll.length === rules.dice.count;
  const preview = useMemo(() => {
    if (!rollComplete) return undefined;
    // corrections are evaluated against the sheet without this entry
    const base = existing ? { ...state, entries: state.entries.slice(0, idx) } : state;
    return previewDice(base, target.playerId, target.column, roll)[target.categoryId];
  }, [rollComplete, existing, state, idx, target, roll]);

  const repeatPossible = !!rules.repeatBonus && cat.id !== rules.repeatBonus.categoryId;

  const save = (override?: number) => {
    const store = useGameStore.getState();
    let patch: { dice: number[] } | { points: number; repeat?: true };
    if (mode === "dice" && canDice) patch = { dice: roll };
    else {
      const value = override ?? points;
      if (value === null) return;
      patch = repeatPossible && repeat ? { points: value, repeat: true } : { points: value };
    }
    const err = existing
      ? store.correctEntry(idx, patch)
      : store.scoreEntry({ playerId: target.playerId, column: target.column, categoryId: target.categoryId, ...patch });
    if (report(err, existing ? "Eintrag korrigiert" : undefined)) onDone();
  };

  const clear = () => {
    if (report(useGameStore.getState().clearEntry(idx), "Eintrag gelöscht")) onDone();
  };

  return (
    <div className={styles.body}>
      <p className={styles.hint}>
        {describeScoring(cat.scoring)}
        {existing && (
          <>
            {" "}
            · eingetragen: <strong>{existing.points}</strong>
          </>
        )}
      </p>
      {canDice && (
        <Segmented
          ariaLabel="Eingabe"
          full
          value={mode}
          onChange={setMode}
          options={[
            { value: "points", label: "Punkte" },
            { value: "dice", label: "Würfel" },
          ]}
        />
      )}

      {mode === "dice" && canDice ? (
        <>
          <DicePicker count={rules.dice!.count} faces={rules.dice!.faces} value={roll} onChange={setRoll} />
          <p className={styles.result} aria-live="polite">
            {!rollComplete ? `${roll.length} von ${rules.dice!.count} Würfeln` : preview === undefined ? "Hier nicht möglich" : `${preview} Punkte`}
          </p>
        </>
      ) : quick ? (
        <div className={styles.quick} role="group" aria-label="Punkte wählen">
          {quick.map((v) => (
            <button
              key={v}
              type="button"
              className={cx(styles.quickBtn, points === v && styles.quickOn, v === 0 && styles.quickZero)}
              aria-pressed={points === v}
              onClick={() => (repeatPossible ? setPoints(v) : save(v))}
            >
              {v === 0 ? "Streichen" : v}
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.numberRow}>
          <NumberInput label="Punkte" value={points} min={range.min} max={range.max} onChange={setPoints} />
          {cat.scoring.type !== "manual" && (
            <Button variant="secondary" onClick={() => save(0)}>
              Streichen
            </Button>
          )}
        </div>
      )}

      {mode === "points" && repeatPossible && (
        <label className={styles.repeat}>
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          <span>Weiterer Wurf „{categoryById(rules, rules.repeatBonus!.categoryId)?.label}“ (Extra-Bonus/Joker)</span>
        </label>
      )}

      <div className={styles.actions}>
        {existing && (
          <Button variant="danger" onClick={clear}>
            Löschen
          </Button>
        )}
        <span className={styles.spacer} />
        {(mode === "dice" || !quick || repeatPossible || existing) && (
          <Button
            variant="primary"
            disabled={mode === "dice" ? preview === undefined : points === null}
            onClick={() => save()}
          >
            {existing ? "Speichern" : "Eintragen"}
          </Button>
        )}
      </div>
    </div>
  );
}
