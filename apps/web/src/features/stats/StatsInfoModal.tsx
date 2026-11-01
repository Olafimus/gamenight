import { Button, Modal } from "../../ui";
import styles from "./Stats.module.css";

export function StatsInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Wie wird gerechnet?" footer={<Button onClick={onClose}>Verstanden</Button>}>
      <dl className={styles.info}>
        <dt>Elo</dt>
        <dd>
          Alle starten bei 1000. Nach jedem beendeten Match wird jeder Spieler paarweise mit jedem anderen verglichen (Sieg = 1, Gleichstand = ½, Niederlage = 0 nach Platzierung).
          Pro Paar gilt K = 32 / (Spieler − 1); erwartet wird E = 1 / (1 + 10<sup>(Gegner − Ich)/400</sup>). Änderung = Σ K · (Ergebnis − E). Matches zählen in zeitlicher Reihenfolge. Die Elo ist immer die
          Gesamt-Elo; „±“ zeigt die Änderung durch Matches der gewählten Kategorie und Zeitspanne.
        </dd>
        <dt>Siegquote vs. Erwartung</dt>
        <dd>Anteil gewonnener Matches im Vergleich zur reinen Zufallserwartung (Mittel von 1 / Spieleranzahl). 42 % bei 25 % erwartet = +17 Prozentpunkte (pp).</dd>
        <dt>Platzierungs-Score</dt>
        <dd>Pro Match (Spieler − Platz) / (Spieler − 1): Sieger 100 %, Letzter 0 %. Angezeigt ist der Durchschnitt.</dd>
        <dt>Ø Punkte</dt>
        <dd>Durchschnittliche Punkte pro Runde.</dd>
        <dt>Trefferquote</dt>
        <dd>Richtig angesagte Runden / gespielte Runden.</dd>
        <dt>Vorläufig</dt>
        <dd>Weniger als 3 Matches in der gewählten Auswahl. Vorläufige Spieler stehen hinter den gewerteten und können ausgeblendet werden.</dd>
        <dt>Form</dt>
        <dd>Die letzten 5 Matches (älteste links): grün = Sieg, türkis = obere Hälfte, gelb = untere Hälfte, rot = Letzter.</dd>
      </dl>
    </Modal>
  );
}
