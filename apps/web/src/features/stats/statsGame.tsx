import { useSearchParams } from "react-router-dom";
import { getGame } from "@gamenight/shared";
import { useSelectedGame } from "../../lib/games";

/** Game of the statistics pages: the game chosen on the start page; ?game= (shared links) overrides it. */
export function useStatsGame(): string {
  const [params] = useSearchParams();
  const selected = useSelectedGame();
  const raw = params.get("game");
  return raw && getGame(raw) ? raw : selected;
}

/** Adds ?game= to a stats link, so the link shows the same game regardless of the viewer's start-page choice. */
export const withGame = (path: string, game: string) => `${path}?game=${encodeURIComponent(game)}`;

/** "Bestenliste · Scheisse" */
export const titleWithGame = (title: string, game: string) => `${title} · ${getGame(game)?.name ?? game}`;
