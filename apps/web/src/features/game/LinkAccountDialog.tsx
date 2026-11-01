import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { userLabel, type MatchPlayer, type UserDto } from "@scheisse/shared";
import { apiGet, errorMessage } from "../../lib/api";
import { Button, Modal, Spinner, TextInput } from "../../ui";
import { MAX_NAME_LENGTH, type AccountRef } from "./store";
import styles from "./LinkAccountDialog.module.css";

/** Looks up an account whose username equals `name` (case-insensitive, trimmed). Returns null if none / on error. */
export async function findAccountByName(name: string): Promise<UserDto | null> {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  try {
    const list = await apiGet<UserDto[]>(`/users?search=${encodeURIComponent(n)}`);
    return list.find((u) => u.username.trim().toLowerCase() === n) ?? null;
  } catch {
    return null;
  }
}

interface Props {
  player: MatchPlayer | null;
  onClose: () => void;
  /** Returns an error message (German) or null on success. */
  onLink: (player: MatchPlayer, account: AccountRef) => string | null;
  onUnlink: (player: MatchPlayer, guestName: string) => string | null;
}

/** Link a guest seat to an account (search) or turn an account seat back into a guest (needs a free guest name). */
export function LinkAccountDialog({ player, onClose, onLink, onUnlink }: Props) {
  const linked = !!player?.userId;
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [guestName, setGuestName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSearch(player && !player.userId ? player.name : "");
    setGuestName("");
    setError(null);
  }, [player]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const users = useQuery({
    queryKey: ["users", debounced],
    queryFn: ({ signal }) => apiGet<UserDto[]>(`/users?search=${encodeURIComponent(debounced)}`, { signal }),
    enabled: !!player && !linked && debounced.length > 0,
  });

  const pick = (u: UserDto) => {
    if (!player) return;
    const err = onLink(player, { id: u.id, username: u.username, displayName: u.displayName });
    if (err) setError(err);
    else onClose();
  };

  const unlink = async () => {
    if (!player) return;
    setBusy(true);
    const taken = await findAccountByName(guestName);
    setBusy(false);
    if (taken) {
      setError(`Der Name „${taken.username}“ gehört zu einem Konto. Bitte einen anderen Gastnamen wählen.`);
      return;
    }
    const err = onUnlink(player, guestName);
    if (err) setError(err);
    else onClose();
  };

  return (
    <Modal
      open={!!player}
      onClose={onClose}
      title={linked ? "Verknüpfung lösen" : "Mit Konto verknüpfen"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          {linked && (
            <Button onClick={unlink} loading={busy} disabled={!guestName.trim()}>
              Als Gast fortfahren
            </Button>
          )}
        </>
      }
    >
      {player && !linked && (
        <div className={styles.body}>
          <p className={styles.lead}>
            Konto für den Gast <strong>{player.name}</strong> suchen:
          </p>
          <TextInput label="Konto suchen" hideLabel placeholder="Benutzername suchen …" value={search} onChange={(e) => { setSearch(e.target.value); setError(null); }} autoComplete="off" data-autofocus />
          {debounced.length === 0 ? null : users.isPending ? (
            <Spinner centered />
          ) : users.isError ? (
            <p className={styles.error} role="alert">{errorMessage(users.error)}</p>
          ) : users.data.length === 0 ? (
            <p className={styles.hint}>Kein Konto gefunden.</p>
          ) : (
            <ul className={styles.list}>
              {users.data.map((u) => (
                <li key={u.id}>
                  <button type="button" className={styles.pick} onClick={() => pick(u)}>
                    <span>{userLabel(u)}{u.displayName && <small className={styles.hint}> @{u.username}</small>}</span>
                    <span className={styles.badge}>Konto</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      )}
      {player && linked && (
        <div className={styles.body}>
          <p className={styles.lead}>
            <strong>{player.name}</strong> wird wieder zum Gast. Gastnamen dürfen keinem Konto entsprechen – bitte einen neuen Namen wählen:
          </p>
          <TextInput label="Neuer Gastname" value={guestName} maxLength={MAX_NAME_LENGTH} onChange={(e) => { setGuestName(e.target.value); setError(null); }} autoComplete="off" data-autofocus />
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
