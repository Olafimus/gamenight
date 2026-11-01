import { useEffect, useState } from "react";
import { IoCopyOutline } from "react-icons/io5";
import { getGame, isTrickMatch, type DerivedMatch, type MatchPlayer, type MatchState } from "@gamenight/shared";
import { Button, Dropdown, IconButton, Modal, Segmented, useToast } from "../../ui";
import { SeatList } from "./SeatList";
import { LinkAccountDialog } from "./LinkAccountDialog";
import { useGameStore } from "./store";
import styles from "./SettingsModal.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  state: MatchState;
  match: DerivedMatch;
}

export function SettingsModal({ open, onClose, state, match }: Props) {
  const toast = useToast();
  const code = useGameStore((s) => s.code);
  const stored = state.setup.players;
  const [order, setOrder] = useState(stored);
  const [linking, setLinking] = useState<MatchPlayer | null>(null);

  // re-initialise whenever the dialog is (re)opened or the stored order changes
  useEffect(() => {
    if (open) setOrder(stored);
  }, [open, stored]);

  const changed = order.some((p, i) => p.id !== stored[i]?.id);
  const store = useGameStore.getState();

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast.show("Code kopiert", { tone: "success" });
    } catch {
      toast.show(`Code: ${code}`, { tone: "info" });
    }
  };

  const setDeck = (deck: number) => {
    const err = store.setDeck(deck);
    if (err) toast.show(`Deck nicht änderbar: ${err}`, { tone: "error" });
  };

  const save = () => {
    const err = store.reorderSeats(order.map((p) => p.id));
    if (err) toast.show(err, { tone: "error" });
    else toast.show("Sitzordnung gespeichert", { tone: "success" });
  };

  const trick = isTrickMatch(state) && match.kind === "trick-bidding" ? { state, match } : null;
  const giverId = trick?.match.giverId;
  const giver = stored.find((p) => p.id === giverId);

  return (
    <>
    <Modal open={open} onClose={onClose} title="Einstellungen" wide footer={<Button onClick={onClose}>Fertig</Button>}>
      <div className={styles.body}>
        <dl className={styles.info}>
          <div>
            <dt>Spiel</dt>
            <dd>
              {getGame(state.gameId)?.name ?? state.gameId} · {state.ruleset.name}
            </dd>
          </div>
          <div>
            <dt>Spieler</dt>
            <dd>{stored.length}</dd>
          </div>
          {trick && (
            <div>
              <dt>Deck</dt>
              <dd>{trick.state.setup.deckSize}</dd>
            </div>
          )}
          <div>
            <dt>Runden</dt>
            <dd>{match.totalRounds}</dd>
          </div>
          <div>
            <dt>Match-Code</dt>
            <dd className={styles.code}>
              <span data-testid="match-code">{code ?? "–"}</span>
              {code && (
                <IconButton label="Code kopieren" size="sm" onClick={copy}>
                  <IoCopyOutline />
                </IconButton>
              )}
            </dd>
          </div>
        </dl>
        {!code && <p className={styles.hint}>Der Code erscheint, sobald das Match mit dem Server synchronisiert ist.</p>}

        {trick && trick.state.rules.deck.sizes.length > 1 && (
          <section className={styles.section}>
            <h3>Kartendeck</h3>
            <Segmented
              ariaLabel="Deckgröße"
              value={trick.state.setup.deckSize}
              onChange={setDeck}
              options={trick.state.rules.deck.sizes.map((d) => ({ value: d, label: String(d) }))}
            />
          </section>
        )}

        {trick && (
        <section className={styles.section}>
          <h3>Aktueller Geber</h3>
          <Dropdown
            align="left"
            trigger={({ triggerProps }) => (
              <Button variant="secondary" {...triggerProps}>
                {giver?.name ?? "–"} ▾
              </Button>
            )}
            items={stored.map((p) => ({
              key: p.id,
              label: p.name,
              selected: p.id === giverId,
              onSelect: () => {
                const err = store.setGiver(p.id);
                if (err) toast.show(err, { tone: "error" });
              },
            }))}
          />
        </section>
        )}

        <section className={styles.section}>
          <h3>Sitzordnung</h3>
          <SeatList players={order} markId={giverId} onLink={setLinking} onReorder={(ids) => setOrder(ids.map((id) => order.find((p) => p.id === id)!))} />
          {changed && (
            <div className={styles.row}>
              <Button variant="ghost" onClick={() => setOrder(stored)}>
                Abbrechen
              </Button>
              <Button onClick={save}>Speichern</Button>
            </div>
          )}
        </section>
      </div>
    </Modal>
      <LinkAccountDialog
        player={linking}
        onClose={() => setLinking(null)}
        onLink={(p, acc) => store.linkSeat(p.id, acc)}
        onUnlink={(p, name) => store.linkSeat(p.id, null, name)}
      />
    </>
  );
}
