import type { RouteObject } from "react-router-dom";
import { StatsOverview } from "./StatsOverview";
import { Leaderboard } from "./Leaderboard";
import { PlayerProfile } from "./PlayerProfile";
import { MatchesStats } from "./MatchesStats";
import { LocalStats } from "./LocalStats";

export const statsRoutes: RouteObject[] = [
  { path: "stats", element: <StatsOverview /> },
  { path: "stats/players", element: <Leaderboard /> },
  { path: "stats/players/:id", element: <PlayerProfile /> },
  { path: "stats/guests/:name", element: <PlayerProfile /> },
  { path: "stats/matches", element: <MatchesStats /> },
  { path: "stats/local", element: <LocalStats /> },
];
