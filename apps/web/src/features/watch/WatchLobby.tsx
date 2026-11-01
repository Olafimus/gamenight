import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGame, type MatchSummaryDto } from "@gamenight/shared";
import { apiGet, errorMessage } from "../../lib/api";
import { useEventSource } from "../../lib/useEventSource";
import { AnimatePresence, Button, EmptyState, ErrorState, FadeIn, PageHeader, RelativeTime, Segmented, SkewRow, Spinner, TextInput, Tooltip, motion, springs, useReducedMotion } from "../../ui";
import { useDebounced } from "./useDebounced";
import styles from "./Watch.module.css";

type Filter = "active" | "all";

export const matchListKey = (status: string, search: string) => ["matches", status, search] as const;

export function matchListPath(status: string, search: string): string {
  const q = new URLSearchParams({ status });
  if (search) q.set("search", search);
  return `/matches?${q.toString()}`;
}

export function WatchLobby() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [code, setCode] = useState("");
  const term = useDebounced(search.trim(), 300);
  const status = filter === "active" ? "active" : "all";

  const query = useQuery({
    queryKey: matchListKey(status, term),
    queryFn: ({ signal }) => apiGet<MatchSummaryDto[]>(matchListPath(status, term), { signal }),
  });

  const onEvent = useCallback(
    (type: string, data: string) => {
      try {
        const parsed = JSON.parse(data) as MatchSummaryDto | { id: string };
        const lower = term.toLowerCase();
        qc.setQueryData<MatchSummaryDto[]>(matchListKey(status, term), (old) => {
          if (!old) return old;
          if (type === "removed") return old.filter((m) => m.id !== parsed.id);
          const m = parsed as MatchSummaryDto;
          const hit = !lower || m.code.toLowerCase().includes(lower) || m.playerNames.some((n) => n.toLowerCase().includes(lower));
          if ((status === "active" && m.finished) || !hit) return old.filter((x) => x.id !== m.id);
          return old.some((x) => x.id === m.id) ? old.map((x) => (x.id === m.id ? m : x)) : [m, ...old];
        });
      } catch {
        /* ignore malformed event */
      }
    },
    [qc, term, status],
  );
  const { status: streamStatus } = useEventSource(`/api/matches/stream?status=${status}`, {
    events: ["upsert", "removed"],
    onEvent,
  });
  // (Re)connected: events may have been missed meanwhile, so reload the lists.
  const wasOpen = useRef(false);
  useEffect(() => {
    wasOpen.current = false;
  }, [status]);
  useEffect(() => {
    if (streamStatus === "open") {
      if (wasOpen.current) void qc.invalidateQueries({ queryKey: ["matches", status] });
      wasOpen.current = true;
    }
  }, [streamStatus, status, qc]);


  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) navigate(`/watch/${encodeURIComponent(c)}`);
  };

  return (
    <>
      <PageHeader title="Zuschauen" back="/menu" />
      <main className={styles.page}>
        <FadeIn y={6}>
          <h2 className={styles.heading}>Finde dein Match</h2>
        </FadeIn>
        <div className={styles.controls}>
          <Segmented<Filter>
            ariaLabel="Matches filtern"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "active", label: "Aktive Matches", tooltip: "Nur Matches, die gerade gespielt werden" },
              { value: "all", label: "Alle Matches", tooltip: "Laufende und beendete Matches" },
            ]}
          />
          <TextInput
            label="Suche nach Code oder Spieler"
            hideLabel
            placeholder="Match-Code oder Spieler suchen"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.search}
          />
          <form className={styles.codeForm} onSubmit={submitCode}>
            <TextInput
              label="Code eingeben"
              hideLabel
              placeholder="Code eingeben"
              value={code}
              maxLength={5}
              info="Den 5-stelligen Match-Code zeigt der Spielleiter in seiner App an. Damit öffnest du das Match direkt."
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <Button type="submit" disabled={!code.trim()} tooltip="Match mit diesem Code öffnen">
              Los
            </Button>
          </form>
        </div>

        {query.isPending ? (
          <Spinner centered size="lg" />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState
            icon="🔭"
            title={term ? "Nichts gefunden" : filter === "active" ? "Keine aktiven Matches" : "Noch keine Matches"}
            text={
              term
                ? `Kein Match passt zu „${term}“.`
                : filter === "active"
                  ? "Gerade läuft kein Match. Starte selbst eines oder gib einen Code ein."
                  : "Es wurden noch keine Matches gespielt."
            }
          />
        ) : (
          <ul className={styles.list} aria-label="Matches">
            <AnimatePresence initial>
            {query.data.map((m, i) => (
              <motion.li
                key={m.id}
                layout={reduce ? false : "position"}
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: -28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: 28 }}
                transition={reduce ? { duration: 0.1 } : { ...springs.smooth, delay: Math.min(i, 8) * 0.035 }}
              >
              <SkewRow as="div" tone={i % 2 ? "alt" : "default"} interactive>
                <Link to={`/watch/${m.code}`} className={styles.link}>
                  <span className={styles.rowInner}>
                    <Tooltip content="Match-Code">
                      <span className={styles.code}>{m.code}</span>
                    </Tooltip>
                    <span className={styles.count}>
                      {getGame(m.gameId)?.name ?? m.gameId} · {m.playerCount} Spieler
                    </span>
                    <span className={styles.names} title={m.playerNames.join(", ")}>
                      {m.playerNames.join(", ")}
                    </span>
                    <span className={styles.meta}>
                      <span>
                        {m.finished ? "Beendet" : `Runde ${m.roundNumber}/${m.totalRounds}`}
                        {!m.finished && typeof m.cardsThisRound === "number" && ` · ${m.cardsThisRound} ${m.cardsThisRound === 1 ? "Karte" : "Karten"}`}
                      </span>
                      <RelativeTime date={m.startedAt} />
                    </span>
                  </span>
                </Link>
              </SkewRow>
              </motion.li>
            ))}
            </AnimatePresence>
          </ul>
        )}
      </main>
    </>
  );
}
