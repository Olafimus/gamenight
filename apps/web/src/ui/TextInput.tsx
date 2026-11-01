import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import styles from "./TextInput.module.css";
import { cx } from "./cx";
import { InfoTip } from "./Tooltip";

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
  /** Hides the visible label (still used as accessible name). */
  hideLabel?: boolean;
  /** Optional explanation shown via an (i) InfoTip next to the label. */
  info?: ReactNode;
}

/** Labelled pill text input with hint/error text. */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, error, hideLabel, info, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = `${inputId}-desc`;
  return (
    <div className={cx(styles.field, className)}>
      <div className={styles.labelRow}>
        <label htmlFor={inputId} className={hideLabel ? "sr-only" : styles.label}>
          {label}
        </label>
        {info ? <InfoTip content={info} label={`Hinweis zu ${label}`} /> : null}
      </div>
      <input
        ref={ref}
        id={inputId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? descId : undefined}
        {...rest}
      />
      {(error || hint) && (
        <span id={descId} className={error ? styles.error : styles.hint}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
});
