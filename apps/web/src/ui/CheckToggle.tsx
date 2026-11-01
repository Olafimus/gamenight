import { motion, useReducedMotion } from "motion/react";
import { springs } from "./motion";
import styles from "./CheckToggle.module.css";
import { cx } from "./cx";
import { Tooltip } from "./Tooltip";

export interface CheckToggleProps {
  /** true = richtig, false = falsch, undefined = nicht markiert. */
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  /** Name of the thing being marked, e.g. "Anna" -> aria-label "Anna: richtig". */
  label: string;
  disabled?: boolean;
  compact?: boolean;
}

/** Paired ✓ / ✗ toggle. State is conveyed by symbol + aria-pressed, not by colour alone. */
export function CheckToggle({ value, onChange, label, disabled, compact }: CheckToggleProps) {
  const reduce = useReducedMotion();
  const pop = (on: boolean) => ({
    initial: false as const,
    animate: reduce || !on ? { scale: 1 } : { scale: [0.5, 1.25, 1] },
    transition: reduce ? { duration: 0 } : { ...springs.bouncy, duration: 0.35 },
  });
  return (
    <div role="group" aria-label={`${label}: Richtig?`} className={cx(styles.group, compact && styles.compact)}>
      <Tooltip content="Richtig">
        <button
          type="button"
          className={cx(styles.btn, styles.yes)}
          aria-pressed={value === true}
          aria-label={`${label}: richtig`}
          disabled={disabled}
          onClick={() => onChange(true)}
        >
          <motion.span aria-hidden="true" key={String(value === true)} {...pop(value === true)}>
            ✓
          </motion.span>
        </button>
      </Tooltip>
      <Tooltip content="Falsch">
        <button
          type="button"
          className={cx(styles.btn, styles.no)}
          aria-pressed={value === false}
          aria-label={`${label}: falsch`}
          disabled={disabled}
          onClick={() => onChange(false)}
        >
          <motion.span aria-hidden="true" key={String(value === false)} {...pop(value === false)}>
            ✗
          </motion.span>
        </button>
      </Tooltip>
    </div>
  );
}
