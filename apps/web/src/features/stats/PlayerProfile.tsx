import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { userLabel, type ClaimGuestResponse, type PlayerProfileDto } from "@gamenight/shared";
import { ApiRequestError, apiGet, apiPost, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Button, ButtonLink, ConfirmDialog, EmptyState, ErrorState, PageHeader, RelativeTime, SkewRow, Spinner } from "../../ui";
import { fmt1, fmtElo, fmtPercent, fmtPp, fmtSigned } from "./leaderboardUtils";
import { Sparkline } from "./Sparkline";
import { titleWithGame, useStatsGame, withGame } from "./statsGame";
import { AnimatedNumber } from "./statsMotion";
import styles from "./Stats.module.css";

export function PlayerProfile() {
  const { id = "", name = "" } = useParams();
  const isGuest = name !== "";
  const game = useStatsGame();
  const path = `${isGuest ? `/stats/guests/${encodeURIComponent(name)}` : `/stats/players/${encodeURIComponent(id)}`}?game=${encodeURIComponent(game)}`;
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const claim = useMutation({
    mutationFn: () => apiPost<ClaimGuestResponse>("/auth/claim-guest", { name }),
    onSuccess: () => {
      setConfirmOpen(false);
      if (user) navigate(`/stats/players/${user.id}`);
      void qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
  const query = useQuery({
    queryKey: ["stats", isGuest ? "guest" : "player", isGuest ? name.toLowerCase() : id, game],
    queryFn: ({ signal }) => apiGet<PlayerProfileDto>(path, { signal }),
    retry: (n, err) => !(err instanceof ApiRequestError && err.status === 404) && n < 2,
  });

  const p = query.data;
  const header = <PageHeader title={titleWithGame(p?.subject.name ?? (isGuest ? name : "Spielerprofil"), game)} back={withGame("/stats/players", game)} />;

  if (query.isPending)
    return (
      <>
        {header}
        <Spinner centered size="lg" />
      </>
    );
  if (query.isError || !p) {
    const notFound = query.error instanceof ApiRequestError && query.error.status === 404;
    return (
      <>
        {header}
        <main className={styles.page}>
          {notFound ? (
            <EmptyState icon="🔍" title="Keine Matches" text="Dieser Spieler existiert nicht oder hat in diesem Spiel noch kein Match beendet." action={<ButtonLink to="/stats/players">Zur Bestenliste</ButtonLink>} />
          ) : (
            <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          )}
        </main>
      </>
    );
  }

  const o = p.overall;
  const placements = Object.entries(o.placements)
    .map(([k, v]) => [Number(k), v] as const)
    .sort((a, b) => a[0] - b[0]);
  const maxPlace = Math.max(1, ...placements.map(([, v]) => v));
  const versus = [...p.versus].sort((a, b) => b.matches - a.matches);

  return (
    <>
      {header}
      <main className={styles.page}>
        <h2 className={styles.h2} style={{ marginTop: 0 }}>
          {p.subject.name}
          {p.subject.kind === "guest" && <span className={styles.guestBadge}>Gast</span>}
        </h2>
        {p.subject.kind === "guest" && (
          <div className={styles.notice}>
            {user ? (
              <>
                <p>Gehören diese Matches dir? Dann füge sie deinem Konto hinzu.</p>
                <Button onClick={() => setConfirmOpen(true)}>Das bin ich – zu meinem Konto hinzufügen</Button>
                {claim.isError && <p role="alert">{errorMessage(claim.error)}</p>}
              </>
            ) : (
              <p>
                Das bist du? <Link to="/login">Melde dich an</Link>, um diese Matches deinem Konto hinzuzufügen.
              </p>
            )}
          </div>
        )}
        <ConfirmDialog
          open={confirmOpen}
          title="Matches deinem Konto zuordnen?"
          message={`Alle beendeten Matches, in denen „${p.subject.name}“ als Gast gespielt hat, werden deinem Konto (${user ? userLabel(user) : ""}) zugeordnet. Die Statistik des Gasts geht damit auf dich über. Matches, in denen du bereits selbst mitspielst, bleiben unverändert.`}
          confirmLabel={claim.isPending ? "Wird zugeordnet …" : "Zuordnen"}
          onConfirm={() => claim.mutate()}
          onCancel={() => setConfirmOpen(false)}
        />
        <div className={styles.stats}>
          <div className={styles.stat}>
            <strong><AnimatedNumber value={p.elo} from={1000} format={fmtElo} /></strong>
            <span>Elo</span>
          </div>
          <div className={styles.stat}>
            <strong><AnimatedNumber value={o.matchCount} from={0} format={(n) => String(Math.round(n))} /></strong>
            <span>Matches · {o.wins} Siege</span>
          </div>
          <div className={styles.stat}>
            <strong><AnimatedNumber value={o.winRate} from={0} format={fmtPercent} /></strong>
            <span>Siegquote · erw. {fmtPercent(o.expectedWinRate)} ({fmtPp(o.winRate, o.expectedWinRate)})</span>
          </div>
          <div className={styles.stat}>
            <strong><AnimatedNumber value={o.placementScore} from={0} format={fmtPercent} /></strong>
            <span>Platzierungs-Score</span>
          </div>
          <div className={styles.stat}>
            <strong><AnimatedNumber value={o.hitRate} from={0} format={fmtPercent} /></strong>
            <span>Trefferquote</span>
          </div>
          <div className={styles.stat}>
            <strong><AnimatedNumber value={o.avgPoints} from={0} format={fmt1} /></strong>
            <span>Ø Punkte pro Runde</span>
          </div>
        </div>

        {p.eloHistory.length > 0 && (
          <section aria-label="Elo-Verlauf">
            <h3 className={styles.h2}>Elo-Verlauf</h3>
            <div className={styles.spark}>
              <Sparkline points={p.eloHistory} />
            </div>
          </section>
        )}

        {p.categories.length > 0 && (
          <section aria-label="Nach Kategorie">
            <h3 className={styles.h2}>Nach Kategorie</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Kategorie</th>
                    <th>Matches</th>
                    <th>Siege</th>
                    <th>Platz-Score</th>
                    <th>Ø Punkte</th>
                    <th>Treffer</th>
                    <th>Elo ±</th>
                  </tr>
                </thead>
                <tbody>
                  {p.categories.map((c) => (
                    <tr key={c.id}>
                      <td>{c.label}</td>
                      <td>{c.matchCount}</td>
                      <td>
                        {fmtPercent(c.winRate)} <span className={styles.sub}>(erw. {fmtPercent(c.expectedWinRate)})</span>
                      </td>
                      <td>{fmtPercent(c.placementScore)}</td>
                      <td>{fmt1(c.avgPoints)}</td>
                      <td>{fmtPercent(c.hitRate)}</td>
                      <td>{fmtSigned(c.eloDelta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section aria-label="Platzierungen">
          <h3 className={styles.h2}>Platzierungen</h3>
          <div className={styles.histo}>
            {placements.map(([place, n]) => (
              <div key={place} className={styles.histoRow}>
                <span>{place}.</span>
                <span className={styles.bar} style={{ width: `${(n / maxPlace) * 100}%` }} role="img" aria-label={`${n} mal Platz ${place}`} />
                <span>{n}</span>
              </div>
            ))}
          </div>
        </section>

        {versus.length > 0 && (
          <section aria-label="Gegen andere Spieler">
            <h3 className={styles.h2}>Gegen andere Spieler</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Spieler</th>
                  <th>Matches</th>
                  <th>Siege</th>
                </tr>
              </thead>
              <tbody>
                {versus.map((v) => (
                  <tr key={v.userId ?? `g:${v.name}`}>
                    <td>
                      {v.userId ? (
                        <Link to={withGame(`/stats/players/${v.userId}`, game)}>{v.name}</Link>
                      ) : (
                        <Link to={withGame(`/stats/guests/${encodeURIComponent(v.name)}`, game)} title="Gast">
                          {v.name}
                        </Link>
                      )}
                    </td>
                    <td>{v.matches}</td>
                    <td>{v.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section aria-label="Matches">
          <h3 className={styles.h2}>Matches</h3>
          {p.matches.length === 0 ? (
            <EmptyState title="Noch keine Matches" />
          ) : (
            <ul className={styles.list}>
              {p.matches.map((m, i) => (
                <SkewRow key={m.matchId} as="li" tone={i % 2 ? "alt" : "default"} interactive>
                  <Link to={`/watch/${m.code}`} className={styles.matchRow} style={{ color: "inherit", textDecoration: "none" }}>
                    <span className={styles.matchMain}>
                      <span className={styles.ellipsis} style={{ display: "block" }} title={m.playerNames.join(", ")}>
                        {m.playerNames.join(", ")}
                      </span>
                      <span className={styles.sub}>
                        <RelativeTime date={m.finishedAt} /> · {m.code}
                      </span>
                    </span>
                    <span className={styles.place}>
                      {m.placement}. Platz
                      <span className={styles.sub} style={{ display: "block", fontWeight: 400 }}>
                        {m.finalScore} Punkte · {fmtSigned(m.eloDelta)} Elo
                      </span>
                    </span>
                  </Link>
                </SkewRow>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
