import type { RouteObject } from "react-router-dom";
import { CeremonyPage } from "./CeremonyPage";
import { PlayPage } from "./PlayPage";
import { TrickScoreboardPage } from "./ScoreboardPage";
import { SetupPage } from "./SetupPage";
import { SheetPlayPage } from "./sheet/SheetPlayPage";
import { SheetScoreboardPage, SheetStatsPage } from "./sheet/SheetPages";
import { TrickStatsPage } from "./StatsPage";
import { GameLayout } from "./shared";
import { useGameStore } from "./store";

/** Picks the page of the running game's kind (trick-bidding or score-sheet). */
function byKind(trick: () => JSX.Element | null, sheet: () => JSX.Element | null) {
  return function KindPage() {
    const kind = useGameStore((s) => s.state?.kind);
    const Page = kind === "score-sheet" ? sheet : trick;
    return <Page />;
  };
}

const RunningPage = byKind(PlayPage, SheetPlayPage);
const ScoreboardPage = byKind(TrickScoreboardPage, SheetScoreboardPage);
const StatsPage = byKind(TrickStatsPage, SheetStatsPage);

/** /game shows the setup without a running match and the live game with one. */
function GamePage() {
  const running = useGameStore((s) => s.state !== null);
  return running ? <RunningPage /> : <SetupPage />;
}

export const gameRoutes: RouteObject[] = [
  {
    element: <GameLayout />,
    children: [
      { path: "game", element: <GamePage /> },
      { path: "game/scoreboard", element: <ScoreboardPage /> },
      { path: "game/ceremony", element: <CeremonyPage /> },
      { path: "game/stats", element: <StatsPage /> },
    ],
  },
];
