/**
 * AuthPage — 登录 / 注册页
 *
 * 单页面切换两种模式：登录、注册。
 * 注册多一个昵称字段。表单提交后调用 AuthContext，成功后由父组件切换路由。
 */

import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";

type Mode = "login" | "register";

export function AuthPage() {
  const { login, register, error, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const displayedError = localError ?? error;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!email.trim() || !password.trim()) {
      setLocalError("邮箱和密码不能为空");
      return;
    }
    if (mode === "register" && !nickname.trim()) {
      setLocalError("昵称不能为空");
      return;
    }
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, nickname.trim());
      }
    } catch {
      // 错误已写入 AuthContext.error
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">HWO</span>
          <span className="brand-sub">Hoops World Online</span>
        </div>
        <h1 className="auth-title">
          {mode === "login" ? "登录你的球队" : "创建经理账号"}
        </h1>
        <p className="auth-pitch">
          {mode === "login"
            ? "登录后即可管理球队、推进赛程、观看比赛直播。"
            : "注册新账号，自动绑定一支球队，开启你的篮球经理生涯。"}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label className="auth-field">
              <span className="auth-label">昵称</span>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="例如：篮坛新秀"
                autoComplete="nickname"
                disabled={loading}
              />
            </label>
          )}
          <label className="auth-field">
            <span className="auth-label">邮箱</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={loading}
            />
          </label>
          <label className="auth-field">
            <span className="auth-label">密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              disabled={loading}
            />
          </label>

          {displayedError && (
            <div className="auth-error" role="alert">
              {displayedError}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" /> 处理中…
              </>
            ) : mode === "login" ? (
              "登录"
            ) : (
              "注册并开始"
            )}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "login" ? (
            <>
              还没有账号？
              <button
                type="button"
                className="auth-link"
                onClick={() => {
                  setMode("register");
                  setLocalError(null);
                }}
              >
                立即注册
              </button>
            </>
          ) : (
            <>
              已有账号？
              <button
                type="button"
                className="auth-link"
                onClick={() => {
                  setMode("login");
                  setLocalError(null);
                }}
              >
                返回登录
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
