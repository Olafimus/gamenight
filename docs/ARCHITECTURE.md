# Architektur & Zuständigkeiten

Monorepo (npm workspaces), Node 22, TypeScript strict überall.

```
packages/shared   @gamenight/shared   Spiele, Spieltypen, Regelwerke, Engines, zod-API-Vertrag, Statistik (TS-Quellen direkt exportiert, kein Build)
apps/server       @gamenight/server   Express + PostgreSQL (pg + drizzle-orm), Port 3001
apps/web          @gamenight/web      Vite + React 18, Port 5173, Proxy /api -> http://localhost:3001
docker-compose.yml                   Postgres 18 auf localhost:5433 (DBs: scheisse, scheisse_test)
```

## Verbindlicher Vertrag
- `packages/shared/src/match.ts`, `api.ts`, `kinds/*/{rules,types}.ts`, Signaturen in `kinds/*/engine.ts` / `stats.ts` – **nicht ändern** ohne Rücksprache mit dem Koordinator. Implementierungen dürfen ergänzt werden (Hilfsfunktionen intern, nicht exportiert).
- Specs: `docs/spec-games.md` (Datenmodell Spiele/Regelwerke), `docs/spec-game.md` (Scheisse), `docs/spec-stats.md`, `docs/spec-ui.md`.

## Server (`apps/server`)
- `src/index.ts` (listen), `src/app.ts` (`createApp(deps)` – für Supertest ohne listen), `src/db/schema.ts` (drizzle), `drizzle/` (generierte SQL-Migrationen), `src/db/migrate.ts`, `src/routes/{auth,users,matches,stats,rulesets}.ts`, `src/sse/hub.ts`, `src/jobs/cleanup.ts`, `src/env.ts`.
- Tabellen:
  - `users(id uuid pk default gen_random_uuid(), username text, username_lower text unique, password_hash text, created_at timestamptz)`
  - `rulesets(id uuid pk, owner_user_id fk users cascade, game_id text, kind text, name text, description text, rules jsonb, created_at, updated_at)` – eigene Regelwerke
  - `matches(id uuid pk, code text unique, owner_user_id uuid null fk users, write_token_hash text, game_id text, ruleset_id text, state jsonb, finished boolean, started_at, finished_at null, updated_at, version int)`
  - `match_players(match_id fk cascade, player_id text, seat int, name text, user_id uuid null fk users; pk(match_id, player_id))` – bei jedem PUT neu geschrieben (für Suche nach Spielername)
  - `match_results(match_id fk cascade, player_id text, user_id uuid null, name text, final_score int, placement int, player_count int, rounds int, avg_score double, rating double; pk(match_id, player_id))`
- Passwörter: bcryptjs (cost 10). Session: JWT (jsonwebtoken, HS256, `JWT_SECRET`) im httpOnly-Cookie `session`, SameSite=Lax, 30 Tage.
- Write-Token: 32 Byte random (base64url), gespeichert als sha256-Hash, Vergleich timing-safe.
- Match-Code: 5 Zeichen aus `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, eindeutig (Retry bei Kollision).
- Jede schreibende Matchänderung: `deriveMatch(state)` muss erfolgreich sein und Spieler-`userId`s müssen existieren, sonst 400 `invalid_state`.
- SSE: In-Memory-Hub (ein Prozess reicht). Header `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, Ping alle 15 s.
- Cleanup-Job: alle 30 Min unfertige Matches mit `updated_at` älter 24 h löschen.
- Tests: vitest + supertest gegen `TEST_DATABASE_URL` (Migrationen vor den Tests, Tabellen zwischen Tests truncaten).
- Scripts: `dev` (tsx watch), `build` (tsc → dist), `start`, `test`, `typecheck`, `db:migrate`, `db:generate`.

## Web (`apps/web`)
```
src/main.tsx, src/App.tsx            Router (createBrowserRouter), QueryClientProvider, AuthProvider
src/styles/tokens.css, global.css    Tokens laut spec-ui.md
src/assets/                          Logo & Kachelbilder (aus docs/assets kopiert)
src/ui/                              Komponenten-Bibliothek (web-core)
src/lib/api.ts                       fetch-Wrapper: apiGet/apiPost/apiPut/apiDelete, wirft ApiRequestError{status,code,body}; credentials 'include'
src/lib/auth.tsx                     AuthProvider + useAuth() {user, login, register, logout, loading}
src/lib/useEventSource.ts            Hook für SSE mit Auto-Reconnect: useEventSource(url: string | null, {events: string[], onEvent(type, data), maxRetryMs?}) -> {status:'connecting'|'open'|'error'}
src/lib/localHistory.ts              zustand-persist Store "scheisse.history.v1": knownPlayers[{name,userId}], playedMatches[LocalMatchRecord]
src/components/Scoreboard.tsx        Scoreboard (read-only + optional Korrekturmodus über Props) – genutzt von game und watch
src/features/home, features/auth     web-core
src/features/game/**                 web-game  (Routen /game, /game/scoreboard, /game/ceremony, /game/stats)
src/features/watch/**, features/stats/**   web-watch-stats
```
- `LocalMatchRecord = { matchId: string; code: string; startedAt: string; finishedAt: string; players: { name: string; userId: string | null; finalScore: number; placement: number }[] }`
- Scoreboard-Props: `{ match: DerivedMatch; correctionMode?: boolean; onCellClick?: (roundIndex: number, playerId: string) => void }`
- Jede Feature-Datei `features/<x>/routes.tsx` exportiert `const <x>Routes: RouteObject[]`, die `App.tsx` einbindet. web-core legt Platzhalter an, die anderen Agents ersetzen nur Dateien in ihrem Ordner.
- Libraries: react-router-dom 6, @tanstack/react-query 5, zustand 5, @dnd-kit/core + @dnd-kit/sortable, nanoid, react-icons, sass (optional). Kein UI-Framework.
- Tests: vitest + @testing-library/react für den Game-Store / kritische Komponenten.
