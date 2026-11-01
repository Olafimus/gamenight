import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import styles from "./SkewRow.module.css";
import { cx } from "./cx";

export interface SkewRowProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  children: ReactNode;
  /** Colour treatment: default surface, alternating cyan tint, gold / green gradient (ceremony), teal. */
  tone?: "default" | "alt" | "gold" | "green" | "teal";
  /** "left" = skewX(-25deg) (default), "right" = skewX(15deg). */
  direction?: "left" | "right";
  /** Renders as a list item when used inside <ul>. */
  as?: "div" | "li";
  interactive?: boolean;
  innerStyle?: CSSProperties;
}

/** Skewed list row (brand element). Content is counter-skewed so text stays upright. */
export function SkewRow({
  children,
  tone = "default",
  direction = "left",
  as: Tag = "div",
  interactive,
  className,
  innerStyle,
  ...rest
}: SkewRowProps) {
  return (
    <Tag
      className={cx(
        styles.row,
        direction === "right" && styles.right,
        tone !== "default" && styles[tone],
        interactive && styles.interactive,
        className,
      )}
      {...(rest as HTMLAttributes<HTMLElement>)}
    >
      <span className={styles.inner} style={innerStyle}>
        {children}
      </span>
    </Tag>
  );
}
