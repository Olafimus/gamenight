import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IoMenu } from "react-icons/io5";
import { canUndoEntry, getGame } from "@gamenight/shared";
import { ConfirmDialog, Dropdown, IconButton, cx, useToast } from "../../../ui";
import { SettingsModal } from "../SettingsModal";
import { useRunningSheet } from "../shared";
import { useGameStore, type SyncStatus } from "../store";
import { wakeLockSupported } from "../useWakeLock";
import { EntryDialog, type EntryTarget } from "./EntryDialog";
import { SheetBoard } from "./SheetBoard";
import play from "../PlayPage.module.css";
import styles from "./SheetPlayPage.module.css";

const SYNC_LABELS: Record<SyncStatus, string> = {
  idle: "Nur lokal gespeichert",
  synced: "Synchronisiert",
  syncing: "Synchronisiere …",
  offline: "Offline – wird synchronisiert, sobald wieder Verbindung besteht",
};

/** Running score-sheet game (Kniffel & co.): the sheet, a roll entry for the player on turn, undo. */
export function SheetPlayPage() {
  const run = useRunningSheet();
  const navigate = useNavigate();
  const toast = useToast();
  const syncStatus = useGameStore((s) => s.syncStatus);
  const syncError = useGameStore((s) => s.syncError);
  const keepAwake = useGameStore((s) => s.keepAwake);
  const [target, setTarget] = useState<EntryTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirm, setConfirm] = useState<"rematch" | "end" | null>(null);
  useEffect(() => {
    if (syncError) toast.show(syncError, { tone: "error", duration: 10000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncError]);
  if (!run) return null;
  const { state, match } = run;
  const store = useGameStore.getState();
  const report = (err: string | null) => err && toast.show(err, { tone: "error" });
  const active = match.players.find((p) => p.id === match.activePlayerId);
  const hasDice = !!state.rules.dice;
  const last = state.entries[state.entries.length - 1];
  const lastName = last ? match.players.find((p) => p.id === last.playerId)?.name : undefined;

  return (
    <div className={play.page}>
      <header className={play.header}>
        <span className={styles.headSpacer} aria-hidden="true" />
        <div className={play.info}>
          <div className={play.round}>
            {getGame(state.gameId)?.name ?? state.gameId} · {match.finished ? "Spiel beendet" : `Runde ${match.roundNumber} von ${match.totalRounds}`}
          </div>
          <div className={play.sub}>
            {active ? (
              <span>
                Am Zug: <strong>{active.name}</strong>
              </span>
            ) : (
              <span>Alle Felder gefüllt</span>
            )}
            {state.ruleset.name !== "Standard" && <span>{state.ruleset.name}</span>}
          </div>
        </div>
        <span className={cx(play.dot, play[`dot_${syncStatus}`])} role="status" title={SYNC_LABELS[syncStatus]} aria-label={SYNC_LABELS[syncStatus]} />
        <Dropdown
          align="right"
          trigger={({ triggerProps }) => (
            <IconButton label="Menü" tone="solid" {...triggerProps}>
              <IoMenu />
            </IconButton>
          )}
          items={[
            { key: "home", label: "Start", onSelect: () => navigate("/") },
            { key: "stats", label: "Statistik", onSelect: () => navigate("/game/stats") },
            { key: "settings", label: "Einstellungen", onSelect: () => setSettingsOpen(true) },
            ...(wakeLockSupported()
              ? [{ key: "awake", label: "Bildschirm anlassen", selected: keepAwake, separatorBefore: true, onSelect: () => store.setKeepAwake(!keepAwake) }]
              : []),
            { key: "rematch", label: "Noch ein Match", separatorBefore: true, onSelect: () => setConfirm("rematch") },
            { key: "end", label: "Spiel beenden", danger: true, onSelect: () => setConfirm("end") },
          ]}
        />
      </header>

      <main className={cx(play.main, styles.main)} aria-label="Punkteblock">
        <SheetBoard state={state} match={match} onCell={(ref) => setTarget({ kind: "cell", ref })} />
        <p className={styles.tip}>
          {hasDice ? "Wurf eintragen und Feld wählen – oder ein Feld direkt antippen (auch zum Streichen oder Korrigieren)." : "Feld antippen, um Punkte einzutragen oder zu korrigieren."}
        </p>
      </main>

      <nav className={play.bar} aria-label="Aktionen">
        <button
          type="button"
          className={cx(play.arrow, play.arrowLeft)}
          disabled={!canUndoEntry(state)}
          aria-label={lastName ? `Letzten Eintrag von ${lastName} zurücknehmen` : "Letzten Eintrag zurücknehmen"}
          onClick={() => report(store.undoEntry())}
        >
          <span className={play.long}>Zurück</span>
          <span className={play.short}>Zurück</span>
        </button>
        {match.finished ? (
          <button type="button" className={cx(play.arrow, play.arrowRight, play.finish)} onClick={() => navigate("/game/ceremony")}>
            Zur Siegerehrung
          </button>
        ) : hasDice && active ? (
          <button type="button" className={cx(play.arrow, play.arrowRight, styles.roll)} onClick={() => setTarget({ kind: "roll", playerId: active.id })}>
            Wurf von {active.name}
          </button>
        ) : (
          <span className={styles.flex} />
        )}
      </nav>

      <EntryDialog state={state} match={match} target={target} onClose={() => setTarget(null)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} state={state} match={match} />
      <ConfirmDialog
        open={confirm === "rematch"}
        title="Noch ein Match?"
        message="Das aktuelle Match wird beendet und ein neues mit den gleichen Spielern und Regeln gestartet."
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
