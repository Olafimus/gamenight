import { useEffect, useMemo } from "react";
import { Outlet } from "react-router-dom";
import { deriveMatch, type DerivedMatch, type MatchState } from "@scheisse/shared";
import { ButtonLink, EmptyState, PageHeader } from "../../ui";
import { useGameStore } from "./store";
import { startSync } from "./sync";
import { useWakeLock } from "./useWakeLock";

/** Wraps all /game routes; keeps the server synchronisation running. */
export function GameLayout() {
  useEffect(() => {
    startSync();
  }, []);
  const running = useGameStore((s) => s.state !== null);
  const keepAwake = useGameStore((s) => s.keepAwake);
  useWakeLock(running && keepAwake);
  return <Outlet />;
}

/** Running match + its derived view (null when no match is running). */
export function useRunningMatch(): { state: MatchState; match: DerivedMatch } | null {
  const state = useGameStore((s) => s.state);
  const match = useMemo(() => (state ? deriveMatch(state) : null), [state]);
  return state && match ? { state, match } : null;
}

/** Shown on /game/* sub pages when no match is running. */
export function NoMatch({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} back="/" />
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
        <EmptyState
          title="Kein laufendes Spiel"
          text="Starte zuerst ein neues Match."
          action={
            <ButtonLink to="/game" variant="primary">
              Zum Spiel
            </ButtonLink>
          }
        />
      </main>
    </>
  );
}
