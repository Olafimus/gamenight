import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";
import styles from "./Button.module.css";
import { cx } from "./cx";
import { Tooltip } from "./Tooltip";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "success";
export type ButtonSize = "sm" | "md" | "lg";

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full-width button. */
  block?: boolean;
}

export interface ButtonProps extends CommonProps, ButtonHTMLAttributes<HTMLButtonElement> {
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Optional tooltip text (hover/focus/long-press). */
  tooltip?: string;
}

function classes({ variant = "primary", size = "md", block, className }: CommonProps & { className?: string | undefined }) {
  return cx(styles.btn, styles[variant], styles[size], block && styles.block, className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, loading, tooltip, className, children, disabled, type = "button", ...rest },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      type={type}
      className={classes({ variant, size, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  );
  return tooltip ? <Tooltip content={tooltip}>{btn}</Tooltip> : btn;
});

export type ButtonLinkProps = CommonProps & LinkProps & AnchorHTMLAttributes<HTMLAnchorElement>;

/** Router link that looks like a Button. */
export function ButtonLink({ variant, size, block, className, ...rest }: ButtonLinkProps) {
  return <Link className={classes({ variant, size, block, className })} {...rest} />;
}
