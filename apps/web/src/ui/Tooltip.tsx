import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { IoInformationCircleOutline } from "react-icons/io5";
import styles from "./Tooltip.module.css";
import { cx } from "./cx";

export type TooltipSide = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  /** Tooltip text/content. Falsy content (null, "", false) disables the tooltip. */
  content: ReactNode;
  /** Preferred side; flips automatically when there is no room. Default "top". */
  side?: TooltipSide;
  /** Hover delay in ms (desktop). Default 400. Keyboard focus opens immediately. */
  delay?: number;
  /** "hover" (default): hover/focus/long-press. "click": additionally opens (sticky) on click/tap. */
  trigger?: "hover" | "click";
  /** Exactly one element that accepts ref + DOM event props. */
  children: ReactElement;
}

const MARGIN = 8;
const GAP = 10;
const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;

type Pos = { top: number; left: number; side: TooltipSide; arrow: number };

function compute(trigger: DOMRect, tip: DOMRect, preferred: TooltipSide): Pos {
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  const room: Record<TooltipSide, number> = {
    top: trigger.top - MARGIN,
    bottom: vh - trigger.bottom - MARGIN,
    left: trigger.left - MARGIN,
    right: vw - trigger.right - MARGIN,
  };
  const need = (s: TooltipSide) => (s === "top" || s === "bottom" ? tip.height : tip.width) + GAP;
  const opposite: Record<TooltipSide, TooltipSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };
  let side = preferred;
  if (room[side] < need(side) && room[opposite[side]] >= need(opposite[side])) side = opposite[side];
  // Horizontal sides that still do not fit (narrow phones) fall back to vertical.
  if ((side === "left" || side === "right") && room[side] < need(side)) {
    side = room.top >= need("top") || room.top >= room.bottom ? "top" : "bottom";
  }

  const cx0 = trigger.left + trigger.width / 2;
  const cy0 = trigger.top + trigger.height / 2;
  let top: number;
  let left: number;
  let arrow: number;
  if (side === "top" || side === "bottom") {
    top = side === "top" ? trigger.top - tip.height - GAP : trigger.bottom + GAP;
    left = Math.min(Math.max(cx0 - tip.width / 2, MARGIN), Math.max(MARGIN, vw - tip.width - MARGIN));
    arrow = Math.min(Math.max(cx0 - left, 12), Math.max(12, tip.width - 12));
  } else {
    left = side === "left" ? trigger.left - tip.width - GAP : trigger.right + GAP;
    top = Math.min(Math.max(cy0 - tip.height / 2, MARGIN), Math.max(MARGIN, vh - tip.height - MARGIN));
    arrow = Math.min(Math.max(cy0 - top, 12), Math.max(12, tip.height - 12));
  }
  return { top, left, side, arrow };
}

function setRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) (ref as { current: T | null }).current = node;
}

function focusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * Accessible tooltip. Hover (after `delay`) and keyboard focus open it, ESC closes it.
 * On touch it opens on long-press and closes on tap outside / scroll; normal taps pass through untouched.
 */
