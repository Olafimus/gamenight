import { sheetCategories, type SheetCategory, type SheetRules, type SheetScoring, type SheetSection } from "@gamenight/shared";
import { Button, IconButton, Segmented } from "../../ui";
import { IoClose } from "react-icons/io5";
import { Check, Field, Num, Select, Text } from "./fields";
import styles from "./Rulesets.module.css";

type ScoringType = SheetScoring["type"];
const TYPE_LABELS: Record<ScoringType, string> = {
  faceSum: "Augenzahl zählen",
  ofAKind: "Gleiche (Pasch)",
  groups: "Gruppen (Full House …)",
  straight: "Straße",
  chance: "Chance (Summe)",
  manual: "Freie Eingabe",
};

/** Slug from a label, unique among `taken`. */
export function slugify(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 28) || "feld";
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

function defaultScoring(type: ScoringType, dice: SheetRules["dice"]): SheetScoring {
  const count = dice?.count ?? 5;
  switch (type) {
    case "faceSum":
      return { type, face: 1 };
    case "ofAKind":
      return { type, count: Math.min(3, count), points: "sum" };
    case "groups":
      return { type, groups: [3, 2], points: 25 };
    case "straight":
      return { type, length: Math.min(4, count), points: 30 };
    case "chance":
      return { type };
    case "manual":
      return { type, min: 0, max: 100, step: 1 };
  }
}

/** "Augensumme" or fixed points. */
function PointsInput({ value, onChange }: { value: number | "sum"; onChange: (v: number | "sum") => void }) {
  return (
    <>
      <Select
        label="Punkte"
        value={value === "sum" ? "sum" : "fixed"}
        options={[
          { value: "sum", label: "Augensumme" },
          { value: "fixed", label: "feste Punkte" },
        ]}
        onChange={(v) => onChange(v === "sum" ? "sum" : 25)}
      />
      {value !== "sum" && <Num label="Punkte" value={value} onChange={onChange} />}
    </>
  );
}

function ScoringParams({ scoring, onChange }: { scoring: SheetScoring; onChange: (s: SheetScoring) => void }) {
  switch (scoring.type) {
    case "faceSum":
      return (
        <>
          <span className={styles.rowType}>Augenzahl</span>
          <Num label="Augenzahl" value={scoring.face} min={1} onChange={(face) => onChange({ ...scoring, face })} />
        </>
      );
    case "ofAKind":
      return (
        <>
          <span className={styles.rowType}>mind.</span>
          <Num label="Anzahl gleiche" value={scoring.count} min={2} onChange={(count) => onChange({ ...scoring, count })} />
          <span className={styles.rowType}>gleiche</span>
          <PointsInput value={scoring.points} onChange={(points) => onChange({ ...scoring, points })} />
        </>
      );
    case "groups":
      return (
        <>
          <span className={styles.rowType}>Gruppen</span>
          <Text
            className={styles.textIn + " " + styles.small}
            label="Gruppen, z. B. 3+2"
            value={scoring.groups.join("+")}
            onChange={(v) => {
              const groups = v.split(/[^0-9]+/).map(Number).filter((n) => n > 0);
              if (groups.length >= 2) onChange({ ...scoring, groups });
            }}
          />
          <PointsInput value={scoring.points} onChange={(points) => onChange({ ...scoring, points })} />
        </>
      );
    case "straight":
      return (
        <>
          <span className={styles.rowType}>Länge</span>
          <Num label="Länge der Straße" value={scoring.length} min={2} onChange={(length) => onChange({ ...scoring, length })} />
          <PointsInput value={scoring.points} onChange={(points) => onChange({ ...scoring, points })} />
        </>
      );
    case "chance":
      return <span className={styles.rowType}>Summe aller Würfel</span>;
    case "manual":
      return (
        <>
          <span className={styles.rowType}>von</span>
          <Num label="Minimum" value={scoring.min} onChange={(min) => onChange({ ...scoring, min })} />
          <span className={styles.rowType}>bis</span>
          <Num label="Maximum" value={scoring.max} onChange={(max) => onChange({ ...scoring, max })} />
          <span className={styles.rowType}>Schritt</span>
          <Num label="Schritt" value={scoring.step} min={1} onChange={(step) => onChange({ ...scoring, step })} />
        </>
      );
  }
}

