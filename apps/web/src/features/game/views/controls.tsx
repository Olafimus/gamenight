import { useCallback } from "react";
import { useToast } from "../../../ui";
import { cx } from "../../../ui";
import { haptic } from "../haptics";
import { useGameStore } from "../store";
import styles from "./controls.module.css";

/** Bid stepper with 44px+ touch targets. The value is shown as text (no keyboard popping up on tablets). */
export function BidStepper({
  name,
  value,
  max,
  disabled,
  big,
  onChange,
}: {
  name: string;
  value: number;
  max: number;
  disabled?: boolean;
  big?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className={cx(styles.stepper, big && styles.big)} role="group" aria-label={`Ansage von ${name}`}>
      <button type="button" className={styles.step} aria-label={`Ansage von ${name} verringern`} disabled={disabled || value <= 0} onClick={() => onChange(value - 1)}>
        <span aria-hidden="true">−</span>
      </button>
      <output className={styles.val} aria-label={`Ansage von ${name}: ${value}`}>
        {value}
      </output>
      <button type="button" className={styles.step} aria-label={`Ansage von ${name} erhöhen`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}

/** ✓ / ✗ pair; state is conveyed by symbol + aria-pressed. Vibrates on tap where supported. */
export function MarkToggle({
  name,
  value,
  disabled,
  big,
  onChange,
}: {
  name: string;
  value: boolean | undefined;
  disabled?: boolean;
  big?: boolean;
  onChange: (v: boolean) => void;
}) {
  const set = (v: boolean) => {
    haptic(10);
    onChange(v);
  };
  return (
    <div className={cx(styles.marks, big && styles.bigMarks)} role="group" aria-label={`${name}: Richtig?`}>
      <button type="button" className={cx(styles.mark, styles.yes)} aria-pressed={value === true} aria-label={`${name}: richtig`} disabled={disabled} onClick={() => set(true)}>
        <span aria-hidden="true">✓</span>
      </button>
      <button type="button" className={cx(styles.mark, styles.no)} aria-pressed={value === false} aria-label={`${name}: falsch`} disabled={disabled} onClick={() => set(false)}>
        <span aria-hidden="true">✗</span>
      </button>
    </div>
  );
}

export interface RoundActions {
  setBid: (id: string, v: number) => void;
  setCorrect: (id: string, v: boolean) => void;
  setAll: (v: boolean) => void;
  reset: () => void;
  commit: () => void;
  undo: () => void;
}

/** Store actions with toast error reporting and haptic feedback on commit. */
export function useRoundActions(): RoundActions {
  const toast = useToast();
  const report = useCallback((err: string | null) => err && toast.show(err, { tone: "error" }), [toast]);
  return {
    setBid: (id, v) => report(useGameStore.getState().setBid(id, v)),
    setCorrect: (id, v) => report(useGameStore.getState().setCorrect(id, v)),
    setAll: (v) => {
      haptic(10);
      report(useGameStore.getState().setAllCorrect(v));
    },
    reset: () => report(useGameStore.getState().resetRound()),
    commit: () => {
      haptic(10);
      report(useGameStore.getState().commit());
    },
    undo: () => report(useGameStore.getState().undo()),
  };
}
