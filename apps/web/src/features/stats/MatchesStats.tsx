import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { deriveMatch, getGame, type MatchDto, type MatchSummaryDto } from "@gamenight/shared";
import { apiGet, errorMessage } from "../../lib/api";
import { ButtonLink, EmptyState, ErrorState, PageHeader, RelativeTime, SkewRow, Spinner, TextInput, cx } from "../../ui";
import { useDebounced } from "../watch/useDebounced";
import styles from "./Stats.module.css";

export function MatchPreview({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["match-preview", id],
    queryFn: ({ signal }) => apiGet<MatchDto>(`/matches/${encodeURIComponent(id)}`, { signal }),
  });
  const rows = useMemo(() => {
    if (!query.data) return [];
    const d = deriveMatch(query.data.state);
    return [...d.players].sort((a, b) => b.total - a.total || a.seat - b.seat);
  }, [query.data]);
  const finished = query.data ? deriveMatch(query.data.state).finished : true;

  if (query.isPending) return <Spinner centered />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  return (
    <div>
      <h3 className={styles.h2} style={{ marginTop: 0 }}>
        Match {query.data.code}
        {!finished && <span className={styles.live}> läuft</span>}
      </h3>
      {!finished && <p className={styles.muted}>Aktueller Zwischenstand</p>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Platz</th>
            <th>Punkte</th>
            <th title="Längste Siegesserie">Serie</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{finished ? (p.placement ?? "–") : "–"}</td>
              <td>{p.total}</td>
              <td>{"stats" in p ? p.stats.maxWinStreak : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: "1rem" }}>
        <ButtonLink to={`/watch/${query.data.code}`} variant="secondary">
          Match ansehen
        </ButtonLink>
      </p>
    </div>
  );
}

export function MatchesStats() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const term = useDebounced(search.trim(), 300);

  const query = useQuery({
    queryKey: ["matches", "all", term],
    queryFn: ({ signal }) => {
      const q = new URLSearchParams({ status: "all" });
      if (term) q.set("search", term);
      return apiGet<MatchSummaryDto[]>(`/matches?${q.toString()}`, { signal });
    },
  });

  return (
    <>
      <PageHeader title="Matches" back="/stats" />
      <main className={cx(styles.page, styles.pageWide, styles.pageFlow)}>
        <TextInput label="Match suchen" hideLabel placeholder="Code oder Spieler suchen …" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className={styles.split}>
          <div>
            {query.isPending ? (
              <Spinner centered size="lg" />
            ) : query.isError ? (
              <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
            ) : query.data.length === 0 ? (
              <EmptyState icon="🃏" title={term ? "Nichts gefunden" : "Noch keine Matches"} text={term ? `Kein Match passt zu „${term}“.` : undefined} />
            ) : (
              <ul className={styles.list} aria-label="Matches">
                {query.data.map((m, i) => (
                  <SkewRow key={m.id} as="li" tone={i % 2 ? "alt" : "default"} interactive className={cx(selected === m.id && styles.selected)}>
                    <button type="button" className={styles.pick} aria-pressed={selected === m.id} onClick={() => setSelected(m.id)}>
                      <span className={styles.matchMain}>
                        <span className={styles.ellipsis} style={{ display: "block" }} title={m.playerNames.join(", ")}>
                          <strong>{m.code}</strong> · {m.playerNames.join(", ")}
                          {!m.finished && <span className={styles.live}>läuft</span>}
                        </span>
                        <span className={styles.sub}>
                          {getGame(m.gameId)?.name ?? m.gameId} · {m.playerCount} Spieler · <RelativeTime date={m.startedAt} />
                        </span>
                      </span>
                    </button>
                  </SkewRow>
                ))}
              </ul>
            )}
          </div>
          <aside className={styles.preview} aria-label="Vorschau">
            {selected ? <MatchPreview id={selected} /> : <p className={styles.muted}>Wähle ein Match aus der Liste, um die Vorschau zu sehen.</p>}
          </aside>
        </div>
      </main>
    </>
  );
}
