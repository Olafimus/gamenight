import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ChangePasswordRequest, Credentials, RegisterRequest, UpdateProfileRequest, UserDto } from "@scheisse/shared";
import { ApiRequestError, apiGet, apiPatch, apiPost } from "./api";

export interface AuthContextValue {
  /** Logged-in user, or null (guest / not yet loaded). */
  user: UserDto | null;
  /** True until the initial /api/auth/me check finished. */
  loading: boolean;
  /** Throws ApiRequestError on failure. */
  login: (credentials: Credentials) => Promise<UserDto>;
  /** 409 username_guest_taken (body.guestName) unless `claimGuest` is set. */
  register: (request: RegisterRequest) => Promise<UserDto>;
  logout: () => Promise<void>;
  updateProfile: (patch: UpdateProfileRequest) => Promise<UserDto>;
  changePassword: (req: ChangePasswordRequest) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    apiGet<UserDto>("/auth/me", { signal: ctrl.signal })
      .then(setUser)
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setUser(null); // 401 or offline: continue as guest
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  const login = useCallback(async (credentials: Credentials) => {
    const u = await apiPost<UserDto>("/auth/login", credentials);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (request: RegisterRequest) => {
    const u = await apiPost<UserDto>("/auth/register", request);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost("/auth/logout");
    } catch (err) {
      if (!(err instanceof ApiRequestError) || err.status !== 401) throw err;
    }
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (patch: UpdateProfileRequest) => {
    const u = await apiPatch<UserDto>("/auth/me", patch);
    setUser(u);
    return u;
  }, []);

  const changePassword = useCallback(async (req: ChangePasswordRequest) => {
    await apiPost("/auth/password", req);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, updateProfile, changePassword }),
    [user, loading, login, register, logout, updateProfile, changePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth muss innerhalb von <AuthProvider> verwendet werden");
  return ctx;
}
