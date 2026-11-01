import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "motion/react";

/** Count-up number. `from` is the initial display value on mount; respects prefers-reduced-motion. */
export function AnimatedNumber({ value, format, from, duration = 0.7 }: { value: number; format: (n: number) => string; from?: number; duration?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : (from ?? 0));
  const ref = useRef(shown);
  useEffect(() => {
    if (reduce) {
      ref.current = value;
      setShown(value);
      return;
    }
    const controls = animate(ref.current, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => {
        ref.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, reduce, duration]);
  return <>{format(shown)}</>;
}

/** Entrance props for a staggered list item; layout animates reordering. */
export function useRowMotion(index: number) {
  const reduce = useReducedMotion();
  if (reduce) return { layout: false as const };
  return {
    layout: "position" as const,
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: { type: "spring" as const, stiffness: 420, damping: 36, delay: Math.min(index, 14) * 0.02 },
  };
}

export const MotionLi = motion.li;

/** Podium card entrance (spring, staggered). */
export function usePodiumMotion(index: number) {
  const reduce = useReducedMotion();
  if (reduce) return {};
  return {
    initial: { opacity: 0, y: 28, scale: 0.94 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { type: "spring" as const, stiffness: 260, damping: 22, delay: 0.1 + index * 0.09 },
  };
}
