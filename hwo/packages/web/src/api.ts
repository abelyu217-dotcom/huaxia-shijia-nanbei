/**
 * HWO Web API 客户端——对接后端 REST 端点。
 *
 * 所有方法返回强类型 Promise；非 2xx 抛 Error。
 * 需要鉴权的请求自动附加 `Authorization: Bearer <token>`。
 * Token 持久化到 localStorage；提供 token 管理工具函数。
 */

import type {
  AiDifficulty,
  AiRefreshResult,
  AiTrainResult,
  AuthResult,
  AdvanceResult,
  CounterTacticResult,
  LineupView,
  ScheduleDay,
  SeasonInfo,
  SimMatchRequest,
  SimOutput,
  StandingRow,
  TacticPreset,
  TeamDetail,
  TeamTactic,
  TeamRoster,
  TradeOffer,
  UserInfo,
} from "./types";

// ── Token 管理 ──

const TOKEN_KEY = "hwo_access_token";

/** 读取当前 token（可能在 localStorage 或内存中） */
export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // SSR / 无存储环境
    return null;
  }
}

export function setAccessToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

// ── 通用 fetch 封装 ──

/** GET 请求；可选是否携带鉴权 header（默认遵循 token 是否存在） */
async function getJson<T>(url: string, opts: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.auth !== false) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw await httpError(url, res);
  return (await res.json()) as T;
}

