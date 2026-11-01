import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import styles from "./Tile.module.css";
import { cx } from "./cx";
import { Tooltip } from "./Tooltip";

export interface TileProps {
  to: string;
  title: string;
  description?: string;
  /** Image URL (imported asset). Blended with the teal background (luminosity) unless `plain`. */
  image?: string;
  /** Use object-fit: contain for icons/illustrations (svg). */
  contain?: boolean;
  /** Show the image in its own colours (logos) instead of blending it into the teal. */
  plain?: boolean;
  /** Custom artwork instead of an image (fills the tile behind the text). */
  art?: ReactNode;
  /** Background colour of the tile (default teal). */
  color?: string;
  /** Keep the title for screen readers only (when the artwork already shows it). */
  hideTitle?: boolean;
  className?: string;
  /** Optional tooltip (hover/focus/long-press). */
  tooltip?: string;
  onClick?: () => void;
}

/** Large rounded teal tile with an image, used on the home and stats screens. */
export function Tile({ to, title, description, image, contain, plain, art, color, hideTitle, className, tooltip, onClick }: TileProps) {
  const link = (
    <Link
      to={to}
      onClick={onClick}
      aria-label={hideTitle ? title : undefined}
      className={cx(styles.tile, color && styles.colored, className)}
      style={color ? ({ "--tile-bg": color } as CSSProperties) : undefined}
    >
      {image && <img src={image} alt="" className={cx(styles.image, contain && styles.contain, plain && styles.plain)} />}
      {art && <span className={styles.art}>{art}</span>}
      <span className={styles.text}>
        {!hideTitle && <span className={styles.title}>{title}</span>}
        {description && <span className={styles.desc}>{description}</span>}
      </span>
    </Link>
  );
  return tooltip ? <Tooltip content={tooltip}>{link}</Tooltip> : link;
}
