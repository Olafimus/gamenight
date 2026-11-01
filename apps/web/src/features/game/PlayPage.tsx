import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IoContract, IoEllipseOutline, IoFootsteps, IoExpand, IoGrid, IoMenu, IoReorderFour, IoTabletLandscapeOutline } from "react-icons/io5";
import {
  canCommitRound,
  canUndoRound,
  type DerivedMatch,
  type DerivedPlayer,
} from "@scheisse/shared";
import { CheckToggle, ConfirmDialog, Dropdown, IconButton, NumberInput, cx, useToast } from "../../ui";
import { SettingsModal } from "./SettingsModal";
import { useGameStore, type GameView, type SortMode, type SyncStatus } from "./store";
import { useRunningMatch } from "./shared";
import { haptic } from "./haptics";
import { wakeLockSupported } from "./useWakeLock";
import { useRoundActions } from "./views/controls";
import { CompactView } from "./views/CompactView";
import { SplitView } from "./views/SplitView";
import { TableView } from "./views/TableView";
import { WizardView } from "./views/WizardView";
import { SPLIT_MIN_WIDTH, useEffectiveView, useViewport } from "./views/useView";
import styles from "./PlayPage.module.css";

const SORT_LABELS: Record<SortMode, string> = {
  seat: "Sitzordnung",
  rank: "Nach Platzierung",
  giver: "Geber zuerst",
};

const SYNC_LABELS: Record<SyncStatus, string> = {
  idle: "Nur lokal gespeichert",
  synced: "Synchronisiert",
  syncing: "Synchronisiere …",
  offline: "Offline – wird synchronisiert, sobald wieder Verbindung besteht",
};

const VIEW_LABELS: Record<GameView, string> = {
  compact: "Kompakt",
  wizard: "Assistent",
  table: "Tisch",
  split: "Split",
  cards: "Karten",
};

const VIEW_ICONS: Record<GameView, JSX.Element> = {
  compact: <IoReorderFour />,
  wizard: <IoFootsteps />,
  table: <IoEllipseOutline />,
  split: <IoTabletLandscapeOutline />,
  cards: <IoGrid />,
};

export function sortPlayers(players: DerivedPlayer[], mode: SortMode, giverId: string): DerivedPlayer[] {
  if (mode === "rank") {
    return players
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (a.p.placement ?? 0) - (b.p.placement ?? 0) || a.i - b.i)
      .map((x) => x.p);
  }
  if (mode === "giver") {
    const idx = players.findIndex((p) => p.id === giverId);
    return idx <= 0 ? players : [...players.slice(idx), ...players.slice(0, idx)];
  }
  return players;
}

function SyncDot({ status }: { status: SyncStatus }) {
  return (
    <span className={cx(styles.dot, styles[`dot_${status}`])} role="status" title={SYNC_LABELS[status]} aria-label={SYNC_LABELS[status]} />
  );
}

