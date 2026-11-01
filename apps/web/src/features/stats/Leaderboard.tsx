import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { IoInformationCircleOutline } from "react-icons/io5";
import { useQuery } from "@tanstack/react-query";
import { STATS_CATEGORIES, STATS_PERIOD_LABELS, STATS_PERIODS, type LeaderboardEntryDto, type LeaderboardResponse, type StatsPeriod } from "@gamenight/shared";
import { apiGet, errorMessage } from "../../lib/api";
import { Dropdown, EmptyState, ErrorState, IconButton, PageHeader, Segmented, SkewRow, Spinner, TextInput, cx } from "../../ui";
import { useDebounced } from "../watch/useDebounced";
import { StatsInfoModal } from "./StatsInfoModal";
import { titleWithGame, useStatsGame, withGame } from "./statsGame";
import { fmt1, fmtElo, fmtPercent, fmtPp, fmtSigned, sortEntries, type SortDir, type SortKey } from "./leaderboardUtils";
import { AnimatedNumber, MotionLi, usePodiumMotion, useRowMotion } from "./statsMotion";
import styles from "./Stats.module.css";

interface Column {
  key: SortKey;
  label: string;
  /** full name for tooltips / screen readers */
  full: string;
  /** shown on phones in the collapsed row */
  phone?: boolean;
}

const COLUMNS: Column[] = [
  { key: "elo", label: "Elo", full: "Elo", phone: true },
  { key: "winRate", label: "Quote", full: "Siegquote", phone: true },
  { key: "placementScore", label: "Score", full: "Platzierungs-Score" },
  { key: "avgPoints", label: "Ø Pkt", full: "Ø Punkte pro Runde" },
  { key: "hitRate", label: "Treffer", full: "Trefferquote" },
  { key: "matchCount", label: "Spiele", full: "Matches", phone: true },
];

const formLabel = (v: number) => (v >= 1 ? "Sieg" : v >= 0.5 ? "obere Hälfte" : v > 0 ? "untere Hälfte" : "Letzter");
const formClass = (v: number) => (v >= 1 ? styles.fWin : v >= 0.5 ? styles.fGood : v > 0 ? styles.fMid : styles.fBad);

export function FormDots({ form }: { form: number[] }) {
  if (form.length === 0) return null;
  return (
    <span className={styles.form} role="img" aria-label={`Form: ${form.map(formLabel).join(", ")}`}>
      {form.map((v, i) => (
        <i key={i} className={formClass(v)} title={formLabel(v)} />
      ))}
    </span>
  );
}

function EloCell({ e }: { e: LeaderboardEntryDto }) {
  return (
    <span className={styles.num}>
      <b>
        <AnimatedNumber value={e.elo} from={1000} format={fmtElo} />
      </b>
      <small className={cx(styles.delta, e.eloDelta > 0.5 && styles.up, e.eloDelta < -0.5 && styles.down)}>{fmtSigned(e.eloDelta)}</small>
    </span>
  );
}

function RateCell({ e }: { e: LeaderboardEntryDto }) {
  return (
    <span className={styles.num} title={`Siegquote ${fmtPercent(e.winRate)} bei ${fmtPercent(e.expectedWinRate)} erwartet (${fmtPp(e.winRate, e.expectedWinRate)})`}>
      <b>{fmtPercent(e.winRate)}</b>
      <small>
        erw. {fmtPercent(e.expectedWinRate)}
      </small>
    </span>
  );
}

function Name({ e }: { e: LeaderboardEntryDto }) {
  return (
    <span className={styles.lbName} data-testid="lb-name">
      <span className={styles.nameText}>{e.name}</span>
      {(e.kind === "guest" || e.provisional) && (
        <span className={styles.badges}>
          {e.kind === "guest" && <span className={styles.guestBadge}>Gast</span>}
          {e.provisional && <span className={styles.provBadge}>vorläufig</span>}
        </span>
      )}
    </span>
  );
}

const profilePath = (e: LeaderboardEntryDto) => (e.userId ? `/stats/players/${e.userId}` : `/stats/guests/${encodeURIComponent(e.name)}`);

