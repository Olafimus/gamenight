import { useId, type CSSProperties } from "react";
import styles from "./NumberInput.module.css";
import { cx } from "./cx";
import { Tooltip } from "./Tooltip";

export interface NumberInputProps {
  /** null = empty. */
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible name, e.g. "Ansage von Anna". */
  label: string;
  placeholder?: string;
  disabled?: boolean;
  /** Dark variant instead of the white pill. */
  dark?: boolean;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Pill-shaped numeric input with large digits and +/- steppers (touch friendly). */
export function NumberInput({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  label,
  placeholder,
  disabled,
  dark,
  compact,
  className,
  style,
}: NumberInputProps) {
  const id = useId();
  const dec = () => onChange(value === null ? min : clamp(value - step, min, max));
  const inc = () => onChange(value === null ? clamp(min + step > max ? min : min + step, min, max) : clamp(value + step, min, max));

  return (
    <div className={cx(styles.wrap, dark && styles.dark, compact && styles.compact, className)} style={style}>
      <Tooltip content="Verringern">
        <button
          type="button"
          className={styles.step}
          aria-label={`${label} verringern`}
          onClick={dec}
          disabled={disabled || value === null || value <= min}
        >
          <span aria-hidden="true">−</span>
        </button>
      </Tooltip>
      <input
        id={id}
        className={styles.input}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        placeholder={placeholder}
        disabled={disabled}
        value={value === null ? "" : String(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d-]/g, "");
          if (raw === "" || raw === "-") return onChange(null);
          const n = Number.parseInt(raw, 10);
          if (!Number.isNaN(n)) onChange(clamp(n, min, max));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            inc();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            dec();
          }
        }}
      />
      <Tooltip content="Erhöhen">
        <button
          type="button"
          className={styles.step}
          aria-label={`${label} erhöhen`}
          onClick={inc}
          disabled={disabled || (value !== null && value >= max)}
        >
          <span aria-hidden="true">+</span>
        </button>
      </Tooltip>
    </div>
  );
}
