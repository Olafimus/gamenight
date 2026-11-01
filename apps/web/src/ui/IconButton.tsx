import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./IconButton.module.css";
import { cx } from "./cx";
import { Tooltip } from "./Tooltip";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Required accessible name (German). Also shown as tooltip. */
  label: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "solid" | "danger";
  /** Tooltip text; defaults to `label`. `false` disables the tooltip. */
  tooltip?: string | false;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, size = "md", tone = "default", tooltip, className, type = "button", ...rest },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cx(styles.icon, size !== "md" && styles[size], tone !== "default" && styles[tone], className)}
      {...rest}
    >
      <span aria-hidden="true" style={{ display: "inline-grid", placeItems: "center" }}>
        {children}
      </span>
    </button>
  );
  return tooltip === false ? btn : <Tooltip content={tooltip ?? label}>{btn}</Tooltip>;
});