/** POST/PUT 请求；body 为对象；可选鉴权（默认遵循 token） */
async function sendJson<T>(
  method: "POST" | "PUT",
  url: string,
  body: unknown,
  opts: { auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await httpError(`${method} ${url}`, res);
  return (await res.json()) as T;
}

async function httpError(label: string, res: Response): Promise<Error> {
  let detail = "";
  try {
    const data = await res.json();
    detail = data?.message ?? data?.error ?? JSON.stringify(data);
  } catch {
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
  }
  const err = new Error(`${label} → HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  (err as Error & { status?: number }).status = res.status;
  return err;
}

// ── 认证 ──

/** POST /api/auth/register — 注册新用户并返回 token */
export function postRegister(
  email: string,
  password: string,
  nickname: string,
): Promise<AuthResult> {
  return sendJson<AuthResult>(
    "POST",
    "/api/auth/register",
    { email, password, nickname },
    { auth: false },
  );
}

/** POST /api/auth/login — 登录返回 token */
export function postLogin(email: string, password: string): Promise<AuthResult> {
  return sendJson<AuthResult>(
    "POST",
    "/api/auth/login",
    { email, password },
    { auth: false },
  );
}

/** GET /api/auth/me — 当前用户信息（需 JWT） */
export function fetchMe(): Promise<UserInfo> {
  return getJson<UserInfo>("/api/auth/me");
}

// ── 球队 ──

/** GET /api/teams — 全部 6 支球队阵容概览。 */
export function fetchTeams(): Promise<TeamRoster[]> {
  return getJson<TeamRoster[]>("/api/teams");
}

/** GET /api/teams/:id — 球队详情（球员详细能力值 + ovr）。 */
export function fetchTeam(id: string): Promise<TeamDetail> {
  return getJson<TeamDetail>(`/api/teams/${encodeURIComponent(id)}`);
}

/** GET /api/teams/:id/lineup — 球队阵容配置 */
export function fetchLineup(teamId: string): Promise<LineupView> {
  return getJson<LineupView>(`/api/teams/${encodeURIComponent(teamId)}/lineup`);
}

/** PUT /api/teams/:id/lineup — 更新球队阵容（首发 + 出场时间） */
export function putLineup(
  teamId: string,
  payload: { starters: string[]; minutes: Record<string, number> },
): Promise<LineupView> {
  return sendJson<LineupView>(
    "PUT",
    `/api/teams/${encodeURIComponent(teamId)}/lineup`,
    payload,
  );
}

// ── 战术 ──

/** GET /api/tactics — 20 个战术预设。 */
export function fetchTactics(): Promise<TacticPreset[]> {
  return getJson<TacticPreset[]>("/api/tactics");
}

// ── 比赛模拟 ──

/** POST /api/sim/match — 模拟一场比赛，返回完整 SimOutput。 */
export function postSimMatch(req: SimMatchRequest): Promise<SimOutput> {
  return sendJson<SimOutput>("POST", "/api/sim/match", req);
}

// ── 赛季 / 赛程 ──

/** GET /api/season — 当前赛季信息 */
export function fetchCurrentSeason(): Promise<SeasonInfo> {
  return getJson<SeasonInfo>("/api/season");
}

/** GET /api/season/standings — 当前积分榜 */
export function fetchStandings(): Promise<StandingRow[]> {
  return getJson<StandingRow[]>("/api/season/standings");
}

/** GET /api/season/schedule — 当前赛季赛程（按日分组） */
export function fetchSchedule(): Promise<ScheduleDay[]> {
  return getJson<ScheduleDay[]>("/api/season/schedule");
}

/** POST /api/season/advance — 推进一日，结算当日所有比赛（需 JWT） */
export function postAdvanceDay(): Promise<AdvanceResult> {
  return sendJson<AdvanceResult>("POST", "/api/season/advance", {});
}

/** POST /api/season/generate — 为当前赛季生成赛程（需 JWT） */
export function postGenerateSchedule(): Promise<{ generated: number }> {
  return sendJson<{ generated: number }>("POST", "/api/season/generate", {});
}

// ── AI 经理 ──

/** POST /api/ai/refresh — 手动刷新 AI 球队阵容 + 战术（需 JWT） */
export function postAiRefresh(
  difficulty: AiDifficulty = "normal",
  teamId?: string,
): Promise<AiRefreshResult> {
  const url = `/api/ai/refresh?difficulty=${encodeURIComponent(difficulty)}`;
  return sendJson<AiRefreshResult>("POST", url, teamId ? { teamId } : {});
}

/** POST /api/ai/train — 手动触发 AI 球队训练（需 JWT） */
export function postAiTrain(): Promise<AiTrainResult> {
  return sendJson<AiTrainResult>("POST", "/api/ai/train", {});
}

// ── 球队战术 ──

/** GET /api/tactics/presets — 全部战术预设（含参数详情） */
export function fetchTacticPresets(): Promise<TacticPreset[]> {
  return getJson<TacticPreset[]>("/api/tactics/presets");
}

/** GET /api/tactics/team/:teamId — 获取球队当前战术 */
export function fetchTeamTactic(teamId: string): Promise<TeamTactic> {
  return getJson<TeamTactic>(`/api/tactics/team/${encodeURIComponent(teamId)}`);
}

/** PUT /api/tactics/team/:teamId — 更新球队战术（切换预设或微调参数） */
export function putTeamTactic(
  teamId: string,
  payload: { presetId?: string; modSet?: Record<string, unknown> },
): Promise<TeamTactic> {
  return sendJson<TeamTactic>(
    "PUT",
    `/api/tactics/team/${encodeURIComponent(teamId)}`,
    payload,
  );
}

/** GET /api/tactics/counter/:presetId — 反制策略推荐 */
export function fetchCounterTactic(presetId: string): Promise<CounterTacticResult> {
  return getJson<CounterTacticResult>(
    `/api/tactics/counter/${encodeURIComponent(presetId)}`,
  );
}

// ── 交易系统 ──

/** POST /api/trades — 发起交易报价 */
export function postTradeOffer(payload: {
  offerorTeamId: string;
  offereeTeamId: string;
  offerorPlayers: string[];
  offereePlayers: string[];
  offerorCash?: number;
  offereeCash?: number;
}): Promise<TradeOffer> {
  return sendJson<TradeOffer>("POST", "/api/trades", payload);
}

/** GET /api/trades/sent/:teamId — 我发出的交易报价 */
export function fetchSentTrades(teamId: string): Promise<TradeOffer[]> {
  return getJson<TradeOffer[]>(`/api/trades/sent/${encodeURIComponent(teamId)}`);
}

/** GET /api/trades/received/:teamId — 我收到的交易报价 */
export function fetchReceivedTrades(teamId: string): Promise<TradeOffer[]> {
  return getJson<TradeOffer[]>(
    `/api/trades/received/${encodeURIComponent(teamId)}`,
  );
}

/** POST /api/trades/:id/accept — 接受报价 */
export function postAcceptTrade(tradeId: string): Promise<TradeOffer> {
  return sendJson<TradeOffer>(
    "POST",
    `/api/trades/${encodeURIComponent(tradeId)}/accept`,
    {},
  );
}

/** POST /api/trades/:id/reject — 拒绝报价 */
export function postRejectTrade(tradeId: string): Promise<TradeOffer> {
  return sendJson<TradeOffer>(
    "POST",
    `/api/trades/${encodeURIComponent(tradeId)}/reject`,
    {},
  );
}

/** POST /api/trades/:id/counter — 还价 */
export function postCounterTrade(
  tradeId: string,
  payload: {
    offerorPlayers: string[];
    offereePlayers: string[];
    offerorCash?: number;
    offereeCash?: number;
  },
): Promise<TradeOffer> {
  return sendJson<TradeOffer>(
    "POST",
    `/api/trades/${encodeURIComponent(tradeId)}/counter`,
    payload,
  );
}

/** POST /api/trades/:id/ai-decide — 触发 AI 决策 */
export function postAiDecideTrade(tradeId: string): Promise<TradeOffer> {
  return sendJson<TradeOffer>(
    "POST",
    `/api/trades/${encodeURIComponent(tradeId)}/ai-decide`,
    {},
  );
}

// ── SSE 实时直播 ──

/**
 * 订阅 /api/matches/:id/stream 的 SSE 流。
 * 返回 EventSource；调用方负责 close()。
 * onMessage 解析后通过回调传出。
 */
export function subscribeMatchStream(
  matchId: string,
  onMessage: (data: unknown) => void,
  onError?: (err: Event) => void,
): EventSource {
  const url = `/api/matches/${encodeURIComponent(matchId)}/stream`;
  const es = new EventSource(url);
  es.onmessage = (ev) => {
    try {
      onMessage(JSON.parse(ev.data));
    } catch {
      onMessage(ev.data);
    }
  };
  if (onError) es.onerror = onError;
  return es;
}
