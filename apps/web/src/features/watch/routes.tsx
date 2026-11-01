import type { RouteObject } from "react-router-dom";
import { WatchLobby } from "./WatchLobby";
import { WatchMatch } from "./WatchMatch";

export const watchRoutes: RouteObject[] = [
  { path: "watch", element: <WatchLobby /> },
  { path: "watch/:code", element: <WatchMatch /> },
];
