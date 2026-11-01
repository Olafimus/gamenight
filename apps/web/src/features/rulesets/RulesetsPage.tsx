import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { RulesetDto } from "@gamenight/shared";
import { apiDelete, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { catalogKey, useGameCatalog, useSelectedGame } from "../../lib/games";
import { ButtonLink, ConfirmDialog, PageHeader, Button, useToast } from "../../ui";
import { summarizeRules } from "./summary";
import styles from "./Rulesets.module.css";

/** Built-in and own rulesets per game; own ones can be edited/deleted, any can be copied. */
export function RulesetsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const catalog = useGameCatalog();
  const [params] = useSearchParams();
  // The game chosen on the start page; ?game= (links from the setup) overrides it.
  const selectedGame = useSelectedGame();
  const gameId = catalog.game(params.get("game") ?? "")?.id ?? selectedGame;
  const [deleting, setDeleting] = useState<RulesetDto | null>(null);
  const list = catalog.rulesetsOf(gameId);

  const remove = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/rulesets/${deleting.id}`);
      toast.show("Regelwerk gelöscht", { tone: "success" });
      await qc.invalidateQueries({ queryKey: catalogKey(user?.id) });
    } catch (e) {
      toast.show(errorMessage(e), { tone: "error" });
    }
    setDeleting(null);
  };

  return (
    <>
      <PageHeader title={`Regelwerke · ${catalog.game(gameId)?.name ?? gameId}`} back="/game" />
      <main className={styles.page}>
        {!user && (
          <p className={styles.note}>
            Eigene Regelwerke werden im Konto gespeichert. <ButtonLink to="/login" size="sm" variant="secondary">Anmelden</ButtonLink>
          </p>
        )}
        <ul className={styles.list}>
          {list.map((r) => (
            <li key={r.id} className={styles.item}>
              <div className={styles.itemHead}>
                <h2 className={styles.name}>{r.name}</h2>
                <span className={r.builtin ? styles.badge : styles.badgeOwn}>{r.builtin ? "eingebaut" : "eigenes"}</span>
              </div>
              {r.description && <p className={styles.desc}>{r.description}</p>}
              <ul className={styles.facts}>
                {summarizeRules(r).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <div className={styles.actions}>
                {user && (
                  <ButtonLink size="sm" variant="secondary" to={`/rulesets/new?base=${encodeURIComponent(r.id)}`}>
                    Kopieren &amp; anpassen
                  </ButtonLink>
                )}
                {!r.builtin && r.ownerUserId === user?.id && (
                  <>
                    <ButtonLink size="sm" to={`/rulesets/${r.id}`}>
                      Bearbeiten
                    </ButtonLink>
                    <Button size="sm" variant="danger" onClick={() => setDeleting(r)}>
                      Löschen
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </main>
      <ConfirmDialog
        open={!!deleting}
        title="Regelwerk löschen?"
        message={`„${deleting?.name ?? ""}“ wird gelöscht. Bereits gespielte Matches behalten ihre Regeln.`}
        confirmLabel="Löschen"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </>
  );
}