/** Editor for "score-sheet" rules (Kniffel & co.). */
export function SheetRulesForm({ rules, onChange }: { rules: SheetRules; onChange: (r: SheetRules) => void }) {
  const set = (patch: Partial<SheetRules>) => onChange({ ...rules, ...patch });
  const setSection = (si: number, patch: Partial<SheetSection>) =>
    set({ sections: rules.sections.map((s, i) => (i === si ? { ...s, ...patch } : s)) });
  const setCategory = (si: number, ci: number, patch: Partial<SheetCategory>) =>
    setSection(si, { categories: rules.sections[si]!.categories.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });
  const allIds = () => new Set(sheetCategories(rules).map((c) => c.id));
  const allOfAKind = sheetCategories(rules).filter((c) => c.scoring.type === "ofAKind" && rules.dice && c.scoring.count === rules.dice.count);

  const addCategory = (si: number, type: ScoringType) => {
    const label = TYPE_LABELS[type].split(" ")[0]!;
    const cat: SheetCategory = { id: slugify(label, allIds()), label, scoring: defaultScoring(type, rules.dice) };
    setSection(si, { categories: [...rules.sections[si]!.categories, cat] });
  };
  const removeCategory = (si: number, ci: number) => {
    const removed = rules.sections[si]!.categories[ci]!;
    const sections = rules.sections.map((s, i) => (i === si ? { ...s, categories: s.categories.filter((_, j) => j !== ci) } : s));
    onChange({ ...rules, sections, repeatBonus: rules.repeatBonus?.categoryId === removed.id ? null : rules.repeatBonus });
  };

  return (
    <>
      <section className={styles.section}>
        <h2>Spieler & Würfel</h2>
        <div className={styles.grid}>
          <Field label="Spieler min.">
            <Num value={rules.players.min} min={1} max={10} onChange={(min) => set({ players: { ...rules.players, min } })} />
          </Field>
          <Field label="Spieler max.">
            <Num value={rules.players.max} min={1} max={10} onChange={(max) => set({ players: { ...rules.players, max } })} />
          </Field>
          <Field label="Gewinner (Punkte)">
            <Segmented
              ariaLabel="Gewinner"
              value={rules.winner}
              onChange={(winner) => set({ winner })}
              options={[
                { value: "highest", label: "meiste" },
                { value: "lowest", label: "wenigste" },
              ]}
            />
          </Field>
        </div>
        <Check checked={!!rules.dice} onChange={(on) => set({ dice: on ? { count: 5, faces: 6 } : null, repeatBonus: on ? rules.repeatBonus : null })}>
          Mit Würfeln (Punkte werden aus dem Wurf berechnet)
        </Check>
        {rules.dice && (
          <div className={styles.grid}>
            <Field label="Anzahl Würfel">
              <Num value={rules.dice.count} min={1} max={10} onChange={(count) => set({ dice: { ...rules.dice!, count } })} />
            </Field>
            <Field label="Seiten je Würfel">
              <Num value={rules.dice.faces} min={2} max={20} onChange={(faces) => set({ dice: { ...rules.dice!, faces } })} />
            </Field>
          </div>
        )}
      </section>

      {rules.sections.map((sec, si) => (
        <section key={si} className={styles.section}>
          <div className={styles.row} style={{ background: "none", padding: 0 }}>
            <Text className={`${styles.textIn} ${styles.grow}`} label="Name des Abschnitts" value={sec.label} onChange={(label) => setSection(si, { label })} />
            {rules.sections.length > 1 && (
              <Button size="sm" variant="ghost" onClick={() => set({ sections: rules.sections.filter((_, i) => i !== si) })}>
                Abschnitt entfernen
              </Button>
            )}
          </div>
          <div className={styles.rows}>
            {sec.categories.map((c, ci) => (
              <div key={c.id} className={styles.row}>
                <Text className={`${styles.textIn} ${styles.grow}`} label="Feldname" value={c.label} onChange={(label) => setCategory(si, ci, { label })} />
                <Text className={`${styles.textIn} ${styles.small}`} label="Kurzname" placeholder="kurz" value={c.short ?? ""} onChange={(short) => setCategory(si, ci, { short: short || undefined })} />
                <ScoringParams scoring={c.scoring} onChange={(scoring) => setCategory(si, ci, { scoring })} />
                <IconButton label={`${c.label} entfernen`} size="sm" onClick={() => removeCategory(si, ci)}>
                  <IoClose />
                </IconButton>
              </div>
            ))}
          </div>
          <div className={styles.row} style={{ background: "none", padding: 0 }}>
            <span className={styles.rowType}>Feld hinzufügen:</span>
            {(Object.keys(TYPE_LABELS) as ScoringType[])
              .filter((t) => rules.dice || t === "manual")
              .map((t) => (
                <Button key={t} size="sm" variant="secondary" onClick={() => addCategory(si, t)}>
                  {TYPE_LABELS[t]}
                </Button>
              ))}
          </div>

          <h3>Bonus für diesen Abschnitt</h3>
          <div className={styles.rows}>
            {sec.bonuses.map((b, bi) => (
              <div key={b.id} className={styles.row}>
                <Text
                  className={`${styles.textIn} ${styles.grow}`}
                  label="Bonus-Name"
                  value={b.label}
                  onChange={(label) => setSection(si, { bonuses: sec.bonuses.map((x, i) => (i === bi ? { ...x, label } : x)) })}
                />
                <span className={styles.rowType}>ab</span>
                <Num label="Schwelle" value={b.threshold} onChange={(threshold) => setSection(si, { bonuses: sec.bonuses.map((x, i) => (i === bi ? { ...x, threshold } : x)) })} />
                <span className={styles.rowType}>Punkten:</span>
                <Num label="Bonuspunkte" value={b.points} onChange={(points) => setSection(si, { bonuses: sec.bonuses.map((x, i) => (i === bi ? { ...x, points } : x)) })} />
                <IconButton label="Bonus entfernen" size="sm" onClick={() => setSection(si, { bonuses: sec.bonuses.filter((_, i) => i !== bi) })}>
                  <IoClose />
                </IconButton>
              </div>
            ))}
          </div>
          {sec.bonuses.length < 5 && (
            <div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setSection(si, {
                    bonuses: [...sec.bonuses, { id: slugify("bonus", new Set(sec.bonuses.map((b) => b.id))), label: "Bonus", threshold: 63, points: 35 }],
                  })
                }
              >
                Bonus hinzufügen
              </Button>
            </div>
          )}
        </section>
      ))}
      {rules.sections.length < 5 && (
        <div>
          <Button
            variant="secondary"
            onClick={() =>
              set({
                sections: [
                  ...rules.sections,
                  {
                    id: slugify("abschnitt", new Set(rules.sections.map((s) => s.id))),
                    label: "Neuer Abschnitt",
                    categories: [{ id: slugify("feld", allIds()), label: "Feld", scoring: defaultScoring(rules.dice ? "chance" : "manual", rules.dice) }],
                    bonuses: [],
                  },
                ],
              })
            }
          >
            Abschnitt hinzufügen
          </Button>
        </div>
      )}

      <section className={styles.section}>
        <h2>Spalten & Ablauf</h2>
        <div className={styles.rows}>
          {rules.columns.map((col, i) => (
            <div key={i} className={styles.row}>
              <Text className={`${styles.textIn} ${styles.grow}`} label="Spaltenname" value={col.label} onChange={(label) => set({ columns: rules.columns.map((c, j) => (j === i ? { ...c, label } : c)) })} />
              <span className={styles.rowType}>Faktor ×</span>
              <Num label="Multiplikator" value={col.multiplier} min={1} max={10} onChange={(multiplier) => set({ columns: rules.columns.map((c, j) => (j === i ? { ...c, multiplier } : c)) })} />
              {rules.columns.length > 1 && (
                <IconButton label="Spalte entfernen" size="sm" onClick={() => set({ columns: rules.columns.filter((_, j) => j !== i) })}>
                  <IoClose />
                </IconButton>
              )}
            </div>
          ))}
        </div>
        {rules.columns.length < 6 && (
          <div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => set({ columns: [...rules.columns, { label: `Spalte ${rules.columns.length + 1}`, multiplier: rules.columns.length + 1 }] })}
            >
              Spalte hinzufügen
            </Button>
          </div>
        )}
        <Check checked={rules.fillOrder === "topDown"} onChange={(v) => set({ fillOrder: v ? "topDown" : "any" })}>
          Felder von oben nach unten ausfüllen
        </Check>
        {rules.dice && (
          <>
            <Check
              checked={!!rules.repeatBonus}
              disabled={allOfAKind.length === 0}
              onChange={(on) => set({ repeatBonus: on && allOfAKind[0] ? { categoryId: allOfAKind[0].id, points: 50, joker: "free" } : null })}
            >
              Extra-Bonus für jeden weiteren Wurf mit lauter gleichen Würfeln
            </Check>
            {rules.repeatBonus && (
              <div className={styles.grid}>
                <Field label="Feld">
                  <Select
                    value={rules.repeatBonus.categoryId}
                    options={allOfAKind.map((c) => ({ value: c.id, label: c.label }))}
                    onChange={(categoryId) => set({ repeatBonus: { ...rules.repeatBonus!, categoryId } })}
                  />
                </Field>
                <Field label="Bonuspunkte">
                  <Num value={rules.repeatBonus.points} onChange={(points) => set({ repeatBonus: { ...rules.repeatBonus!, points } })} />
                </Field>
                <Field label="Joker">
                  <Select
                    value={rules.repeatBonus.joker}
                    options={[
                      { value: "none", label: "kein Joker" },
                      { value: "free", label: "frei (zählt als Full House/Straße)" },
                      { value: "forced", label: "Zwang (oberes Feld zuerst)" },
                    ]}
                    onChange={(joker) => set({ repeatBonus: { ...rules.repeatBonus!, joker } })}
                  />
                </Field>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
