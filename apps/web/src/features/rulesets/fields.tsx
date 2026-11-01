import { useEffect, useState, type ReactNode } from "react";
import styles from "./Rulesets.module.css";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
      {hint && <span className={styles.fieldHint}>{hint}</span>}
    </label>
  );
}

/** Integer input that allows negatives and keeps an empty/partial value while typing. */
export function Num({
  value,
  onChange,
  min,
  max,
  disabled,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  label?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className={styles.numIn}
      type="number"
      inputMode="numeric"
      aria-label={label}
      value={text}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isInteger(n)) onChange(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

export function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <select className={styles.select} aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Text({ value, onChange, label, placeholder, className }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; className?: string }) {
  return <input className={className ?? styles.textIn} aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}
