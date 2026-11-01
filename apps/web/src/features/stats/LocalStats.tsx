import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, ConfirmDialog, EmptyState, PageHeader, RelativeTime, SkewRow } from "../../ui";
import { useLocalHistory } from "../../lib/localHistory";
import styles from "./Stats.module.css";

/** Links to the spectator view only when the match was synced (has a code). */
function MaybeLink({ code, children }: { code: string; children: ReactNode }) {
  if (!code) return <div className={styles.matchRow}>{children}</div>;
  return (
    <Link to={`/watch/${code}`} className={styles.matchRow} style={{ color: "inherit", textDecoration: "none" }}>
      {children}
    </Link>
  );
}

export function LocalStats() {
  const matches = useLocalHistory((s) => s.playedMatches);
  const clear = useLocalHistory((s) => s.clear);
  const [confirm, setConfirm] = useState(false);

  const wins = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of matches) for (const p of m.players) if (p.placement === 1) map.set(p.name, (map.get(p.name) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"));
  }, [matches]);

  return (
    <>
      <PageHeader title="Auf diesem Gerät" back="/stats" />
      <main className={styles.page}>
        {matches.length === 0 ? (
          <EmptyState icon="📱" title="Noch keine Matches" text="Hier erscheinen Matches, die du auf diesem Gerät beendest." />
        ) : (
          <>
            <div className={styles.counters} aria-label="Zähler">
              <span className={styles.chip}>
                <strong>{matches.length}</strong> {matches.length === 1 ? "Match" : "Matches"}
              </span>
              {wins.map(([name, n]) => (
                <span key={name} className={styles.chip}>
                  {name}: <strong>{n}</strong> {n === 1 ? "Sieg" : "Siege"}
                </span>
              ))}
            </div>
            <ul className={styles.list}>
              {matches.map((m, i) => {
                const winners = m.players.filter((p) => p.placement === 1).map((p) => p.name);
                return (
                  <SkewRow key={m.matchId} as="li" tone={i % 2 ? "alt" : "default"} interactive={!!m.code}>
                    <MaybeLink code={m.code}>
                      <span className={styles.matchMain}>
                        <span className={styles.ellipsis} style={{ display: "block" }} title={m.players.map((p) => p.name).join(", ")}>
                          {m.players.map((p) => p.name).join(", ")}
                        </span>
                        <span className={styles.sub}>
                          <RelativeTime date={m.finishedAt} />
                          {m.code ? ` · ${m.code}` : ""}
                        </span>
                      </span>
                      <span className={styles.place}>🏆 {winners.join(", ")}</span>
                    </MaybeLink>
                  </SkewRow>
                );
              })}
            </ul>
            <div>
              <Button variant="danger" onClick={() => setConfirm(true)}>
                Verlauf löschen
              </Button>
            </div>
          </>
        )}
        <ConfirmDialog
          open={confirm}
          title="Verlauf löschen?"
          message="Alle auf diesem Gerät gespeicherten Matches und bekannten Spieler werden entfernt. Matches auf dem Server bleiben erhalten."
          confirmLabel="Löschen"
          destructive
          onConfirm={() => {
            clear();
            setConfirm(false);
          }}
          onCancel={() => setConfirm(false)}
        />
      </main>
    </>
  );
}
