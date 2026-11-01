import { useEffect, useState } from "react";

const rtf = new Intl.RelativeTimeFormat("de", { numeric: "auto", style: "short" });

/** German relative time string, e.g. "vor 5 Min.", "gerade eben", "gestern". */
export function formatRelative(date: string | number | Date, now: number = Date.now()): string {
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return "";
  const diffSec = Math.round((t - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return "gerade eben";
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), "month");
  return rtf.format(Math.round(diffSec / (86400 * 365)), "year");
}

export interface RelativeTimeProps {
  date: string | number | Date;
  className?: string;
}

/** <time> element showing a self-updating German relative time; full date in the title. */
export function RelativeTime({ date, className }: RelativeTimeProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return (
    <time dateTime={d.toISOString()} title={d.toLocaleString("de-DE")} className={className}>
      {formatRelative(d, now)}
    </time>
  );
}
