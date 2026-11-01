import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deriveMatch, type MatchDto } from "@scheisse/shared";
import { ApiRequestError, apiGet, errorMessage } from "../../lib/api";
import { useEventSource } from "../../lib/useEventSource";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { AnimatedNumber, ButtonLink, EmptyState, ErrorState, InfoTip, PageHeader, Segmented, Spinner, Tooltip, cx, motion, springs, useReducedMotion } from "../../ui";
import type { WatchRow } from "./watchTable";
import { Scoreboard } from "../../components/Scoreboard";
import { buildWatchRows } from "./watchTable";
import { LiveRoundCard } from "./LiveRoundCard";
import { ProgressChart } from "../game/views/ProgressChart";
import styles from "./Watch.module.css";

type View = "table" | "chart" | "scoreboard";

function WatchTableRow({ r }: { r: WatchRow }) {
  const reduce = useReducedMotion();
  const prev = useRef(r.total);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (prev.current !== r.total) {
      prev.current = r.total;
      setFlash((f) => f + 1);
    }
  }, [r.total]);
  return (
    <motion.tr
      layout={reduce ? false : "position"}
      transition={reduce ? { duration: 0 } : springs.smooth}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={styles[r.outcome]}
    >
      <td>{r.placement ?? "–"}</td>
      <td className={styles.name}>
        {r.name}
        {r.outcome !== "neutral" && (
          <Tooltip content={r.outcome === "right" ? "Letzte Runde richtig" : "Letzte Runde falsch"}>
            <span className={styles.mark} tabIndex={0} aria-label={r.outcome === "right" ? "richtig" : "falsch"}>
              {r.outcome === "right" ? "✓" : "✗"}
            </span>
          </Tooltip>
        )}
      </td>
      <td className={styles.num}>{r.bid ?? "–"}</td>
      <td className={styles.num}>
        <motion.span
          key={flash}
          className={styles.total}
          initial={flash > 0 && !reduce ? { scale: 1.35, color: "#e2b84c" } : false}
          animate={{ scale: 1, color: "#ffffff" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <AnimatedNumber value={r.total} />
        </motion.span>
      </td>
    </motion.tr>
  );
}

export function WatchMatch() {
  const { code = "" } = useParams();
  const qc = useQueryClient();
  const [view, setView] = useState<View>("table");
  const wide = useMediaQuery("(min-width: 1000px)");
  const [deleted, setDeleted] = useState(false);
  const key = useMemo(() => ["match", code.toUpperCase()], [code]);

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiGet<MatchDto>(`/matches/${encodeURIComponent(code)}`, { signal }),
    retry: (n, err) => !(err instanceof ApiRequestError && err.status === 404) && n < 2,
  });
  const match = query.data;

  const onEvent = useCallback(
    (type: string, data: string) => {
      if (type === "deleted") return setDeleted(true);
      try {
        qc.setQueryData(key, JSON.parse(data) as MatchDto);
      } catch {
        /* ignore */
      }
    },
    [qc, key],
  );
  const { status } = useEventSource(match && !deleted ? `/api/matches/${match.id}/stream` : null, {
    events: ["match", "deleted"],
    onEvent,
  });

  const derived = useMemo(() => (match ? deriveMatch(match.state) : null), [match]);
  const rows = useMemo(() => (match ? buildWatchRows(match.state) : []), [match]);

  const header = <PageHeader title={`Match ${code.toUpperCase()}`} back="/watch" />;

  if (deleted)
    return (
      <>
        {header}
        <main className={styles.page}>
          <EmptyState
            icon="🗑️"
            title="Match gelöscht"
            text="Dieses Match wurde vom Spielleiter gelöscht."
            action={<ButtonLink to="/watch">Zur Übersicht</ButtonLink>}
          />
        </main>
      </>
    );

  if (query.isPending)
    return (
      <>
        {header}
        <Spinner centered size="lg" />
      </>
    );

  if (query.isError || !match || !derived) {
    const notFound = query.error instanceof ApiRequestError && query.error.status === 404;
    return (
      <>
        {header}
        <main className={styles.page}>
          {notFound ? (
            <EmptyState
              icon="🔍"
              title="Match nicht gefunden"
              text={`Es gibt kein Match mit dem Code „${code.toUpperCase()}“.`}
              action={<ButtonLink to="/watch">Zur Übersicht</ButtonLink>}
            />
          ) : (
            <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          )}
        </main>
      </>
    );
  }

  const finished = match.finished || derived.finished;
  const liveLabel = status === "open" ? "Live" : status === "error" ? "Verbindung unterbrochen" : "Verbinde …";

  const liveTip =
    status === "open" ? "Live verbunden – Änderungen erscheinen sofort." : "Verbindung wird wiederhergestellt – die Anzeige kann veraltet sein.";

  return (
    <>
      {header}
      <main className={cx(styles.page, wide && styles.pageWide)}>
        <div className={styles.head}>
          <div>
            <div className={styles.headTitle}>
              Runde {derived.roundNumber} von {derived.totalRounds}
            </div>
            <div className={styles.headSub}>Geber: {derived.giverName}</div>
          </div>
          {!finished && (
            <Tooltip content={liveTip} side="bottom">
              <span className={styles.live} role="status" tabIndex={0}>
                <span className={cx(styles.dot, status === "open" && styles.dotOpen, status === "error" && styles.dotError)} />
                {liveLabel}
              </span>
            </Tooltip>
          )}
        </div>

        {finished && (
          <section className={styles.banner} aria-label="Endergebnis">
            <h2>Match beendet – Endergebnis</h2>
            <ol>
              {rows.map((r) => (
                <li key={r.id} value={r.placement ?? undefined}>
                  <strong>{r.name}</strong> – {r.total} Punkte
                </li>
              ))}
            </ol>
          </section>
        )}

        {!finished && <LiveRoundCard match={match} roundsPlayed={derived.roundsPlayed} />}

        {!wide && (
        <Segmented<View>
          ariaLabel="Ansicht"
          value={view}
          onChange={setView}
          options={[
            { value: "table", label: "Tabelle", tooltip: "Aktueller Stand pro Spieler" },
            { value: "chart", label: "Verlauf", tooltip: "Punkteverlauf als Grafik" },
            { value: "scoreboard", label: "Scoreboard", tooltip: "Alle Runden im Verlauf" },
          ]}
        />
        )}

        <div className={styles.splitWrap}>
        {wide || view === "table" ? (
          <div className={styles.pane}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">
                  Platz
                  <InfoTip content="Aktuelle Platzierung nach Gesamtpunkten." label="Erklärung zu Platz" side="bottom" />
                </th>
                <th scope="col">
                  Name
                  <InfoTip
                    content="Grün hinterlegt: Der Spieler hat die letzte Runde richtig angesagt. Rot hinterlegt: falsch angesagt."
                    label="Erklärung zu den Zeilenfarben"
                    side="bottom"
                  />
                </th>
                <th scope="col" className={styles.num}>
                  Ansage
                  <InfoTip
                    content="Die Ansage des Spielers in der aktuellen Runde: So viele Stiche will er machen."
                    label="Erklärung zu Ansage"
                    side="bottom"
                  />
                </th>
                <th scope="col" className={styles.num}>
                  Punkte
                  <InfoTip content="Gesamtpunkte bis einschließlich der letzten gewerteten Runde." label="Erklärung zu Punkte" side="bottom" />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <WatchTableRow key={r.id} r={r} />
              ))}
            </tbody>
          </table>
          {wide && (
            <div className={styles.chartWrap}>
              <h2 className={styles.chartTitle}>Verlauf</h2>
              <ProgressChart players={derived.players} rounds={derived.roundsPlayed} />
            </div>
          )}
          </div>
        ) : null}
        {!wide && view === "chart" ? (
          <div className={styles.pane}>
            <ProgressChart players={derived.players} rounds={derived.roundsPlayed} />
          </div>
        ) : null}
        {wide || view === "scoreboard" ? (
          <div className={styles.pane}>
            <Scoreboard match={derived} />
          </div>
        ) : null}
        </div>
      </main>
    </>
  );
}
