import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { springs } from "./motion";
import styles from "./Dropdown.module.css";
import { cx } from "./cx";

export interface DropdownItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Marks the currently active option (shows a check mark). */
  selected?: boolean;
  /** Draws a separator line above this item. */
  separatorBefore?: boolean;
}

export interface DropdownProps {
  /** Renders the trigger. Spread `triggerProps` onto a button-like element. */
  trigger: (args: {
    open: boolean;
    triggerProps: {
      "aria-haspopup": "menu";
      "aria-expanded": boolean;
      "aria-controls": string;
      onClick: () => void;
    };
  }) => ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
  direction?: "down" | "up";
}

/** Accessible popup menu (role="menu"): click outside / ESC closes, arrow keys navigate. */
export function Dropdown({ trigger, items, align = "left", direction = "down" }: DropdownProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      wrapRef.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = Array.from(wrapRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
    if (els.length === 0) return;
    const idx = els.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (idx + 1) % els.length : (idx - 1 + els.length) % els.length;
    els[next]?.focus();
  };

  return (
    <div className={styles.wrap} ref={wrapRef} onKeyDown={onKeyDown}>
      {trigger({
        open,
        triggerProps: {
          "aria-haspopup": "menu",
          "aria-expanded": open,
          "aria-controls": menuId,
          onClick: () => setOpen((o) => !o),
        },
      })}
      <AnimatePresence>
      {open && (
        <motion.ul
          id={menuId}
          role="menu"
          className={cx(styles.menu, styles[align], direction === "up" && styles.up)}
          style={{ transformOrigin: `${direction === "up" ? "bottom" : "top"} ${align}` }}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: direction === "up" ? 6 : -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
          transition={reduce ? { duration: 0.1 } : { ...springs.snappy, opacity: { duration: 0.12 } }}
        >
          {items.map((item) => (
            <li key={item.key} role="none">
              {item.separatorBefore && <div className={styles.sep} role="separator" />}
              <button
                type="button"
                role="menuitem"
                className={cx(styles.item, item.danger && styles.danger, item.selected && styles.selected)}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon}
                {item.label}
                {item.selected && (
                  <span className={styles.check} aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}
        </motion.ul>
      )}
      </AnimatePresence>
    </div>
  );
}
