import { PageHeader, Tile } from "../../ui";
import statistic from "../../assets/statistic.svg";
import cards from "../../assets/cards.svg";
import binoculars from "../../assets/binoculars2.png";
import styles from "./Stats.module.css";

export function StatsOverview() {
  return (
    <>
      <PageHeader title="Statistiken" back="/" />
      <main className={styles.page}>
        <nav className={styles.tiles} aria-label="Statistiken">
          <Tile to="/game/stats" title="Aktuelles Match" description="Auswertung des laufenden Spiels" image={cards} contain />
          <Tile to="/stats/players" title="Bestenliste" description="Elo, Siegquote und Kategorien" image={statistic} contain />
          <Tile to="/stats/matches" title="Matches" description="Alle Matches durchsuchen" image={binoculars} />
          <Tile to="/stats/local" title="Auf diesem Gerät" description="Dein lokaler Verlauf" image={statistic} contain />
        </nav>
      </main>
    </>
  );
}
