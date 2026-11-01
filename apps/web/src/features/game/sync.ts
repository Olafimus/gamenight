import {
  createMatchSchema,
  deriveMatch,
  matchResults,
  type CreateMatchResponse,
  type MatchDto,
  type MatchState,
} from "@gamenight/shared";
import { ApiRequestError, apiPost, apiPut } from "../../lib/api";
import { useLocalHistory, type LocalMatchRecord } from "../../lib/localHistory";
import { useGameStore } from "./store";

const DEBOUNCE_MS = 300;
const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

/** Adds/updates (or removes, after an undo) the finished match in the local device history. */
function errorCode(err: ApiRequestError): string | undefined {
  const b = err.body as { error?: { code?: string }; code?: string } | undefined;
  return err.code ?? b?.error?.code ?? b?.code;
}

export function syncLocalHistory(): void {
  const s = useGameStore.getState();
  if (!s.state) return;
  const id = s.matchId ?? s.localId;
  if (!id) return;
  const history = useLocalHistory.getState();
  // A record may exist under the other id (local id before the server knew the match).
  const ids = [s.matchId, s.localId].filter((x): x is string => !!x);
  if (!deriveMatch(s.state).finished) {
    if (history.playedMatches.some((m) => ids.includes(m.matchId))) {
      useLocalHistory.setState({ playedMatches: history.playedMatches.filter((m) => !ids.includes(m.matchId)) });
    }
    return;
  }
  const results = matchResults(id, s.state);
  const existing = history.playedMatches.find((m) => ids.includes(m.matchId));
  const record: LocalMatchRecord = {
    matchId: id,
    gameId: s.state.gameId,
    code: s.code ?? "",
    startedAt: s.startedAt ?? new Date().toISOString(),
    finishedAt: existing?.finishedAt ?? new Date().toISOString(),
    players: results.map((r) => ({ name: r.name, userId: r.userId, finalScore: r.finalScore, placement: r.placement })),
  };
  if (existing && existing.matchId !== id) {
    useLocalHistory.setState({ playedMatches: history.playedMatches.filter((m) => m.matchId !== existing.matchId) });
  }
  useLocalHistory.getState().addPlayedMatch(record);
  for (const p of s.state.setup.players) useLocalHistory.getState().addKnownPlayer({ name: p.name, userId: p.userId });
}

let timer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;
let again = false;
let backoff = MIN_BACKOFF_MS;
let started = false;

function schedule(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void push();
  }, ms);
}

/** One sync attempt: create (POST) or update (PUT) the server copy of the running match. */
export async function push(): Promise<void> {
  const store = useGameStore;
  if (inflight) {
    again = true;
    return;
  }
  const s0 = store.getState();
  if (!s0.state || !s0.dirty) return;
  inflight = true;
  const sent: MatchState = s0.state;
  const sentLocalId = s0.localId;
  store.getState().patchSync({ syncStatus: "syncing", syncError: null });
  let retryIn: number | null = null;
  try {
    let match: MatchDto;
    if (!s0.matchId || !s0.writeToken) {
      const body = createMatchSchema.parse({ state: sent });
      const res = await apiPost<CreateMatchResponse>("/matches", body);
      match = res.match;
      // The user may have started another match / ended the game meanwhile: drop this response.
      if (store.getState().localId !== sentLocalId) {
        retryIn = store.getState().dirty ? 0 : null;
        return;
      }
      store.getState().patchSync({ matchId: match.id, code: match.code, writeToken: res.writeToken });
    } else {
      match = await apiPut<MatchDto>(
        `/matches/${s0.matchId}`,
        { state: sent, version: s0.version },
        { headers: { "X-Write-Token": s0.writeToken } },
      );
      if (store.getState().localId !== sentLocalId) {
        retryIn = store.getState().dirty ? 0 : null;
        return;
      }
    }
    const now = store.getState();
    const stillSame = now.state === sent;
    now.patchSync({ version: match.version, dirty: !stillSame, syncStatus: stillSame ? "synced" : "syncing" });
    backoff = MIN_BACKOFF_MS;
    if (!stillSame) retryIn = 0;
  } catch (err) {
    const now = store.getState();
    if (now.localId !== sentLocalId) {
      // error belongs to a match that is no longer current
      retryIn = now.dirty ? 0 : null;
    } else if (err instanceof ApiRequestError && err.status === 409) {
      // This device is the source of truth: adopt the server version and resend our state.
      const serverMatch = (err.body as { match?: MatchDto } | undefined)?.match;
      if (serverMatch) now.patchSync({ version: serverMatch.version });
      retryIn = 0;
    } else if (err instanceof ApiRequestError && errorCode(err) === "guest_name_taken") {
      // Permanent: a guest name equals an account name. Tell the user, do not retry until the state changes.
      now.patchSync({
        syncStatus: "offline",
        syncError: "Ein Gastname entspricht einem Konto. Bitte Spieler in den Einstellungen mit dem Konto verknüpfen oder umbenennen – bis dahin wird nicht synchronisiert.",
      });
      retryIn = null;
    } else if (err instanceof ApiRequestError && (err.status === 404 || err.status === 403)) {
      // Server copy is gone / token invalid: create a fresh one next time.
      now.patchSync({ matchId: null, writeToken: null, code: null, version: 1, syncStatus: "offline" });
      retryIn = backoff;
    } else {
      now.patchSync({ syncStatus: "offline" });
      retryIn = backoff;
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  } finally {
    inflight = false;
    try {
      syncLocalHistory();
    } catch {
      /* history is best effort */
    }
    if (again && retryIn === null) retryIn = 0;
    again = false;
    if (retryIn !== null) schedule(retryIn);
  }
}

/** Starts the (idempotent) store -> server synchronisation. Returns a stop function (used in tests). */
export function startSync(): () => void {
  if (started) return () => undefined;
  started = true;
  const unsub = useGameStore.subscribe((s, prev) => {
    if (!s.state) {
      if (timer) clearTimeout(timer);
      timer = null;
      return;
    }
    if (s.state !== prev.state) {
      try {
        syncLocalHistory();
      } catch {
        /* history is best effort */
      }
    }
    if (s.dirty && (s.state !== prev.state || !prev.dirty)) {
      schedule(deriveMatch(s.state).finished ? 0 : DEBOUNCE_MS);
    }
  });
  const onOnline = () => {
    if (useGameStore.getState().dirty) schedule(0);
  };
  window.addEventListener("online", onOnline);
  if (useGameStore.getState().dirty) schedule(0);
  return () => {
    unsub();
    window.removeEventListener("online", onOnline);
    if (timer) clearTimeout(timer);
    timer = null;
    started = false;
    inflight = false;
    again = false;
    backoff = MIN_BACKOFF_MS;
  };
}

/** Tries to push pending changes before leaving a match (bounded wait, never throws). */
export async function flushSync(timeoutMs = 2500): Promise<void> {
  try {
    syncLocalHistory();
    if (!useGameStore.getState().dirty) return;
    await Promise.race([push(), new Promise<void>((r) => setTimeout(r, timeoutMs))]);
  } catch {
    /* best effort */
  }
}
