import { Link } from "react-router-dom";
import type { GameDefinition, RulesetDto } from "@gamenight/shared";
import { Button, Dropdown, cx } from "../../ui";
import { MATERIAL_ICON } from "../../lib/games";
import styles from "./GamePicker.module.css";

/** Game tiles (start page): the chosen game applies to setup, statistics and rulesets. */
export function GameTiles({ games, gameId, onGame }: { games: GameDefinition[]; gameId: string; onGame: (id: string) => void }) {
  return (
    <div className={styles.games} role="radiogroup" aria-label="Spiel wählen">
      {games.map((g) => (
        <button
          key={g.id}
          type="button"
          role="radio"
          aria-checked={g.id === gameId}
          className={cx(styles.game, g.id === gameId && styles.gameOn)}
          onClick={() => onGame(g.id)}
        >
          <span className={styles.icon} aria-hidden="true">
            {MATERIAL_ICON[g.material]}
          </span>
          <span className={styles.gname}>{g.name}</span>
          <span className={styles.tagline}>{g.tagline}</span>
        </button>
      ))}
    </div>
  );
}

/** Selected game (chosen on the start page) + ruleset choice of that game. */
export function RulesetPicker({
  game,
  rulesets,
  ruleset,
  onRuleset,
}: {
  game: GameDefinition | undefined;
  rulesets: RulesetDto[];
  ruleset: RulesetDto | undefined;
  onRuleset: (r: RulesetDto) => void;
}) {
  const own = rulesets.filter((r) => !r.builtin);
  return (
    <section className={styles.wrap} aria-label="Spiel">
      <div className={styles.rules}>
        {game && (
          <span className={styles.current}>
            <span aria-hidden="true">{MATERIAL_ICON[game.material]}</span> {game.name}
          </span>
        )}
        <Link className={styles.switch} to="/">
          Spiel wechseln
        </Link>
        <span className={styles.label}>Regeln</span>
        <Dropdown
          align="left"
          trigger={({ triggerProps }) => (
            <Button variant="secondary" size="sm" {...triggerProps}>
              {ruleset?.name ?? "–"} ▾
            </Button>
          )}
          items={[
            ...rulesets
              .filter((r) => r.builtin)
              .map((r) => ({ key: r.id, label: r.name, selected: r.id === ruleset?.id, onSelect: () => onRuleset(r) })),
            ...own.map((r, i) => ({
              key: r.id,
              label: `${r.name} (eigene)`,
              selected: r.id === ruleset?.id,
              separatorBefore: i === 0,
              onSelect: () => onRuleset(r),
            })),
          ]}
        />
        {game && (
          <Link className={styles.manage} to={`/rulesets?game=${encodeURIComponent(game.id)}`}>
            Regelwerke verwalten
          </Link>
        )}
      </div>
      {ruleset?.description && <p className={styles.desc}>{ruleset.description}</p>}
    </section>
  );
}
