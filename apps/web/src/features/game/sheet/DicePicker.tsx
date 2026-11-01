import { cx } from "../../../ui";
import { haptic } from "../haptics";
import styles from "./Entry.module.css";

const PIPS = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
export const dieLabel = (v: number, faces: number) => (faces <= 6 ? (PIPS[v - 1] ?? String(v)) : String(v));

/** Enter a roll: tap faces to fill the slots, tap a slot to remove that die. */
export function DicePicker({
  count,
  faces,
  value,
  onChange,
}: {
  count: number;
  faces: number;
  value: number[];
  onChange: (dice: number[]) => void;
}) {
  const add = (f: number) => {
    if (value.length >= count) return;
    haptic(5);
    onChange([...value, f]);
  };
  return (
    <div className={styles.dice}>
      <div className={styles.slots} role="group" aria-label="Wurf">
        {Array.from({ length: count }, (_, i) => {
          const v = value[i];
          return (
            <button
              key={i}
              type="button"
              className={cx(styles.slot, v !== undefined && styles.slotFilled)}
              aria-label={v === undefined ? `Würfel ${i + 1}: leer` : `Würfel ${i + 1}: ${v} – entfernen`}
              disabled={v === undefined}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              {v === undefined ? "" : dieLabel(v, faces)}
            </button>
          );
        })}
        {value.length > 0 && (
          <button type="button" className={styles.clearDice} onClick={() => onChange([])}>
            leeren
          </button>
        )}
      </div>
      <div className={styles.faces} role="group" aria-label="Augenzahl hinzufügen">
        {Array.from({ length: faces }, (_, i) => i + 1).map((f) => (
          <button key={f} type="button" className={styles.face} aria-label={`${f} hinzufügen`} disabled={value.length >= count} onClick={() => add(f)}>
            <span className={styles.faceGlyph}>{dieLabel(f, faces)}</span>
            {faces <= 6 && <span className={styles.faceNum}>{f}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
