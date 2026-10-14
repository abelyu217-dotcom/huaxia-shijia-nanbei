/**
 * AuthContext — 全局认证状态
 *
 * 维护 currentUser 与 token 的加载/刷新/登出，子组件通过 useAuth 访问。
 * 启动时若 localStorage 有 token，则调用 /api/auth/me 恢复用户信息；
 * 401 时清空 token 视为未登录。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchMe,
  getAccessToken,
  postLogin,
  postRegister,
  setAccessToken,
} from "../api";
import type { UserInfo } from "../types";

interface AuthState {
  user: UserInfo | null;
  loading: boolean; // 启动恢复期
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    nickname: string,
  ) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  // 启动恢复：有 token 则拉取 /me
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setState({ user: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    fetchMe()
      .then((user) => {
        if (!cancelled) setState({ user, loading: false, error: null });
      })
      .catch(() => {
        // token 失效
        setAccessToken(null);
        if (!cancelled) setState({ user: null, loading: false, error: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await postLogin(email, password);
      setAccessToken(result.accessToken);
      setState({ user: result.user, loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ user: null, loading: false, error: msg });
      throw e;
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string, nickname: string) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const result = await postRegister(email, password, nickname);
        setAccessToken(result.accessToken);
        setState({ user: result.user, loading: false, error: null });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setState({ user: null, loading: false, error: msg });
        throw e;
      }
    },
    [],
  );

  const logout = useCallback(() => {
    setAccessToken(null);
    setState({ user: null, loading: false, error: null });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const user = await fetchMe();
      setState({ user, loading: false, error: null });
    } catch {
      setAccessToken(null);
      setState({ user: null, loading: false, error: null });
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout, refreshUser }),
    [state, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}
