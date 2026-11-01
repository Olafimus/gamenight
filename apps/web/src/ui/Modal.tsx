import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMediaQuery } from "../lib/useMediaQuery";
import { springs } from "./motion";
import { IoClose } from "react-icons/io5";
import styles from "./Modal.module.css";
import { IconButton } from "./IconButton";
import { cx } from "./cx";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Rendered in the footer (usually Buttons). */
  footer?: ReactNode;
  wide?: boolean;
  /** Set false to disable closing via ESC/backdrop/X (e.g. while saving). */
  dismissible?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, footer, wide, dismissible = true }: ModalProps) {
  const reduce = useReducedMotion();
  const sheet = useMediaQuery("(max-width: 599px)");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    // Prefer an explicitly marked field, then the first field in the body, then the dialog itself.
    const target =
      dialog?.querySelector<HTMLElement>("[data-autofocus]") ??
      dialog?.querySelector<HTMLElement>("[data-modal-body] input, [data-modal-body] select, [data-modal-body] textarea") ??
      dialog;
    target?.focus();
    // The root element is the page scroller (html has overflow-x set), so lock scrolling there.
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, dismissible]);

  const dialogMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
    : sheet
      ? { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" }, transition: { type: "spring" as const, stiffness: 420, damping: 40, mass: 0.9 } }
      : { initial: { opacity: 0, scale: 0.94, y: 12 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.97, y: 6 }, transition: springs.snappy };

  return createPortal(
    <AnimatePresence>
    {open && (
    <motion.div
      key="modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className={styles.backdrop}
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={dialogRef}
        {...dialogMotion}
        className={cx(styles.dialog, wide && styles.wide)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {dismissible && (
            <IconButton label="Schließen" size="sm" onClick={onClose}>
              <IoClose />
            </IconButton>
          )}
        </div>
        <div className={styles.body} data-modal-body>
          {children}
        </div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </motion.div>
    </motion.div>
    )}
    </AnimatePresence>,
    document.body,
  );
}
