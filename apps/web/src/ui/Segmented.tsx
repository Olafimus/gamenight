import { useId, type ReactNode } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { springs } from "./motion";
import styles from "./Segmented.module.css";
import { cx } from "./cx";
import { Tooltip } from "./Tooltip";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  /** Optional tooltip explaining this option. */
  tooltip?: string;
}

export interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group, e.g. "Deckgröße". */
  ariaLabel: string;
  /** "chips" renders separate outlined chips (filters); default is a connected pill. */
  variant?: "pill" | "chips";
  /** Stretch to full width. */
  full?: boolean;
  className?: string;
}

/** Single-select Tabs/Segmented control (deck size 32/52/64, filter chips). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  variant = "pill",
  full,
  className,
}: SegmentedProps<T>) {
  const id = useId();
  const reduce = useReducedMotion();
  return (
    <LayoutGroup id={id}>
    <div role="group" aria-label={ariaLabel} className={cx(styles.group, variant === "chips" && styles.chips, full && styles.full, className)}>
      {options.map((o) => {
        const btn = (
          <button
            key={String(o.value)}
            type="button"
            className={styles.opt}
            aria-pressed={o.value === value}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
          >
            {o.value === value && (
              <motion.span
                layoutId="pill"
                className={styles.pill}
                transition={reduce ? { duration: 0 } : springs.smooth}
                aria-hidden="true"
              />
            )}
            <span className={styles.label}>{o.label}</span>
          </button>
        );
        return o.tooltip ? (
          <Tooltip key={String(o.value)} content={o.tooltip}>
            {btn}
          </Tooltip>
        ) : (
          btn
        );
      })}
    </div>
    </LayoutGroup>
  );
}
