import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getGame, rulesetSchema, type Ruleset, type RulesetDto, type SaveRulesetRequest } from "@gamenight/shared";
import { apiPost, apiPut, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { catalogKey, useGameCatalog } from "../../lib/games";
import { Button, ButtonLink, EmptyState, PageHeader, Spinner, TextInput, useToast } from "../../ui";
import { SheetRulesForm } from "./SheetRulesForm";
import { TrickRulesForm } from "./TrickRulesForm";
import styles from "./Rulesets.module.css";

/** /rulesets/new?base=<id> (copy) and /rulesets/:id (edit own). */
export function RulesetEditPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  const catalog = useGameCatalog();
  const isNew = id === "new";
  const source = catalog.ruleset(isNew ? (params.get("base") ?? "") : id);
  const title = isNew ? "Neues Regelwerk" : "Regelwerk bearbeiten";

  if (loading || (catalog.loading && !source)) {
    return (
      <>
        <PageHeader title={title} back="/rulesets" />
        <Spinner centered size="lg" />
      </>
    );
  }
  if (!user || !source || (!isNew && source.ownerUserId !== user.id)) {
    return (
      <>
        <PageHeader title={title} back="/rulesets" />
        <main className={styles.page}>
          <EmptyState
            title={!user ? "Bitte anmelden" : "Regelwerk nicht gefunden"}
            text={!user ? "Eigene Regelwerke werden in deinem Konto gespeichert." : "Dieses Regelwerk gibt es nicht (mehr) oder es gehört dir nicht."}
            action={!user ? <ButtonLink to="/login">Anmelden</ButtonLink> : <ButtonLink to="/rulesets">Zur Übersicht</ButtonLink>}
          />
        </main>
      </>
    );
  }
  return <Editor key={source.id} source={source} isNew={isNew} title={title} />;
}

function Editor({ source, isNew, title }: { source: RulesetDto; isNew: boolean; title: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState(isNew ? `${source.name} (eigene)` : source.name);
  const [description, setDescription] = useState(source.description);
  const [draft, setDraft] = useState<Ruleset>(() => ({ ...source }));
  const [saving, setSaving] = useState(false);

  const body: SaveRulesetRequest = { kind: draft.kind, gameId: draft.gameId, name: name.trim(), description: description.trim(), rules: draft.rules } as SaveRulesetRequest;
  const parsed = rulesetSchema.safeParse({ ...body, id: "x" });
  const errors = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.filter((p) => p !== "rules").join(" › ") || "Allgemein"}: ${i.message}`);

  const save = async () => {
    setSaving(true);
    try {
      const saved = isNew ? await apiPost<RulesetDto>("/rulesets", body) : await apiPut<RulesetDto>(`/rulesets/${source.id}`, body);
      await qc.invalidateQueries({ queryKey: catalogKey(user?.id) });
      toast.show("Regelwerk gespeichert", { tone: "success" });
      navigate(`/rulesets?game=${encodeURIComponent(saved.gameId)}`);
    } catch (e) {
      toast.show(errorMessage(e), { tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={`${title} · ${getGame(draft.gameId)?.name ?? draft.gameId}`} back={`/rulesets?game=${encodeURIComponent(draft.gameId)}`} />
      <main className={styles.page}>
        <div className={styles.form}>
          <section className={styles.section}>
            <div className={styles.grid}>
              <TextInput label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              <TextInput label="Beschreibung" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </section>
          {draft.kind === "trick-bidding" ? (
            <TrickRulesForm rules={draft.rules} onChange={(rules) => setDraft({ ...draft, rules })} />
          ) : (
            <SheetRulesForm rules={draft.rules} onChange={(rules) => setDraft({ ...draft, rules })} />
          )}
          {errors.length > 0 && (
            <ul className={styles.errors} role="alert">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
        <div className={styles.footer}>
          <ButtonLink variant="ghost" to={`/rulesets?game=${encodeURIComponent(draft.gameId)}`}>
            Abbrechen
          </ButtonLink>
          <Button disabled={errors.length > 0 || saving} loading={saving} onClick={() => void save()}>
            Speichern
          </Button>
        </div>
      </main>
    </>
  );
}
