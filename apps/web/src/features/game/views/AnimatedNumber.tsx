import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import styles from "./AnimatedNumber.module.css";

/** Counts up/down to `value` (instantly with reduced motion). */
export function AnimatedNumber({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (reduce || from === value) {
      setShown(value);
      return;
    }
    const c = animate(from, value, { duration: 0.7, ease: "easeOut", onUpdate: (v) => setShown(Math.round(v)) });
    return () => c.stop();
  }, [value, reduce]);
  return <>{shown}</>;
}

/** Small "+11" / "−10" badge that floats up and fades when a round was committed (not on first render). */
export function DeltaFloat({ delta, trigger }: { delta: number | undefined; trigger: number }) {
  const reduce = useReducedMotion();
  const first = useRef(trigger);
  if (reduce || delta === undefined || trigger === first.current) return null;
  return (
    <motion.span
      key={trigger}
      className={delta >= 0 ? styles.up : styles.down}
      aria-hidden="true"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: [0, 1, 1, 0], y: [6, -4, -14, -26] }}
      transition={{ duration: 1.6, times: [0, 0.15, 0.7, 1] }}
    >
      {delta >= 0 ? "+" : "−"}
      {Math.abs(delta)}
    </motion.span>
  );
}
