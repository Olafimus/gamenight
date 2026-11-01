import { useState } from "react";
import { cardsForRound } from "@scheisse/shared";
import { Scoreboard } from "../../components/Scoreboard";
import { Button, CheckToggle, Modal, NumberInput, PageHeader, useToast } from "../../ui";
import { NoMatch, useRunningMatch } from "./shared";
import { useGameStore } from "./store";
import styles from "./ScoreboardPage.module.css";

interface Editing {
  round: number; // 0-based
  playerId: string;
  bid: number;
  correct: boolean;
}

export function ScoreboardPage() {
  const run = useRunningMatch();
  const toast = useToast();
  const [correcting, setCorrecting] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  if (!run) return <NoMatch title="Scoreboard" />;
  const { match } = run;

  const open = (round: number, playerId: string) => {
    const p = match.players.find((x) => x.id === playerId);
    if (!p) return;
    setEditing({ round, playerId, bid: p.bids[round] ?? 0, correct: p.correct[round] ?? false });
  };

  const save = () => {
    if (!editing) return;
    const err = useGameStore.getState().correct(editing.round, editing.playerId, { bid: editing.bid, correct: editing.correct });
    if (err) toast.show(err, { tone: "error" });
    else toast.show("Eintrag korrigiert", { tone: "success" });
    setEditing(null);
  };

  const editingPlayer = editing ? match.players.find((p) => p.id === editing.playerId) : undefined;

  return (
    <>
      <PageHeader
        title="Scoreboard"
        back="/game"
        actions={
          <Button size="sm" variant={correcting ? "primary" : "secondary"} aria-pressed={correcting} onClick={() => setCorrecting((c) => !c)}>
            <span className={styles.long}>Einträge korrigieren</span><span className={styles.short}>Korrigieren</span>
          </Button>
        }
      />
      <main className={styles.page}>
        <Scoreboard match={match} correctionMode={correcting} onCellClick={open} />
      </main>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Eintrag korrigieren"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Abbrechen
            </Button>
            <Button onClick={save}>Speichern</Button>
          </>
        }
      >
        {editing && editingPlayer && (
          <div className={styles.form}>
            <p className={styles.lead}>
              Runde <strong>{editing.round + 1}</strong> · {editingPlayer.name}
            </p>
            <div className={styles.field}>
              <span>Ansage</span>
              <NumberInput
                dark
                label={`Ansage von ${editingPlayer.name} in Runde ${editing.round + 1}`}
                value={editing.bid}
                min={0}
                max={cardsForRound(editing.round + 1, match.peak)}
                onChange={(v) => setEditing({ ...editing, bid: v ?? 0 })}
              />
            </div>
            <div className={styles.field}>
              <span>Richtig?</span>
              <CheckToggle label={editingPlayer.name} value={editing.correct} onChange={(v) => setEditing({ ...editing, correct: v })} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