export function PlayPage() {
  const run = useRunningMatch();
  const navigate = useNavigate();
  const toast = useToast();
  const sortMode = useGameStore((s) => s.sortMode);
  const syncStatus = useGameStore((s) => s.syncStatus);
  const keepAwake = useGameStore((s) => s.keepAwake);
  const view = useEffectiveView();
  const { width } = useViewport();
  const actions = useRoundActions();
  const fullscreen = useFullscreen();
  const syncError = useGameStore((s) => s.syncError);
  useEffect(() => {
    if (syncError) toast.show(syncError, { tone: "error", duration: 10000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncError]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirm, setConfirm] = useState<"rematch" | "end" | null>(null);
  if (!run) return null;
  const { state, match } = run;
  const store = useGameStore.getState();
  const report = (err: string | null) => err && toast.show(err, { tone: "error" });

  const sorted = sortPlayers(match.players, sortMode, match.giverId);
  const canCommit = canCommitRound(state);
  const canUndo = canUndoRound(state);

  return (
    <div className={styles.page}>
      <GameHeader
        match={match}
        sortMode={sortMode}
        view={view}
        availableViews={(Object.keys(VIEW_LABELS) as GameView[]).filter((v) => v !== "split" || width >= SPLIT_MIN_WIDTH)}
        onView={store.setView}
        keepAwake={keepAwake}
        onKeepAwake={store.setKeepAwake}
        fullscreen={fullscreen}
        syncStatus={syncStatus}
        onSort={store.setSortMode}
        onNavigate={navigate}
        onSettings={() => setSettingsOpen(true)}
        onRematch={() => setConfirm("rematch")}
        onEnd={() => setConfirm("end")}
      />

      <main className={styles.main} aria-label="Spieler" data-view={view}>
        {view === "cards" && (
          <div className={styles.grid}>
            {sorted.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                isGiver={p.id === match.giverId}
                bid={state.current.bids[p.id] ?? 0}
                correct={state.current.correct[p.id]}
                maxBid={match.cardsThisRound}
                disabled={match.finished}
                onBid={(v) => actions.setBid(p.id, v ?? 0)}
                onCorrect={(v) => {
                  haptic(10);
                  actions.setCorrect(p.id, v);
                }}
              />
            ))}
          </div>
        )}
        {view === "compact" && <CompactView state={state} match={match} players={sorted} actions={actions} />}
        {view === "table" && <TableView state={state} match={match} players={sorted} actions={actions} />}
        {view === "split" && <SplitView state={state} match={match} players={sorted} actions={actions} />}
        {view === "wizard" && <WizardView state={state} match={match} players={sorted} actions={actions} />}
      </main>

      {view !== "wizard" && (
      <nav className={styles.bar} aria-label="Aktionen">
        <button type="button" className={cx(styles.arrow, styles.arrowLeft)} disabled={!canUndo} aria-label="Letzte Runde" onClick={() => report(store.undo())}>
          <span className={styles.long}>Letzte Runde</span><span className={styles.short}>Zurück</span>
        </button>
        {match.finished ? (
          <button type="button" className={cx(styles.arrow, styles.arrowRight, styles.finish)} onClick={() => navigate("/game/ceremony")}>
            Zur Siegerehrung
          </button>
        ) : (
          <>
            <div className={styles.mid}>
              <button type="button" className={cx(styles.pill, styles.no)} aria-label="Alle falsch" onClick={() => actions.setAll(false)}>
                <span className={styles.long}>alle ✗</span><span className={styles.sym} aria-hidden="true">✗</span>
              </button>
              <button type="button" className={styles.pill} onClick={() => report(store.resetRound())}>
                Reset
              </button>
              <button type="button" className={cx(styles.pill, styles.yes)} aria-label="Alle richtig" onClick={() => actions.setAll(true)}>
                <span className={styles.long}>alle ✓</span><span className={styles.sym} aria-hidden="true">✓</span>
              </button>
            </div>
            <button
              type="button"
              className={cx(styles.arrow, styles.arrowRight)}
              disabled={!canCommit}
              aria-label="Nächste Runde"
              onClick={actions.commit}
            >
              <span className={styles.long}>Nächste Runde</span><span className={styles.short}>Weiter</span>
            </button>
          </>
        )}
      </nav>
      )}

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} state={state} match={match} />

      <ConfirmDialog
        open={confirm === "rematch"}
        title="Noch ein Match?"
        message="Das aktuelle Match wird beendet und ein neues mit den gleichen Spielern und der gleichen Sitzordnung gestartet."
        confirmLabel="Neues Match"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          report(store.rematch());
        }}
      />
      <ConfirmDialog
        open={confirm === "end"}
        title="Spiel beenden?"
        message="Der laufende Spielstand wird von diesem Gerät gelöscht und du kehrst zur Spielerauswahl zurück."
        confirmLabel="Spiel beenden"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          store.endGame();
        }}
      />
    </div>
  );
}

/** Fullscreen API state + toggle (supported = false e.g. on iPhone Safari). */
function useFullscreen() {
  const supported = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const [active, setActive] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  useEffect(() => {
    if (!supported) return;
    const on = () => setActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, [supported]);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };
  return { supported, active, toggle };
}