export function Tooltip({ content, side = "top", delay = 400, trigger = "hover", children }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const pressTimer = useRef<number | undefined>(undefined);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const sticky = useRef(false);
  const longPressed = useRef(false);
  const enabled = !(content === null || content === undefined || content === false || content === "");

  const close = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    window.clearTimeout(pressTimer.current);
    sticky.current = false;
    setOpen(false);
    setPos(null);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(hoverTimer.current);
      window.clearTimeout(pressTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!enabled && open) close();
  }, [enabled, open, close]);

  // Position after render (measure real size).
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tipRef.current) return;
    const update = () => {
      if (!triggerRef.current || !tipRef.current) return;
      setPos(compute(triggerRef.current.getBoundingClientRect(), tipRef.current.getBoundingClientRect(), side));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, side, content]);

  // Dismiss handlers while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: Event) => {
      const t = e.target as Node | null;
      if (t && (triggerRef.current?.contains(t) || tipRef.current?.contains(t))) return;
      close();
    };
    const onScroll = () => close();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close]);

  if (!isValidElement(children)) return children as unknown as ReactElement;
  const child = children as ReactElement<Record<string, unknown>> & { ref?: Ref<HTMLElement> };
  const cp = child.props as Record<string, ((e: never) => void) | undefined>;

  const mergedRef = (node: HTMLElement | null) => {
    triggerRef.current = node;
    setRef(child.ref, node);
  };

  const handlers = {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      cp.onPointerEnter?.(e as never);
      if (!enabled || e.pointerType === "touch") return;
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => setOpen(true), delay);
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      cp.onPointerLeave?.(e as never);
      if (e.pointerType === "touch") return;
      window.clearTimeout(hoverTimer.current);
      if (!sticky.current) close();
    },
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      cp.onPointerDown?.(e as never);
      if (!enabled) return;
      if (e.pointerType === "touch") {
        longPressed.current = false;
        pressStart.current = { x: e.clientX, y: e.clientY };
        window.clearTimeout(pressTimer.current);
        pressTimer.current = window.setTimeout(() => {
          longPressed.current = true;
          sticky.current = true;
          setOpen(true);
        }, LONG_PRESS_MS);
      } else if (trigger === "hover") {
        // Mouse press means intent to act; hide the tooltip.
        close();
      }
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      cp.onPointerMove?.(e as never);
      const s = pressStart.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) {
        window.clearTimeout(pressTimer.current);
        pressStart.current = null;
      }
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      cp.onPointerUp?.(e as never);
      window.clearTimeout(pressTimer.current);
      pressStart.current = null;
    },
    onPointerCancel: (e: PointerEvent<HTMLElement>) => {
      cp.onPointerCancel?.(e as never);
      window.clearTimeout(pressTimer.current);
      pressStart.current = null;
    },
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      cp.onContextMenu?.(e as never);
      // Suppress the native long-press menu on touch while we show the tooltip.
      if (enabled && (longPressed.current || pressStart.current)) e.preventDefault();
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      // A long press that opened the tooltip must not also trigger the action.
      if (longPressed.current) {
        longPressed.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (trigger === "click" && enabled) {
        if (open && sticky.current) close();
        else {
          sticky.current = true;
          setOpen(true);
        }
      }
      cp.onClick?.(e as never);
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      cp.onFocus?.(e as never);
      if (enabled && focusVisible(e.currentTarget)) setOpen(true);
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      cp.onBlur?.(e as never);
      close();
    },
  };

  const existing = child.props["aria-describedby"] as string | undefined;
  const trig = cloneElement(child, {
    ...handlers,
    ref: mergedRef,
    "aria-describedby": open && enabled ? [existing, id].filter(Boolean).join(" ") : existing,
  } as Record<string, unknown>);

  return (
    <>
      {trig}
      {open && enabled
        ? createPortal(
            <div
              ref={tipRef}
              id={id}
              role="tooltip"
              className={cx(styles.tip, pos && styles.visible)}
              data-side={pos?.side ?? side}
              style={{
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                ["--arrow" as string]: `${pos?.arrow ?? 0}px`,
              }}
            >
              {content}
              <span className={styles.arrow} aria-hidden="true" />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export interface InfoTipProps {
  /** Explanation shown in the tooltip. */
  content: ReactNode;
  /** Accessible name of the (i) button. Default "Mehr Informationen". */
  label?: string;
  side?: TooltipSide;
  className?: string;
}

/** Small (i) button that explains a label/metric; opens on tap/click, hover and focus. 44px touch target. */
export function InfoTip({ content, label = "Mehr Informationen", side = "top", className }: InfoTipProps) {
  return (
    <Tooltip content={content} side={side} trigger="click">
      <button type="button" className={cx(styles.info, className)} aria-label={label}>
        <IoInformationCircleOutline aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
