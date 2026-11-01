import { motion, useReducedMotion } from "motion/react";
import { fmtElo } from "./leaderboardUtils";

/** Inline SVG line of the Elo history (starts at 1000). */
export function Sparkline({ points, start = 1000 }: { points: { elo: number }[]; start?: number }) {
  const reduce = useReducedMotion();
  if (points.length === 0) return null;
  const values = [start, ...points.map((p) => p.elo)];
  const w = 320;
  const h = 84;
  const pad = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 10);
  const x = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(values.length - 1, 1);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Elo-Verlauf: von ${fmtElo(start)} auf ${fmtElo(last)} nach ${points.length} Matches`} style={{ width: "100%", height: "auto", display: "block" }}>
      <line x1={pad} x2={w - pad} y1={y(start)} y2={y(start)} stroke="var(--line)" strokeDasharray="4 4" />
      <motion.path
        d={d}
        fill="none"
        stroke="#e2b84c"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      <motion.circle cx={x(values.length - 1)} cy={y(last)} r="4" fill="#e2b84c" initial={reduce ? false : { opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.85 }} />
    </svg>
  );
}
