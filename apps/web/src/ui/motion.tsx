import { useEffect, useRef, type ReactNode } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps, type Transition } from "motion/react";

/** Shared spring presets (fast, no wobble unless noted). */
export const springs = {
  /** Default UI spring: dialogs, menus. */
  snappy: { type: "spring", stiffness: 520, damping: 36, mass: 0.8 },
  /** Soft spring: layout reorder, sliding pills. */
  smooth: { type: "spring", stiffness: 320, damping: 30, mass: 0.9 },
  /** Slight overshoot: pops (check toggles, logo). */
  bouncy: { type: "spring", stiffness: 480, damping: 20, mass: 0.8 },
} as const satisfies Record<string, Transition>;

/** Reduced-motion aware tween used for opacity-only fallbacks. */
export const fadeOnly: Transition = { duration: 0.12, ease: "linear" };

/** Pressable props: spread on any motion.* element for hover/tap feedback. */
export function usePressable(opts: { scale?: number; hover?: number } = {}) {
  const reduce = useReducedMotion();
  if (reduce) return {};
  return {
    whileTap: { scale: opts.scale ?? 0.96 },
    ...(opts.hover ? { whileHover: { scale: opts.hover } } : {}),
    transition: springs.snappy,
  };
}

/** Wrapper that gives its (single) child a tap-scale feedback. */
export function Pressable({ scale, hover, ...rest }: HTMLMotionProps<"div"> & { scale?: number; hover?: number }) {
  const props = usePressable({ ...(scale !== undefined ? { scale } : {}), ...(hover !== undefined ? { hover } : {}) });
  return <motion.div {...props} {...rest} />;
}

/** Route/page transition: fade + slight slide on enter. Key it by location (no AnimatePresence/exit). */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.1 : 0.22, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

export interface FadeInProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  /** Delay in seconds. */
  delay?: number;
  /** Slide distance in px (0 = opacity only). */
  y?: number;
}

/** Fade (+ small slide up) on mount. */
export function FadeIn({ children, delay = 0, y = 10, ...rest }: FadeInProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.1 : 0.32, delay: reduce ? 0 : delay, ease: [0.2, 0.7, 0.2, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export interface StaggerProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  /** Seconds between children. */
  gap?: number;
  delay?: number;
  /** Render as another element, e.g. "ul" | "nav". */
  as?: "div" | "ul" | "ol" | "nav" | "section";
}

/** Container that staggers its `StaggerItem` children in. */
export function Stagger({ children, gap = 0.06, delay = 0, as = "div", ...rest }: StaggerProps) {
  const reduce = useReducedMotion();
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : gap, delayChildren: reduce ? 0 : delay } } }}
      {...rest}
    >
      {children}
    </Comp>
  );
}

export interface StaggerItemProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  as?: "div" | "li" | "a";
  y?: number;
}

/** Child of `Stagger`. Also usable standalone with `layout` for list updates. */
export function StaggerItem({ children, as = "div", y = 14, ...rest }: StaggerItemProps) {
  const reduce = useReducedMotion();
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      variants={{
        hidden: { opacity: 0, y: reduce ? 0 : y },
        show: { opacity: 1, y: 0, transition: reduce ? fadeOnly : { duration: 0.32, ease: [0.2, 0.7, 0.2, 1] } },
      }}
      {...rest}
    >
      {children}
    </Comp>
  );
}

export interface AnimatedNumberProps extends Omit<HTMLMotionProps<"span">, "children"> {
  value: number;
  /** Intl locale formatting; default rounds to integers. */
  format?: (n: number) => string;
}

/** Spring count-up/down. Renders instantly with reduced motion. */
export function AnimatedNumber({ value, format = (n) => String(Math.round(n)), ...rest }: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (n) => format(n));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      mv.set(value);
      return;
    }
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { type: "spring", stiffness: 140, damping: 22, mass: 0.8 });
    return () => controls.stop();
  }, [value, reduce, mv]);
  return <motion.span {...rest}>{text}</motion.span>;
}

export { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
