import { RouterProvider, ScrollRestoration, createBrowserRouter, useLocation, useOutlet, type RouteObject } from "react-router-dom";
import { PageTransition } from "./ui";
import { PwaStatus } from "./components/PwaStatus";
import { NotFound } from "./components/NotFound";
import { authRoutes } from "./features/auth/routes";
import { gameRoutes } from "./features/game/routes";
import { GameSelect, Home } from "./features/home/Home";
import { rulesetRoutes } from "./features/rulesets/routes";
import { statsRoutes } from "./features/stats/routes";
import { watchRoutes } from "./features/watch/routes";

function Layout() {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <>
      <PwaStatus />
      {/* Enter-only transition: an exit phase (AnimatePresence mode="wait") could hang when a nested
          AnimatePresence (Dropdown/Modal) was still exiting, leaving the old page at opacity 0. */}
      <PageTransition key={location.pathname}>{outlet}</PageTransition>
      <ScrollRestoration />
    </>
  );
}

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <GameSelect /> },
      { path: "menu", element: <Home /> },
      ...authRoutes,
      ...gameRoutes,
      ...watchRoutes,
      ...statsRoutes,
      ...rulesetRoutes,
      { path: "*", element: <NotFound /> },
    ],
  },
];

const router = createBrowserRouter(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
