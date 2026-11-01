import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { IoAdd, IoPersonAdd } from "react-icons/io5";
import {
  DECK_SIZES,
  maxAllowedCards,
  peakCards,
  totalRounds,
  type DeckSize,
  type MatchPlayer,
  type PlayerSearchResultDto,
  type UserDto,
  userLabel,
} from "@scheisse/shared";
import { apiGet, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useLocalHistory } from "../../lib/localHistory";
import { Button, IconButton, NumberInput, PageHeader, Segmented, Spinner, TextInput, useToast } from "../../ui";
import { MAX_NAME_LENGTH, MAX_PLAYERS, useGameStore } from "./store";
import { SeatList } from "./SeatList";
import { LinkAccountDialog, findAccountByName } from "./LinkAccountDialog";
import styles from "./SetupPage.module.css";

type Tab = "known" | "search" | "guest";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SetupPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const draft = useGameStore((s) => s.setupDraft);
  const { addDraftPlayer, removeDraftPlayer, reorderDraft, setDraftDeck, setDraftMaxCards, startMatch } = useGameStore.getState();
  const known = useLocalHistory((s) => s.knownPlayers);

  const [tab, setTab] = useState<Tab>("known");
  const [guestName, setGuestName] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);
  const [accountHint, setAccountHint] = useState<UserDto | null>(null);
  const [checking, setChecking] = useState(false);
  const [linking, setLinking] = useState<MatchPlayer | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim(), 300);

  const n = draft.players.length;
  const allowed = maxAllowedCards(draft.deckSize, Math.max(n, 2));
  const rounds = totalRounds(peakCards({ deckSize: draft.deckSize, maxCards: draft.maxCards, playerCount: Math.max(n, 2) }));
  const full = n >= MAX_PLAYERS;

  const isAdded = (p: { name: string; userId: string | null }) =>
    draft.players.some((d) => d.name.toLowerCase() === p.name.toLowerCase() || (p.userId !== null && d.userId === p.userId));

  const add = (p: { name: string; userId: string | null }): boolean => {
    const err = addDraftPlayer(p);
    if (err) toast.show(err, { tone: "error" });
    return !err;
  };

  // Guest names must not equal an account name: offer the account instead.
  const submitGuest = async (e: FormEvent) => {
    e.preventDefault();
    setChecking(true);
    const account = await findAccountByName(guestName);
    setChecking(false);
    if (account) {
      setAccountHint(account);
      setGuestError(null);
      return;
    }
    const err = addDraftPlayer({ name: guestName, userId: null });
    setGuestError(err);
    if (!err) setGuestName("");
  };

  const useAccount = () => {
    if (!accountHint) return;
    if (add({ name: userLabel(accountHint), userId: accountHint.id })) {
      setGuestName("");
      setAccountHint(null);
    }
  };

  // "Bekannte": a guest whose name matches an account is shown as that account (merged, no duplicates).
  const knownList = (() => {
    const accounts = new Map<string, { name: string; userId: string | null }>();
    for (const k of known) if (k.userId) accounts.set(k.name.toLowerCase(), k);
    if (user) accounts.set(userLabel(user).toLowerCase(), { name: userLabel(user), userId: user.id });
    const seen = new Set<string>();
    const out: Array<{ name: string; userId: string | null }> = [];
    for (const k of known) {
      const e = k.userId ? k : (accounts.get(k.name.toLowerCase()) ?? k);
      const key = e.userId ?? `g:${e.name.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(e);
      }
    }
    return out;
  })();

  const users = useQuery({
    queryKey: ["players", debouncedSearch],
    queryFn: ({ signal }) => apiGet<PlayerSearchResultDto[]>(`/players?search=${encodeURIComponent(debouncedSearch)}`, { signal }),
    enabled: tab === "search" && debouncedSearch.length > 0,
  });

  const start = () => {
    const err = startMatch();
    if (err) toast.show(err, { tone: "error" });
    else navigate("/game");
  };

  const candidateRow = (key: string, label: string, p: { name: string; userId: string | null }) => (
    <li key={key} className={styles.candidate}>
      <span className={styles.candName}>{label}</span>
      <span className={p.userId ? styles.kindUser : styles.kind}>{p.userId ? "Konto" : "Gast"}</span>
      <IconButton label={`${label} hinzufügen`} tone="solid" size="sm" disabled={isAdded(p) || full} onClick={() => add(p)}>
        <IoAdd />
      </IconButton>
    </li>
  );

  return (
    <>
      <PageHeader title="Neues Spiel" back="/" />
      <main className={styles.page}>
        <div className={styles.cols}>
          <section className={styles.panel} aria-labelledby="add-title">
            <h2 id="add-title" className={styles.h2}>
              Spieler hinzufügen
            </h2>
            {user && (
              <Button
                variant="secondary"
                block
                disabled={isAdded({ name: userLabel(user), userId: user.id }) || full}
                onClick={() => add({ name: userLabel(user), userId: user.id })}
              >
                <IoPersonAdd aria-hidden="true" /> Mich hinzufügen ({userLabel(user)})
              </Button>
            )}
            <Segmented
              ariaLabel="Spielerquelle"
              variant="chips"
              full
              value={tab}
              onChange={setTab}
              options={[
                { value: "known", label: "Bekannte" },
                { value: "search", label: "Suchen" },
                { value: "guest", label: "Neu (Gast)" },
              ]}
            />

            {tab === "known" &&
              (knownList.length === 0 ? (
                <p className={styles.hint}>Noch keine bekannten Spieler. Spieler aus beendeten Spielen erscheinen hier.</p>
              ) : (
                <ul className={styles.candidates}>
                  {knownList.map((p) => candidateRow(`${p.userId ?? "g"}-${p.name}`, p.name, p))}
                </ul>
              ))}

            {tab === "search" && (
              <div className={styles.searchBox}>
                <TextInput
                  label="Spieler suchen"
                  hideLabel
                  placeholder="Konto oder Gast suchen …"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoComplete="off"
                />
                {debouncedSearch.length === 0 ? (
                  <p className={styles.hint}>Suche nach Konten und Gästen aus früheren Spielen.</p>
                ) : users.isPending ? (
                  <Spinner centered />
                ) : users.isError ? (
                  <p className={styles.errorText} role="alert">
                    {errorMessage(users.error)}
                  </p>
                ) : users.data.length === 0 ? (
                  <p className={styles.hint}>Kein Spieler gefunden.</p>
                ) : (
                  <ul className={styles.candidates}>
                    {users.data.map((u) => candidateRow(u.userId ?? `g:${u.name.toLowerCase()}`, u.name, { name: u.name, userId: u.userId }))}
                  </ul>
                )}
              </div>
            )}

            {tab === "guest" && (
              <form className={styles.guestForm} onSubmit={submitGuest}>
                <TextInput
                  label="Name des Gasts"
                  hideLabel
                  placeholder="Name eingeben …"
                  value={guestName}
                  maxLength={MAX_NAME_LENGTH}
                  error={guestError}
                  onChange={(e) => {
                    setGuestName(e.target.value);
                    setGuestError(null);
                    setAccountHint(null);
                  }}
                  autoComplete="off"
                />
                <IconButton label="Gast hinzufügen" type="submit" tone="solid" disabled={!guestName.trim() || full || checking}>
                  <IoAdd />
                </IconButton>
              </form>
            )}
            {tab === "guest" && accountHint && (
              <div className={styles.accountHint} role="alert">
                <span>Für „{accountHint.username}“ gibt es ein Konto – das Konto wird verwendet.</span>
                <Button size="sm" onClick={useAccount} disabled={full}>
                  Konto hinzufügen
                </Button>
              </div>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="seats-title">
            <h2 id="seats-title" className={styles.h2}>
              Sitzordnung <span className={styles.count}>{n} / {MAX_PLAYERS}</span>
            </h2>
            {n === 0 ? (
              <p className={styles.hint}>Füge mindestens zwei Spieler hinzu. Die Reihenfolge ist die Sitzordnung, der erste Spieler gibt zuerst.</p>
            ) : (
              <div className={styles.seatScroll}>
                <SeatList players={draft.players} onReorder={reorderDraft} onRemove={removeDraftPlayer} onLink={setLinking} />
              </div>
            )}
          </section>
        </div>

        <section className={styles.options} aria-label="Spieloptionen">
          <div className={styles.option}>
            <span className={styles.optLabel}>Kartendeck</span>
            <Segmented
              ariaLabel="Deckgröße"
              value={draft.deckSize}
              onChange={(v: DeckSize) => setDraftDeck(v)}
              options={DECK_SIZES.map((d) => ({ value: d, label: String(d) }))}
            />
          </div>
          <div className={styles.option}>
            <span className={styles.optLabel}>Max. Karten</span>
            <NumberInput
              label="Max. Karten"
              value={draft.maxCards}
              placeholder={String(allowed)}
              min={1}
              max={allowed}
              onChange={(v) => setDraftMaxCards(v)}
            />
          </div>
          <div className={styles.rounds} aria-live="polite">
            <strong>{rounds}</strong> Runden
          </div>
        </section>

        <div className={styles.startWrap}>
          <button type="button" className={styles.start} disabled={n < 2} onClick={start}>
            Spiel starten
          </button>
          {n < 2 && <p className={styles.hint}>Mindestens 2 Spieler nötig.</p>}
        </div>
      </main>
      <LinkAccountDialog
        player={linking}
        onClose={() => setLinking(null)}
        onLink={(p, acc) => useGameStore.getState().linkDraftPlayer(p.id, acc)}
        onUnlink={(p, name) => useGameStore.getState().linkDraftPlayer(p.id, null, name)}
      />
    </>
  );
}
