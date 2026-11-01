import type { ReactNode } from "react";
import styles from "./Feedback.module.css";
import { Button } from "./Button";
import { cx } from "./cx";

export interface SpinnerProps {
  size?: "md" | "lg";
  /** Centered block with padding (for page-level loading). */
  centered?: boolean;
  label?: string;
}

export function Spinner({ size = "md", centered, label = "Lädt …" }: SpinnerProps) {
  const el = <span className={cx(styles.spinner, size === "lg" && styles.lg)} role="status" aria-label={label} />;
  return centered ? <div className={styles.center}>{el}</div> : el;
}

export interface EmptyStateProps {
  title: string;
  text?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, text, icon = "🃏", action }: EmptyStateProps) {
  return (
    <div className={styles.state}>
      <div className={styles.icon} aria-hidden="true">
        {icon}
      </div>
      <div className={styles.stateTitle}>{title}</div>
      {text && <p className={styles.stateText}>{text}</p>}
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  /** Error message (German). Pass `error` to derive it. */
  message?: ReactNode;
  onRetry?: () => void;
}

export function ErrorState({ title = "Das hat nicht geklappt", message, onRetry }: ErrorStateProps) {
  return (
    <div className={cx(styles.state, styles.error)} role="alert">
      <div className={styles.icon} aria-hidden="true">
        ⚠️
      </div>
      <div className={styles.stateTitle}>{title}</div>
      {message && <p className={styles.stateText}>{message}</p>}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Erneut versuchen
        </Button>
      )}
    </div>
  );
}
