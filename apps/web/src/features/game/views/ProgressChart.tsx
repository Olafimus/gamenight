import type { DerivedPlayer } from "@scheisse/shared";
import styles from "./SplitView.module.css";

/** Colour-blind friendly (Okabe-Ito based) series colours that read on the dark background. */
export const SERIES_COLORS = ["#56B4E9", "#E69F00", "#009E73", "#F0E442", "#CC79A7", "#D55E00", "#8FA8FF", "#E8E8E8", "#7DE0C0", "#FF9AA2"];
const DASHES: Array<string | undefined> = [undefined, undefined, undefined, undefined, undefined, "7 4", "7 4", "7 4", "7 4", "7 4"];

export const seriesColor = (seat: number) => SERIES_COLORS[seat % SERIES_COLORS.length]!;

function niceStep(range: number, ticks: number): number {
  const raw = Math.max(range, 1) / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}

/** Points over rounds, one line per player (inline SVG, legend underneath). */
export function ProgressChart({ players, rounds }: { players: DerivedPlayer[]; rounds: number }) {
  if (rounds < 1) return <p className={styles.empty}>Noch keine Runde gewertet.</p>;
  const W = 640;
  const H = 340;
  const m = { l: 44, r: 14, t: 14, b: 30 };
  const series = players.map((p) => [0, ...p.scores.slice(0, rounds)]);
  const all = series.flat();
  const step = niceStep(Math.max(...all, 0) - Math.min(...all, 0), 5);
  const yMin = Math.floor(Math.min(...all, 0) / step) * step;
  const yMax = Math.max(Math.ceil(Math.max(...all, 0) / step) * step, yMin + step);
  const x = (r: number) => m.l + (r / rounds) * (W - m.l - m.r);
  const y = (v: number) => m.t + (1 - (v - yMin) / (yMax - yMin)) * (H - m.t - m.b);
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) yTicks.push(v);
  const xStep = Math.max(1, Math.ceil(rounds / 8));
  const xTicks: number[] = [];
  for (let r = 0; r <= rounds; r += xStep) xTicks.push(r);

  return (
    <figure className={styles.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Punkteverlauf über die Runden" preserveAspectRatio="xMidYMid meet">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "rgba(255,255,255,.45)" : "rgba(255,255,255,.12)"} strokeWidth={1} />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" className={styles.tick}>
              {v}
            </text>
          </g>
        ))}
        {xTicks.map((r) => (
          <text key={r} x={x(r)} y={H - 10} textAnchor="middle" className={styles.tick}>
            {r}
          </text>
        ))}
        {series.map((s, i) => {
          const p = players[i]!;
          const color = seriesColor(p.seat);
          const d = s.map((v, r) => `${r === 0 ? "M" : "L"}${x(r).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
          const last = s.length - 1;
          return (
            <g key={p.id}>
              <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={DASHES[p.seat % DASHES.length]} />
              <circle cx={x(last)} cy={y(s[last]!)} r={4} fill={color} stroke="#141414" strokeWidth={1.5} />
            </g>
          );
        })}
      </svg>
      <figcaption className={styles.legend}>
        {players.map((p) => (
          <span key={p.id} className={styles.legendItem}>
            <svg width="22" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="22" y2="4" stroke={seriesColor(p.seat)} strokeWidth="3" strokeDasharray={DASHES[p.seat % DASHES.length]} />
            </svg>
            {p.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
