import { Link } from "react-router-dom";
import styles from "./Tile.module.css";
import { cx } from "./cx";
import { Tooltip } from "./Tooltip";

export interface TileProps {
  to: string;
  title: string;
  description?: string;
  /** Image URL (imported asset). Blended with the teal background (luminosity). */
  image?: string;
  /** Use object-fit: contain for icons/illustrations (svg). */
  contain?: boolean;
  className?: string;
  /** Optional tooltip (hover/focus/long-press). */
  tooltip?: string;
}

/** Large rounded teal tile with an image, used on the home and stats screens. */
export function Tile({ to, title, description, image, contain, className, tooltip }: TileProps) {
  const link = (
    <Link to={to} className={cx(styles.tile, className)}>
      {image && <img src={image} alt="" className={cx(styles.image, contain && styles.contain)} />}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.desc}>{description}</span>}
      </span>
    </Link>
  );
  return tooltip ? <Tooltip content={tooltip}>{link}</Tooltip> : link;
}
