import type { RouteObject } from "react-router-dom";
import { CeremonyPage } from "./CeremonyPage";
import { PlayPage } from "./PlayPage";
import { ScoreboardPage } from "./ScoreboardPage";
import { SetupPage } from "./SetupPage";
import { StatsPage } from "./StatsPage";
import { GameLayout } from "./shared";
import { useGameStore } from "./store";

/** /game shows the setup without a running match and the live game with one. */
function GamePage() {
  const running = useGameStore((s) => s.state !== null);
  return running ? <PlayPage /> : <SetupPage />;
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