function GameHeader({
  match,
  sortMode,
  view,
  availableViews,
  onView,
  keepAwake,
  onKeepAwake,
  fullscreen,
  syncStatus,
  onSort,
  onNavigate,
  onSettings,
  onRematch,
  onEnd,
}: {
  match: DerivedMatch;
  sortMode: SortMode;
  view: GameView;
  availableViews: GameView[];
  onView: (v: GameView) => void;
  keepAwake: boolean;
  onKeepAwake: (on: boolean) => void;
  fullscreen: { supported: boolean; active: boolean; toggle: () => void };
  syncStatus: SyncStatus;
  onSort: (m: SortMode) => void;
  onNavigate: (to: string) => void;
  onSettings: () => void;
  onRematch: () => void;
  onEnd: () => void;
}) {
  const ok = match.sumMatchesCards;
  return (
    <header className={styles.header}>
      <Dropdown
        align="left"
        trigger={({ triggerProps }) => (
          <IconButton label={`Ansicht: ${VIEW_LABELS[view]}`} tone="solid" {...triggerProps}>
            {VIEW_ICONS[view]}
          </IconButton>
        )}
        items={[
          ...availableViews.map((v) => ({
            key: `view-${v}`,
            label: `Ansicht: ${VIEW_LABELS[v]}`,
            icon: VIEW_ICONS[v],
            selected: v === view,
            onSelect: () => onView(v),
          })),
          ...(Object.keys(SORT_LABELS) as SortMode[]).map((m, i) => ({
            key: `sort-${m}`,
            label: `Sortierung: ${SORT_LABELS[m]}`,
            selected: m === sortMode,
            separatorBefore: i === 0,
            onSelect: () => onSort(m),
          })),
        ]}
      />
      <div className={styles.info}>
        <div className={styles.round}>
          {match.finished ? "Spiel beendet" : `Runde ${match.roundNumber} von ${match.totalRounds}`}
        </div>
        <div className={styles.sub}>
          <span>
            Geber: <strong>{match.giverName}</strong>
          </span>
          {!match.finished && (
            <span className={ok ? styles.sumOk : styles.sumBad} data-testid="stiche">
              Stiche: {match.calledSum} / {match.cardsThisRound}
            </span>
          )}
        </div>
      </div>
      <SyncDot status={syncStatus} />
      <Dropdown
        align="right"
        trigger={({ triggerProps }) => (
          <IconButton label="Menü" tone="solid" {...triggerProps}>
            <IoMenu />
          </IconButton>
        )}
        items={[
          { key: "home", label: "Start", onSelect: () => onNavigate("/") },
          { key: "board", label: "Scoreboard", onSelect: () => onNavigate("/game/scoreboard") },
          { key: "stats", label: "Statistik", onSelect: () => onNavigate("/game/stats") },
          { key: "settings", label: "Einstellungen", onSelect: onSettings },
          ...(wakeLockSupported()
            ? [{ key: "awake", label: "Bildschirm anlassen", selected: keepAwake, separatorBefore: true, onSelect: () => onKeepAwake(!keepAwake) }]
            : []),
          ...(fullscreen.supported
            ? [{ key: "fs", label: fullscreen.active ? "Vollbild beenden" : "Vollbild", icon: fullscreen.active ? <IoContract /> : <IoExpand />, onSelect: fullscreen.toggle }]
            : []),
          { key: "rematch", label: "Noch ein Match", separatorBefore: true, onSelect: onRematch },
          { key: "end", label: "Spiel beenden", danger: true, onSelect: onEnd },
        ]}
      />
    </header>
  );
}

function PlayerCard({
  player,
  isGiver,
  bid,
  correct,
  maxBid,
  disabled,
  onBid,
  onCorrect,
}: {
  player: DerivedPlayer;
  isGiver: boolean;
  bid: number;
  correct: boolean | undefined;
  maxBid: number;
  disabled: boolean;
  onBid: (v: number | null) => void;
  onCorrect: (v: boolean) => void;
}) {
  return (
    <article className={cx(styles.card, isGiver && styles.cardGiver)} data-testid={`player-${player.id}`}>
      <div className={styles.cardTop}>
        <h2 className={styles.name}>
          {player.name}
          {player.placement !== null && <span className={styles.place}> · {player.placement}.</span>}
        </h2>
        {isGiver && <span className={styles.giverBadge}>Geber</span>}
      </div>
      <div className={styles.points}>
        Punkte: <strong>{player.total}</strong>
      </div>
      <div className={styles.controls}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Ansage</span>
          <NumberInput label={`Ansage von ${player.name}`} value={bid} min={0} max={maxBid} compact disabled={disabled} onChange={onBid} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Richtig?</span>
          <CheckToggle label={player.name} value={correct} compact disabled={disabled} onChange={onCorrect} />
        </div>
      </div>
    </article>
  );
}