function PodiumCard({ e, i }: { e: LeaderboardEntryDto; i: number }) {
  const m = usePodiumMotion(i);
  const game = useStatsGame();
  return (
    <MotionLi className={cx(styles.podiumCard, styles[`p${i + 1}` as "p1"])} {...m}>
      <Link to={withGame(profilePath(e), game)}>
        <span className={styles.medal}>{i + 1}</span>
        <span className={styles.podiumName}>{e.name}</span>
        <span className={styles.podiumElo}>
          <AnimatedNumber value={e.elo} from={1000} format={(n) => fmtElo(n)} />
        </span>
        <span className={styles.podiumSub}>{fmtPercent(e.winRate)} Siege</span>
      </Link>
    </MotionLi>
  );
}

function Podium({ entries }: { entries: LeaderboardEntryDto[] }) {
  if (entries.length === 0) return null;
  return (
    <ol className={styles.podium} aria-label="Podium">
      {entries.map((e, i) => (
        <PodiumCard key={e.key} e={e} i={i} />
      ))}
    </ol>
  );
}

function LbRow({ e, i, open, onToggle }: { e: LeaderboardEntryDto; i: number; open: boolean; onToggle: () => void }) {
  const m = useRowMotion(i);
  const game = useStatsGame();
  return (
    <MotionLi className={styles.li} {...m}>
      <SkewRow as="div" tone={i % 2 ? "alt" : "default"} interactive className={styles.compactRow}>
        <div className={styles.rowWrap}>
          <div className={cx(styles.lbRow, e.provisional && styles.prov)}>
            <span className={styles.rank}>{e.provisional ? "–" : e.rank}</span>
            <Link to={withGame(profilePath(e), game)} className={styles.rowLink}>
              <Name e={e} />
            </Link>
            <EloCell e={e} />
            <RateCell e={e} />
            <span className={cx(styles.num, styles.hideSmall)}>{fmtPercent(e.placementScore)}</span>
            <span className={cx(styles.num, styles.hideSmall)}>{fmt1(e.avgPoints)}</span>
            <span className={cx(styles.num, styles.hideSmall)}>{fmtPercent(e.hitRate)}</span>
            <span className={styles.num}>{e.matchCount}</span>
            <span className={styles.hideSmall}>
              <FormDots form={e.form} />
            </span>
            <button type="button" className={styles.chev} aria-expanded={open} aria-label={`Details zu ${e.name}`} onClick={onToggle}>
              {open ? "▴" : "▾"}
            </button>
          </div>
          {open && (
            <dl className={styles.detail}>
              <div><dt>Platz-Score</dt><dd>{fmtPercent(e.placementScore)}</dd></div>
              <div><dt>Ø Punkte</dt><dd>{fmt1(e.avgPoints)}</dd></div>
              <div><dt>Treffer</dt><dd>{fmtPercent(e.hitRate)}</dd></div>
              <div><dt>Siege</dt><dd>{e.wins} ({fmtPp(e.winRate, e.expectedWinRate)})</dd></div>
              <div><dt>Form</dt><dd><FormDots form={e.form} /></dd></div>
            </dl>
          )}
        </div>
      </SkewRow>
    </MotionLi>
  );
}

export function Leaderboard() {
  const game = useStatsGame();
  const [category, setCategory] = useState("gesamt");
  const [period, setPeriod] = useState<StatsPeriod>("all");
  const [sortKey, setSortKey] = useState<SortKey>("elo");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showProvisional, setShowProvisional] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim(), 300);

  const query = useQuery({
    queryKey: ["stats", "leaderboard", game, category, period, term],
    queryFn: ({ signal }) => {
      const q = new URLSearchParams({ game, category, period });
      if (term) q.set("search", term);
      return apiGet<LeaderboardResponse>(`/stats/leaderboard?${q.toString()}`, { signal });
    },
    placeholderData: (prev) => prev,
  });

  const data = query.data;
  const sorted = useMemo(() => {
    if (!data) return [];
    const list = showProvisional ? data.entries : data.entries.filter((e) => !e.provisional);
    return sortEntries(list, sortKey, sortDir);
  }, [data, showProvisional, sortKey, sortDir]);
  const podium = useMemo(() => (term ? [] : (data?.entries ?? []).filter((e) => !e.provisional).slice(0, 3)), [data, term]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const available = new Map((data?.categories ?? []).map((c) => [c.id, c.matchCount]));
  const chips = STATS_CATEGORIES.filter((c) => available.has(c.id) || (c.id === category && !data));
  const current = STATS_CATEGORIES.find((c) => c.id === category);
  // Categories in a menu: group categories first, then the player-count ones after a separator.
  const categoryItems = [...chips.filter((c) => c.group), ...chips.filter((c) => !c.group)].map((c, i, all) => ({
    key: c.id,
    label: (
      <span className={styles.catItem}>
        {c.label}
        <small>{available.get(c.id) ?? ""}</small>
      </span>
    ),
    selected: c.id === category,
    separatorBefore: i > 0 && !c.group && !!all[i - 1]!.group,
    onSelect: () => setCategory(c.id),
  }));

  return (
    <>
      <PageHeader
        title={titleWithGame("Bestenliste", game)}
        back="/stats"
        actions={
          <IconButton label="Wie wird gerechnet?" tooltip="Wie wird gerechnet?" onClick={() => setInfoOpen(true)}>
            <IoInformationCircleOutline />
          </IconButton>
        }
      />
      <main className={cx(styles.page, styles.pageWide)}>
        <div className={styles.controls}>
          <div className={styles.controlRow}>
            <Dropdown
              align="left"
              trigger={({ triggerProps }) => (
                <button type="button" className={cx(styles.catChip, styles.catTrigger)} aria-label={`Kategorie: ${current?.label ?? category}`} {...triggerProps}>
                  <span className={styles.chipFull}>{current?.label ?? "Kategorie"}</span>
                  <span className={styles.chipShort}>{current?.short ?? "Kategorie"}</span>
                  <small>{available.get(category) ?? ""}</small> ▾
                </button>
              )}
              items={categoryItems}
            />
            <Segmented<StatsPeriod>
              className={styles.periodSeg}
              ariaLabel="Zeitraum"
              value={period}
              onChange={setPeriod}
              options={STATS_PERIODS.map((p) => ({ value: p, label: STATS_PERIOD_LABELS[p] }))}
            />
            <div className={styles.searchRow}>
              <TextInput label="Spieler suchen" hideLabel placeholder="Spieler suchen …" value={search} onChange={(e) => setSearch(e.target.value)} className={styles.search} />
              <button
                type="button"
                className={styles.catChip}
                aria-pressed={showProvisional}
                title="Spieler mit wenigen Matches (vorläufige Wertung) anzeigen"
                onClick={() => setShowProvisional((v) => !v)}
              >
                Vorläufige
              </button>
            </div>
          </div>
        </div>

        {!data && query.isPending ? (
          <Spinner centered size="lg" />
        ) : query.isError && !data ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon="🏆"
            title={term || category !== "gesamt" || period !== "all" ? "Keine Treffer" : "Noch keine Statistik"}
            text={term || category !== "gesamt" || period !== "all" ? "In dieser Auswahl gibt es keine Spieler." : "Sobald Matches beendet werden, erscheinen die Spieler hier."}
          />
        ) : (
          <>
            <Podium entries={podium} />
            <div className={styles.lbTable}>
              <div className={cx(styles.lbRow, styles.lbHead)} role="row">
                <span>#</span>
                <span>Name</span>
                {COLUMNS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={cx(!c.phone && styles.hideSmall, sortKey === c.key && styles.active)}
                    aria-pressed={sortKey === c.key}
                    title={c.full}
                    aria-label={`Nach ${c.full} sortieren${sortKey === c.key ? (sortDir === "desc" ? ", absteigend" : ", aufsteigend") : ""}`}
                    onClick={() => onSort(c.key)}
                  >
                    {c.label}
                    {sortKey === c.key && <span aria-hidden="true">{sortDir === "desc" ? " ▾" : " ▴"}</span>}
                  </button>
                ))}
                <span className={styles.hideSmall}>Form</span>
                <span className={styles.chevSpace} />
              </div>
              <div className={styles.scroll}>
              <ul className={styles.list}>
                {sorted.map((e, i) => (
                  <LbRow key={e.key} e={e} i={i} open={expanded === e.key} onToggle={() => setExpanded(expanded === e.key ? null : e.key)} />
                ))}
              </ul>
              </div>
            </div>
          </>
        )}
        <p className={styles.hint}>
          Mit <span className={styles.guestBadge}>Gast</span> markierte Spieler haben kein Konto und werden nach Namen zusammengefasst.
        </p>
      </main>
      <StatsInfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </>
  );
}
