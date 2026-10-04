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
  TacticUsageStat,
  TeamDetail,
  TeamTactic,
  TeamRoster,
  TradeOffer,
  UserInfo,
  PlayerCareer,
  TrainResult,
  Academy,
  AcademyUpgradeResult,
  DraftBoard,
  DraftInitResult,
  DraftAutoResult,
  DraftPickView,
  Contract,
  ContractStatus,
  SalaryStatus,
  WaiveResult,
  PlayerSeasonStats,
  TeamStatsSummary,
  FreeAgent,
  WorldInfo,
  ScoutReport,
  DauOverview,
  RetentionPoint,
  AnalyticsEvent,
  AuditScanResult,
  AuditReplayResult,
  SimConfigActive,
  SimConfigVersion,
  Facility,
  FacilityType,
  TrainingPlanView,
  TrainingLogEntry,
  DailyTrainingSummary,
  StaffView,
  StaffJob,
  BoardView,
  BoardDirectorView,
  BoardSponsorView,
  SeasonGoalView,
  BoardProposalView,
  PrOverviewView,
  TeamMessageView,
  MediaNewsView,
  LeagueAnnouncementView,
  FanCenterView,
  FanEventView,
  OperationsOverviewView,
  MarketOverviewView,
  TransferMarketPhaseView,
  FreeAgentPlayerView,
  FreeAgentStaffView,
  MarketSignResult,
  ScoutMissionView,
  TeamSearchResult,
  TeamSearchParams,
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

/** API 基础地址；可通过 VITE_API_BASE_URL 环境变量覆盖（生产部署指向 Cloud Run） */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/** GET 请求；可选是否携带鉴权 header（默认遵循 token 是否存在） */
async function getJson<T>(url: string, opts: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.auth !== false) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${url}`, { headers });
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
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await httpError(`${method} ${url}`, res);
  return (await res.json()) as T;
}

/** POST 便捷封装 */
async function postJson<T>(
  url: string,
  body: unknown,
  opts: { auth?: boolean } = {},
): Promise<T> {
  return sendJson<T>("POST", url, body, opts);
}

/** PUT 便捷封装 */
async function putJson<T>(
  url: string,
  body: unknown,
  opts: { auth?: boolean } = {},
): Promise<T> {
  return sendJson<T>("PUT", url, body, opts);
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

/** PUT /api/teams/:id/captain — 设置队长（#20） */
export function putTeamCaptain(
  teamId: string,
  playerId: string | null,
): Promise<{ captainId: string | null }> {
  return sendJson<{ captainId: string | null }>(
    "PUT",
    `/api/teams/${encodeURIComponent(teamId)}/captain`,
    { playerId },
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

/** GET /api/season/standings — 当前积分榜（可选按 leagueId 过滤） */
export function fetchStandings(leagueId?: string): Promise<StandingRow[]> {
  const q = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : "";
  return getJson<StandingRow[]>(`/api/season/standings${q}`);
}

/** GET /api/season/leagues — 当前赛季所有联赛列表（国内 L1/L2 + 国际） */
export function fetchLeagues(): Promise<
  Array<{ id: string; name: string; level: number; type: string; worldId: string | null }>
> {
  return getJson<
    Array<{ id: string; name: string; level: number; type: string; worldId: string | null }>
  >("/api/season/leagues");
}

/** GET /api/season/schedule — 当前赛季赛程（按日分组） */
export function fetchSchedule(): Promise<ScheduleDay[]> {
  return getJson<ScheduleDay[]>("/api/season/schedule");
}

/** 季后赛对阵树 */
export interface PlayoffMatchInfo {
  id: string;
  day: number;
  homeTeamId: string | null;
  homeTeamName: string;
  awayTeamId: string | null;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerId: string | null;
  status: string;
}

export interface PlayoffSeriesInfo {
  id: string;
  round: number;
  slot: number;
  bestOf: number;
  teamAId: string | null;
  teamAName: string;
  seedA: number | null;
  teamBId: string | null;
  teamBName: string;
  seedB: number | null;
  winsA: number;
  winsB: number;
  status: "pending" | "in_progress" | "completed";
  winnerId: string | null;
  matches: PlayoffMatchInfo[];
}

export interface PlayoffBracket {
  seasonId: string;
  leagueId: string;
  leagueName: string;
  totalRounds: number;
  series: PlayoffSeriesInfo[];
  championId: string | null;
  championName: string | null;
}

/** GET /api/season/playoff — 当前季后赛对阵树 */
export function fetchPlayoff(): Promise<PlayoffBracket | null> {
  return getJson<PlayoffBracket | null>("/api/season/playoff");
}

/** POST /api/season/advance — 推进一日，结算当日所有比赛（需 JWT） */
export function postAdvanceDay(): Promise<AdvanceResult> {
  return sendJson<AdvanceResult>("POST", "/api/season/advance", {});
}

/** v0.6 世界时钟状态 */
export interface WorldClockStatus {
  seasonId: string;
  currentDay: number;
  seasonName: string;
  seasonYear: number;
  seasonStatus: string;
  paused: boolean;
  speed: 1 | 2 | 4;
  intervalMs: number;
}

/** GET /api/season/world-clock — 世界时钟状态 */
export function fetchWorldClock(): Promise<WorldClockStatus> {
  return getJson<WorldClockStatus>("/api/season/world-clock");
}

/** POST /api/season/world-clock/pause?paused=true|false — 暂停/恢复 */
export function postWorldClockPause(paused: boolean): Promise<WorldClockStatus> {
  return sendJson<WorldClockStatus>(
    "POST",
    `/api/season/world-clock/pause?paused=${paused ? "true" : "false"}`,
    {},
  );
}

/** POST /api/season/world-clock/speed?speed=1|2|4 — 加速倍率 */
export function postWorldClockSpeed(speed: 1 | 2 | 4): Promise<WorldClockStatus> {
  return sendJson<WorldClockStatus>(
    "POST",
    `/api/season/world-clock/speed?speed=${speed}`,
    {},
  );
}

/** POST /api/season/generate — 为当前赛季生成赛程（需 JWT） */
export function postGenerateSchedule(): Promise<{ generated: number }> {
  return sendJson<{ generated: number }>("POST", "/api/season/generate", {});
}

// ── 世界（M2）──

/** GET /api/worlds — 列出所有世界（含球队列表，用于查找所在世界） */
export function fetchWorlds(): Promise<WorldInfo[]> {
  return getJson<WorldInfo[]>("/api/worlds");
}

/** GET /api/worlds/:id — 世界详情 */
export function fetchWorld(id: string): Promise<WorldInfo> {
  return getJson<WorldInfo>(`/api/worlds/${encodeURIComponent(id)}`);
}

/** POST /api/worlds — 创建新世界（需 JWT） */
export function createWorld(
  name: string,
  seed: number = 42,
  region?: string,
): Promise<WorldInfo> {
  return postJson<WorldInfo>("/api/worlds", { name, seed, region });
}

/** POST /api/worlds/:id/join — 加入世界（认领球队，需 JWT） */
export function joinWorld(
  worldId: string,
  userId: string,
  teamId: string,
): Promise<{ teamId: string }> {
  return postJson<{ teamId: string }>(`/api/worlds/${encodeURIComponent(worldId)}/join`, {
    userId,
    teamId,
  });
}

/** PUT /api/teams/:id — 修改球队资料（需 JWT） */
export function updateTeam(
  teamId: string,
  data: { name?: string; city?: string },
): Promise<{ ok: boolean }> {
  return putJson<{ ok: boolean }>(`/api/teams/${encodeURIComponent(teamId)}`, data);
}

/** PUT /api/teams/:id/players/:playerId — 修改球员姓名（需 JWT） */
export function updatePlayer(
  teamId: string,
  playerId: string,
  name: string,
): Promise<{ ok: boolean; name: string }> {
  return putJson<{ ok: boolean; name: string }>(
    `/api/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(playerId)}`,
    { name },
  );
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

/** GET /api/tactics/usage — 战术使用率统计（M4 #8） */
export function fetchTacticUsage(): Promise<TacticUsageStat[]> {
  return getJson<TacticUsageStat[]>("/api/tactics/usage");
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
 * @param speed 可选流速倍率（比赛秒/真实秒），默认 4；传 1 即 1:1 真实流速
 */
export function subscribeMatchStream(
  matchId: string,
  onMessage: (data: unknown) => void,
  onError?: (err: Event) => void,
  speed?: number,
): EventSource {
  const url = new URL(
    `/api/matches/${encodeURIComponent(matchId)}/stream`,
    API_BASE || window.location.origin,
  );
  if (speed != null) url.searchParams.set("speed", String(speed));
  const es = new EventSource(url.toString());
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

// ── M3: 球员生涯弧线 ──

/** GET /api/career/player/:playerId — 球员生涯信息 */
export function fetchPlayerCareer(playerId: string): Promise<PlayerCareer | null> {
  return getJson<PlayerCareer | null>(
    `/api/career/player/${encodeURIComponent(playerId)}`,
  );
}

/** GET /api/career/team/:teamId — 球队全部球员生涯信息 */
export function fetchTeamCareers(teamId: string): Promise<PlayerCareer[]> {
  return getJson<PlayerCareer[]>(
    `/api/career/team/${encodeURIComponent(teamId)}`,
  );
}

/** POST /api/career/train/:playerId — 手动训练球员 */
export function postTrainPlayer(
  playerId: string,
  drillType?: string,
): Promise<TrainResult | null> {
  return sendJson<TrainResult | null>(
    "POST",
    `/api/career/train/${encodeURIComponent(playerId)}`,
    drillType ? { drillType } : {},
  );
}

// ── M3: 青训学院 ──

/** GET /api/academy/:teamId — 获取青训学院 */
export function fetchAcademy(teamId: string): Promise<Academy> {
  return getJson<Academy>(`/api/academy/${encodeURIComponent(teamId)}`);
}

/** POST /api/academy/:teamId/upgrade — 升级学院 */
export function postUpgradeAcademy(teamId: string): Promise<AcademyUpgradeResult> {
  return sendJson<AcademyUpgradeResult>(
    "POST",
    `/api/academy/${encodeURIComponent(teamId)}/upgrade`,
    {},
  );
}

/** POST /api/academy/:teamId/invest — 投入资金 */
export function postInvestAcademy(
  teamId: string,
  amount: number,
): Promise<Academy> {
  return sendJson<Academy>(
    "POST",
    `/api/academy/${encodeURIComponent(teamId)}/invest`,
    { amount },
  );
}

/** POST /api/academy/:teamId/produce — 手动产出新秀（测试用） */
export function postProduceRookies(
  teamId: string,
): Promise<{ produced: Array<{ playerId: string; name: string; position: string; potential: number; ovr: number }> }> {
  return sendJson(
    "POST",
    `/api/academy/${encodeURIComponent(teamId)}/produce`,
    {},
  );
}

// ── M3: 选秀系统 ──

/** POST /api/draft/init — 初始化选秀大会（乐透抽签 + 生成选秀池） */
export function postInitDraft(
  seasonId: string,
  worldId: string,
): Promise<DraftInitResult> {
  return sendJson<DraftInitResult>("POST", "/api/draft/init", {
    seasonId,
    worldId,
  });
}

/** GET /api/draft/:seasonId/:worldId — 选秀看板 */
export function fetchDraftBoard(
  seasonId: string,
  worldId: string,
): Promise<DraftBoard> {
  return getJson<DraftBoard>(
    `/api/draft/${encodeURIComponent(seasonId)}/${encodeURIComponent(worldId)}`,
  );
}

/** POST /api/draft/:draftPickId/pick — 手动选人 */
export function postMakeDraftPick(
  draftPickId: string,
  playerId: string,
): Promise<{ success: true; pick: number; round: number; player: { id: string; name: string } }> {
  return sendJson(
    "POST",
    `/api/draft/${encodeURIComponent(draftPickId)}/pick`,
    { playerId },
  );
}

/** POST /api/draft/:seasonId/:worldId/auto — AI 自动选秀 */
export function postAutoDraft(
  seasonId: string,
  worldId: string,
): Promise<DraftAutoResult> {
  return sendJson<DraftAutoResult>(
    "POST",
    `/api/draft/${encodeURIComponent(seasonId)}/${encodeURIComponent(worldId)}/auto`,
    {},
  );
}

/** GET /api/draft/:seasonId/:worldId/results — 选秀结果 */
export function fetchDraftResults(
  seasonId: string,
  worldId: string,
): Promise<DraftPickView[]> {
  return getJson<DraftPickView[]>(
    `/api/draft/${encodeURIComponent(seasonId)}/${encodeURIComponent(worldId)}/results`,
  );
}

// ── M3: 签约与合同 ──

/** GET /api/contract/team/:teamId — 球队合同列表 */
export function fetchTeamContracts(
  teamId: string,
  status?: ContractStatus,
): Promise<Contract[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return getJson<Contract[]>(
    `/api/contract/team/${encodeURIComponent(teamId)}${q}`,
  );
}

/** GET /api/contract/team/:teamId/salary — 球队薪资状况 */
export function fetchTeamSalary(teamId: string): Promise<SalaryStatus> {
  return getJson<SalaryStatus>(
    `/api/contract/team/${encodeURIComponent(teamId)}/salary`,
  );
}

/** GET /api/contract/free-agents — 自由球员 */
export function fetchFreeAgents(worldId?: string): Promise<FreeAgent[]> {
  const q = worldId ? `?worldId=${encodeURIComponent(worldId)}` : "";
  return getJson<FreeAgent[]>(`/api/contract/free-agents${q}`);
}

/** POST /api/contract/sign — 签约 */
export function postSignContract(payload: {
  playerId: string;
  teamId: string;
  yearsTotal: number;
  salaryPerYear: number;
  playerOption?: boolean;
  teamOption?: boolean;
  noTrade?: boolean;
}): Promise<Contract> {
  return sendJson<Contract>("POST", "/api/contract/sign", payload);
}

/** POST /api/contract/free-agent/sign — 签约自由球员 */
export function postSignFreeAgent(payload: {
  playerId: string;
  teamId: string;
  yearsTotal: number;
  salaryPerYear: number;
  playerOption?: boolean;
  teamOption?: boolean;
  noTrade?: boolean;
}): Promise<Contract> {
  return sendJson<Contract>("POST", "/api/contract/free-agent/sign", payload);
}

/** POST /api/contract/:contractId/extend — 续约 */
export function postExtendContract(
  contractId: string,
  payload: {
    addYears: number;
    newSalaryPerYear: number;
    playerOption?: boolean;
    teamOption?: boolean;
    noTrade?: boolean;
  },
): Promise<Contract> {
  return sendJson<Contract>(
    "POST",
    `/api/contract/${encodeURIComponent(contractId)}/extend`,
    payload,
  );
}

/** POST /api/contract/:contractId/waive — 裁员（返回含买断成本） */
export function postWaivePlayer(contractId: string): Promise<WaiveResult> {
  return sendJson<WaiveResult>(
    "POST",
    `/api/contract/${encodeURIComponent(contractId)}/waive`,
    {},
  );
}

// ── M4: 球员赛季累计统计 ──

/** GET /api/stats/team/:teamId — 球队球员赛季累计技术统计 */
export function fetchTeamPlayerStats(teamId: string): Promise<PlayerSeasonStats[]> {
  return getJson<PlayerSeasonStats[]>(
    `/api/stats/team/${encodeURIComponent(teamId)}`,
  );
}

/** GET /api/stats/team/:teamId/summary — 球员列表 + 本队合计 + 对手合计 */
export function fetchTeamStatsSummary(teamId: string): Promise<TeamStatsSummary> {
  return getJson<TeamStatsSummary>(
    `/api/stats/team/${encodeURIComponent(teamId)}/summary`,
  );
}

// ── v0.6: 训练系统 ──

/** GET /api/training/:teamId/plan */
export function fetchTrainingPlan(teamId: string): Promise<TrainingPlanView> {
  return getJson<TrainingPlanView>(
    `/api/training/${encodeURIComponent(teamId)}/plan`,
  );
}

/** PUT /api/training/:teamId/plan */
export function putTrainingPlan(
  teamId: string,
  body: { focusByPosition?: Record<string, string>; teamFocus?: Record<string, number> },
): Promise<TrainingPlanView> {
  return putJson<TrainingPlanView>(
    `/api/training/${encodeURIComponent(teamId)}/plan`,
    body,
  );
}

/** GET /api/training/:teamId/logs */
export function fetchTrainingLogs(
  teamId: string,
  opts: { day?: number; from?: number; to?: number; playerId?: string; limit?: number } = {},
): Promise<TrainingLogEntry[]> {
  const params = new URLSearchParams();
  if (opts.day !== undefined) params.set("day", String(opts.day));
  if (opts.from !== undefined) params.set("from", String(opts.from));
  if (opts.to !== undefined) params.set("to", String(opts.to));
  if (opts.playerId) params.set("playerId", opts.playerId);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const q = params.toString();
  return getJson<TrainingLogEntry[]>(
    `/api/training/${encodeURIComponent(teamId)}/logs${q ? `?${q}` : ""}`,
  );
}

/** GET /api/training/:teamId/today */
export function fetchTrainingToday(
  teamId: string,
  opts: { seasonId?: string; day?: number } = {},
): Promise<DailyTrainingSummary> {
  const params = new URLSearchParams();
  if (opts.seasonId) params.set("seasonId", opts.seasonId);
  if (opts.day !== undefined) params.set("day", String(opts.day));
  const q = params.toString();
  return getJson<DailyTrainingSummary>(
    `/api/training/${encodeURIComponent(teamId)}/today${q ? `?${q}` : ""}`,
  );
}

// ── v0.6: 职员（Staff） ──

/** GET /api/staff/team/:teamId */
export function fetchTeamStaff(teamId: string): Promise<StaffView[]> {
  return getJson<StaffView[]>(`/api/staff/team/${encodeURIComponent(teamId)}`);
}

/** GET /api/staff/pool?job=...&limit=... */
export function fetchStaffPool(
  opts: { job?: StaffJob; limit?: number } = {},
): Promise<StaffView[]> {
  const params = new URLSearchParams();
  if (opts.job) params.set("job", opts.job);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const q = params.toString();
  return getJson<StaffView[]>(`/api/staff/pool${q ? `?${q}` : ""}`);
}

/** POST /api/staff/hire */
export function postStaffHire(
  professionalId: string,
  teamId: string,
): Promise<StaffView> {
  return postJson<StaffView>("/api/staff/hire", { professionalId, teamId });
}

/** POST /api/staff/:id/fire */
export function postStaffFire(
  professionalId: string,
  teamId: string,
): Promise<{ ok: true }> {
  return postJson<{ ok: true }>(
    `/api/staff/${encodeURIComponent(professionalId)}/fire`,
    { teamId },
  );
}

import type {
  WalletInfo,
  VipStatus,
  CosmeticItem,
  OwnedCosmetic,
  CreditPackage,
  PaymentOrderResult,
} from "./types";

// ── M4: 钱包（双货币）──

/** GET /api/wallet — 查询余额 */
export function fetchWallet(): Promise<WalletInfo> {
  return getJson<WalletInfo>("/api/wallet");
}

/** POST /api/wallet/spend-coins — 消费 Coins */
export function postSpendCoins(amount: number, reason: string): Promise<WalletInfo & { spent: number }> {
  return sendJson("POST", "/api/wallet/spend-coins", { amount, reason });
}

// ── v0.6: 财务系统 ──

export interface FinanceSummary {
  initialized: boolean;
  balance: number;
  sponsorTier: string;
  ticketPrice: number;
  debt: number;
  todayNet: number;
  weekNet: number;
  seasonNet: number;
}

export interface CategorySummary {
  [category: string]: {
    income: number;
    expense: number;
    items: Array<{ subType: string; amount: number }>;
  };
}

export interface LedgerEntry {
  id: string;
  teamId: string;
  seasonId: string;
  day: number;
  category: string;
  subType: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

export interface LedgerPage {
  entries: LedgerEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface SponsorInfo {
  id: string;
  teamId: string;
  type: string;
  name: string;
  tier: string;
  basePerSeason: number;
  bonusPerWin: number;
  titleBonus: number;
  satisfaction: number;
  expectedWinRate: number;
  expectedPlayoff: boolean;
  contractSeasons: number;
  startSeason: number;
  endSeason: number | null;
}

/** GET /api/finance/:teamId/summary — 余额 + 净额 */
export function fetchFinanceSummary(teamId: string): Promise<FinanceSummary> {
  return getJson<FinanceSummary>(`/api/finance/${encodeURIComponent(teamId)}/summary`);
}

/** GET /api/finance/:teamId/categories — 收支分类汇总 */
export function fetchFinanceCategories(
  teamId: string,
  range?: { from?: number; to?: number },
): Promise<CategorySummary> {
  const q = new URLSearchParams();
  if (range?.from != null) q.set("from", String(range.from));
  if (range?.to != null) q.set("to", String(range.to));
  const qs = q.toString();
  return getJson<CategorySummary>(
    `/api/finance/${encodeURIComponent(teamId)}/categories${qs ? `?${qs}` : ""}`,
  );
}

/** GET /api/finance/:teamId/ledger — 流水明细（分页 + 筛选） */
export function fetchFinanceLedger(
  teamId: string,
  options: {
    day?: number;
    from?: number;
    to?: number;
    category?: string;
    incomeOnly?: boolean;
    expenseOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {},
): Promise<LedgerPage> {
  const q = new URLSearchParams();
  if (options.day != null) q.set("day", String(options.day));
  if (options.from != null) q.set("from", String(options.from));
  if (options.to != null) q.set("to", String(options.to));
  if (options.category) q.set("category", options.category);
  if (options.incomeOnly) q.set("incomeOnly", "true");
  if (options.expenseOnly) q.set("expenseOnly", "true");
  if (options.limit != null) q.set("limit", String(options.limit));
  if (options.offset != null) q.set("offset", String(options.offset));
  return getJson<LedgerPage>(
    `/api/finance/${encodeURIComponent(teamId)}/ledger?${q.toString()}`,
  );
}

/** GET /api/finance/:teamId/sponsors — 赞助商列表 */
export function fetchFinanceSponsors(teamId: string): Promise<SponsorInfo[]> {
  return getJson<SponsorInfo[]>(`/api/finance/${encodeURIComponent(teamId)}/sponsors`);
}

// ── 批次4：董事会 ──

/** GET /api/board/:teamId — 董事会总览（董事 + 赞助商 + 目标 + 提案 + 满意度） */
export function fetchBoard(teamId: string, seasonId?: string): Promise<BoardView> {
  const q = new URLSearchParams();
  if (seasonId) q.set("seasonId", seasonId);
  const qs = q.toString();
  return getJson<BoardView>(
    `/api/board/${encodeURIComponent(teamId)}${qs ? `?${qs}` : ""}`,
  );
}

/** GET /api/board/:teamId/sponsors — 董事会视角的赞助商列表 */
export function fetchBoardSponsors(teamId: string): Promise<BoardSponsorView[]> {
  return getJson<BoardSponsorView[]>(`/api/board/${encodeURIComponent(teamId)}/sponsors`);
}

/** GET /api/board/:teamId/directors — 董事列表 */
export function fetchBoardDirectors(teamId: string): Promise<BoardDirectorView[]> {
  return getJson<BoardDirectorView[]>(`/api/board/${encodeURIComponent(teamId)}/directors`);
}

/** GET /api/board/:teamId/goal — 赛季目标 */
export function fetchSeasonGoal(
  teamId: string,
  seasonId?: string,
): Promise<SeasonGoalView | null> {
  const q = new URLSearchParams();
  if (seasonId) q.set("seasonId", seasonId);
  const qs = q.toString();
  return getJson<SeasonGoalView | null>(
    `/api/board/${encodeURIComponent(teamId)}/goal${qs ? `?${qs}` : ""}`,
  );
}

/** GET /api/board/:teamId/proposals — 董事会提案列表 */
export function fetchBoardProposals(teamId: string): Promise<BoardProposalView[]> {
  return getJson<BoardProposalView[]>(`/api/board/${encodeURIComponent(teamId)}/proposals`);
}

/** POST /api/board/proposals/:id/dismiss — 经理忽略已 approved 提案 */
export function dismissBoardProposal(
  proposalId: string,
  teamId: string,
): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(
    `/api/board/proposals/${encodeURIComponent(proposalId)}/dismiss`,
    { teamId },
  );
}

// ── 批次5：公关部（PR）──

/** GET /api/pr/:teamId/overview — 公关部总览 */
export function fetchPrOverview(teamId: string, seasonId?: string): Promise<PrOverviewView> {
  const q = new URLSearchParams();
  if (seasonId) q.set("seasonId", seasonId);
  const qs = q.toString();
  return getJson<PrOverviewView>(
    `/api/pr/${encodeURIComponent(teamId)}/overview${qs ? `?${qs}` : ""}`,
  );
}

/** GET /api/pr/:teamId/messages — 球队讯息列表 */
export function fetchTeamMessages(
  teamId: string,
  opts: { limit?: number; unreadOnly?: boolean } = {},
): Promise<TeamMessageView[]> {
  const q = new URLSearchParams();
  if (opts.limit) q.set("limit", String(opts.limit));
  if (opts.unreadOnly) q.set("unreadOnly", "true");
  const qs = q.toString();
  return getJson<TeamMessageView[]>(
    `/api/pr/${encodeURIComponent(teamId)}/messages${qs ? `?${qs}` : ""}`,
  );
}

/** GET /api/pr/:teamId/messages/unread — 未读讯息数 */
export function fetchUnreadMessageCount(teamId: string): Promise<{ count: number }> {
  return getJson<{ count: number }>(
    `/api/pr/${encodeURIComponent(teamId)}/messages/unread`,
  );
}

/** POST /api/pr/messages/:id/read — 标记单条讯息已读 */
export function markMessageRead(messageId: string, teamId: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(
    `/api/pr/messages/${encodeURIComponent(messageId)}/read`,
    { teamId },
  );
}

/** POST /api/pr/:teamId/messages/read-all — 标记全部已读 */
export function markAllMessagesRead(teamId: string): Promise<{ updated: number }> {
  return postJson<{ updated: number }>(
    `/api/pr/${encodeURIComponent(teamId)}/messages/read-all`,
    {},
  );
}

/** GET /api/pr/news — 媒体新闻列表 */
export function fetchMediaNews(
  opts: { seasonId?: string; category?: string; limit?: number } = {},
): Promise<MediaNewsView[]> {
  const q = new URLSearchParams();
  if (opts.seasonId) q.set("seasonId", opts.seasonId);
  if (opts.category) q.set("category", opts.category);
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return getJson<MediaNewsView[]>(`/api/pr/news${qs ? `?${qs}` : ""}`);
}

/** GET /api/pr/announcements — 联盟公告列表 */
export function fetchAnnouncements(
  opts: { seasonId?: string; category?: string; limit?: number } = {},
): Promise<LeagueAnnouncementView[]> {
  const q = new URLSearchParams();
  if (opts.seasonId) q.set("seasonId", opts.seasonId);
  if (opts.category) q.set("category", opts.category);
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return getJson<LeagueAnnouncementView[]>(`/api/pr/announcements${qs ? `?${qs}` : ""}`);
}

// ── 批次5：运营中心（Operations）──

/** GET /api/operations/:teamId/overview — 运营中心总览 */
export function fetchOperationsOverview(
  teamId: string,
  seasonId?: string,
): Promise<OperationsOverviewView> {
  const q = new URLSearchParams();
  if (seasonId) q.set("seasonId", seasonId);
  const qs = q.toString();
  return getJson<OperationsOverviewView>(
    `/api/operations/${encodeURIComponent(teamId)}/overview${qs ? `?${qs}` : ""}`,
  );
}

/** GET /api/operations/:teamId/fan-center — 球迷中心 */
export function fetchFanCenter(teamId: string): Promise<FanCenterView> {
  return getJson<FanCenterView>(`/api/operations/${encodeURIComponent(teamId)}/fan-center`);
}

/** GET /api/operations/:teamId/events — 球迷事件流 */
export function fetchFanEvents(
  teamId: string,
  seasonId?: string,
  limit?: number,
): Promise<FanEventView[]> {
  const q = new URLSearchParams();
  if (seasonId) q.set("seasonId", seasonId);
  if (limit) q.set("limit", String(limit));
  const qs = q.toString();
  return getJson<FanEventView[]>(
    `/api/operations/${encodeURIComponent(teamId)}/events${qs ? `?${qs}` : ""}`,
  );
}

// ── M4: VIP ──

/** GET /api/vip — VIP 订阅状态 */
export function fetchVipStatus(): Promise<VipStatus> {
  return getJson<VipStatus>("/api/vip");
}

/** GET /api/vip/plans — VIP 套餐 */
export function fetchVipPlans(): Promise<Record<string, { price: number; durationDays: number; coins: number }>> {
  return getJson("/api/vip/plans");
}

/** POST /api/vip/subscribe — 订阅 VIP */
export function postSubscribeVip(type: "monthly" | "seasonal"): Promise<{ id: string; type: string; expiresAt: string }> {
  return sendJson("POST", "/api/vip/subscribe", { type });
}

// ── M4: 外观商店 ──

/** GET /api/cosmetics — 外观商品列表 */
export function fetchCosmetics(type?: string): Promise<CosmeticItem[]> {
  const q = type ? `?type=${encodeURIComponent(type)}` : "";
  return getJson<CosmeticItem[]>(`/api/cosmetics${q}`);
}

/** GET /api/cosmetics/owned — 已拥有外观 */
export function fetchOwnedCosmetics(): Promise<OwnedCosmetic[]> {
  return getJson<OwnedCosmetic[]>("/api/cosmetics/owned");
}

/** POST /api/cosmetics/buy — 购买外观 */
export function postBuyCosmetic(itemId: string): Promise<{ success: boolean; itemId: string; price: number }> {
  return sendJson("POST", "/api/cosmetics/buy", { itemId });
}

/** POST /api/cosmetics/equip — 装备外观 */
export function postEquipCosmetic(itemId: string): Promise<{ id: string; equipped: boolean }> {
  return sendJson("POST", "/api/cosmetics/equip", { itemId });
}

// ── M4: 支付 ──

/** GET /api/payment/packages — Credits 套餐 */
export function fetchCreditPackages(): Promise<CreditPackage[]> {
  return getJson<CreditPackage[]>("/api/payment/packages");
}

/** POST /api/payment/create-order — 创建订单 */
export function postCreatePaymentOrder(
  packageId: string,
  provider: "stripe" | "alipay" | "wechat",
): Promise<PaymentOrderResult> {
  return sendJson("POST", "/api/payment/create-order", { packageId, provider });
}

/** POST /api/payment/:orderId/sandbox-complete — 沙箱完成支付 */
export function postSandboxComplete(orderId: string): Promise<{ success: boolean; orderId: string; credits: number }> {
  return sendJson("POST", `/api/payment/${encodeURIComponent(orderId)}/sandbox-complete`, {});
}

// ── M4: Web Push ──

/** POST /api/push/subscribe — 订阅推送 */
export function postPushSubscribe(subscription: PushSubscriptionJSON): Promise<{ id: string }> {
  return sendJson("POST", "/api/push/subscribe", subscription);
}

// ── The Fog：球探/迷雾系统 ──

/** GET /api/scout/reports — 获取本队所有球探报告 */
export function fetchScoutReports(): Promise<ScoutReport[]> {
  return getJson<ScoutReport[]>("/api/scout/reports");
}

/** GET /api/scout/reports/:playerId — 获取对某球员的球探报告 */
export function fetchScoutReport(playerId: string): Promise<ScoutReport | null> {
  return getJson<ScoutReport | null>(`/api/scout/reports/${encodeURIComponent(playerId)}`);
}

/** GET /api/scout/budget — 获取球探预算状态 */
export function fetchScoutBudget(): Promise<{ remaining: number; total: number; used: number }> {
  return getJson<{ remaining: number; total: number; used: number }>("/api/scout/budget");
}

/** POST /api/scout/players/:playerId — 球员探查（收窄能力 fog） */
export function postScoutPlayer(playerId: string): Promise<{ report: ScoutReport; cost: number }> {
  return sendJson("POST", `/api/scout/players/${encodeURIComponent(playerId)}`, {});
}

/** POST /api/scout/players/:playerId/potential — 潜力探查（收窄 Peak fog） */
export function postScoutPotential(playerId: string): Promise<{ report: ScoutReport; cost: number }> {
  return sendJson("POST", `/api/scout/players/${encodeURIComponent(playerId)}/potential`, {});
}

// ── P2: 管理后台 (analytics / audit / simconfig) ──

/** GET /api/analytics/dau — DAU 概览 */
export function fetchDau(date?: string): Promise<DauOverview> {
  return getJson<DauOverview>(`/api/analytics/dau${date ? `?date=${date}` : ""}`);
}

/** GET /api/analytics/retention/series — 留存序列 */
export function fetchRetentionSeries(days = 14, type: "d1" | "d7" | "d30" = "d1"): Promise<RetentionPoint[]> {
  return getJson<RetentionPoint[]>(`/api/analytics/retention/series?days=${days}&type=${type}`);
}

/** GET /api/analytics/events — 事件流 */
export function fetchAnalyticsEvents(params?: {
  category?: string; event?: string; userId?: string; limit?: number;
}): Promise<AnalyticsEvent[]> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.event) qs.set("event", params.event);
  if (params?.userId) qs.set("userId", params.userId);
  if (params?.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return getJson<AnalyticsEvent[]>(`/api/analytics/events${q ? `?${q}` : ""}`);
}

/** GET /api/audit/scan — 批量扫描比赛异常 */
export function fetchAuditScan(limit = 100): Promise<AuditScanResult[]> {
  return getJson<AuditScanResult[]>(`/api/audit/scan?limit=${limit}`);
}

/** GET /api/audit/replay/:matchId — 重放验证 */
export function fetchAuditReplay(matchId: string): Promise<AuditReplayResult> {
  return getJson<AuditReplayResult>(`/api/audit/replay/${encodeURIComponent(matchId)}`);
}

/** GET /api/simconfig — 当前生效配置 */
export function fetchSimConfig(): Promise<SimConfigActive> {
  return getJson<SimConfigActive>("/api/simconfig");
}

/** GET /api/simconfig/history — 配置历史 */
export function fetchSimConfigHistory(): Promise<SimConfigVersion[]> {
  return getJson<SimConfigVersion[]>("/api/simconfig/history");
}

/** POST /api/simconfig/update — 热更新 */
export function postSimConfigUpdate(
  patch: Partial<{ quarterLength: number; possessionsPerQuarter: number; homeAdvantage: number; basePossessionTime: number }>,
  note: string,
): Promise<SimConfigActive> {
  return sendJson<SimConfigActive>("POST", "/api/simconfig/update", { patch, note });
}

/** POST /api/simconfig/rollback — 回滚 */
export function postSimConfigRollback(version: number): Promise<SimConfigActive> {
  return sendJson<SimConfigActive>("POST", "/api/simconfig/rollback", { version });
}

/** POST /api/simconfig/reset — 重置 */
export function postSimConfigReset(): Promise<SimConfigActive> {
  return sendJson<SimConfigActive>("POST", "/api/simconfig/reset", {});
}

// ── P2-3: 球馆设施 ──

/** GET /api/facility/:teamId — 获取球馆设施 */
export function fetchFacility(teamId: string): Promise<Facility> {
  return getJson<Facility>(`/api/facility/${encodeURIComponent(teamId)}`);
}

/** POST /api/facility/:teamId/upgrade — 升级球馆设施 */
export function postUpgradeFacility(
  teamId: string,
  type: FacilityType,
): Promise<Facility> {
  return sendJson<Facility>(
    "POST",
    `/api/facility/${encodeURIComponent(teamId)}/upgrade`,
    { type },
  );
}

// ── P3-1: 三身份系统 ──

import type {
  IdentityView,
  ProfessionDef,
  AvatarCreateParams,
  TeamDynastyView,
  HallOfFameView,
  PlayerLegacyView,
  EraTagView,
  PlayerNetworkView,
  TeamChemistryView,
  PlayerMoraleView,
  RelationshipType,
  FamilyMember,
} from "./types";

/** GET /api/identity — 获取用户三身份总览（需 JWT） */
export function fetchIdentity(): Promise<IdentityView> {
  return getJson<IdentityView>("/api/identity");
}

/** GET /api/identity/professions — 获取全部职业列表 */
export function fetchProfessions(): Promise<ProfessionDef[]> {
  return getJson<ProfessionDef[]>("/api/identity/professions");
}

/** POST /api/identity/avatar — 创建球员化身（需 JWT） */
export function postCreateAvatar(params: AvatarCreateParams): Promise<{ avatarId: string; playerId: string }> {
  return sendJson("POST", "/api/identity/avatar", params);
}

/** POST /api/identity/profession — 选择职业人职业（需 JWT） */
export function postChooseProfession(job: string): Promise<{ professionalId: string; job: string; line: string }> {
  return sendJson("POST", "/api/identity/profession", { job });
}

/** POST /api/identity/profession/switch — 转职（需 JWT） */
export function postSwitchProfession(job: string): Promise<{ job: string; level: number; experience: number }> {
  return sendJson("POST", "/api/identity/profession/switch", { job });
}

/** POST /api/identity/profession/skill — 分配技能点（需 JWT） */
export function postAddSkillPoint(branch: string, points: number): Promise<{ skillPoints: Record<string, number> }> {
  return sendJson("POST", "/api/identity/profession/skill", { branch, points });
}

// ── P3-3: 王朝与传承系统 ──

/** GET /api/dynasty/team/:teamId — 球队王朝记录 */
export function fetchTeamDynasty(teamId: string): Promise<TeamDynastyView> {
  return getJson<TeamDynastyView>(`/api/dynasty/team/${encodeURIComponent(teamId)}`);
}

/** GET /api/dynasty/hall-of-fame — 名人堂名单 */
export function fetchHallOfFame(): Promise<HallOfFameView> {
  return getJson<HallOfFameView>("/api/dynasty/hall-of-fame");
}

/** GET /api/dynasty/player/:playerId — 球员时代标签 + 传承遗产 */
export function fetchPlayerLegacy(playerId: string): Promise<PlayerLegacyView> {
  return getJson<PlayerLegacyView>(`/api/dynasty/player/${encodeURIComponent(playerId)}`);
}

/** GET /api/dynasty/team/:teamId/tags — 球队时代标签 */
export function fetchTeamEraTags(teamId: string): Promise<EraTagView[]> {
  return getJson<EraTagView[]>(`/api/dynasty/team/${encodeURIComponent(teamId)}/tags`);
}

// ── P3-4: 球员家庭与人际关系系统 ──

/** GET /api/relationship/player/:playerId — 球员关系网 */
export function fetchPlayerNetwork(playerId: string): Promise<PlayerNetworkView> {
  return getJson<PlayerNetworkView>(`/api/relationship/player/${encodeURIComponent(playerId)}`);
}

/** PUT /api/relationship/player/:playerId/family — 设置家庭背景 */
export function putPlayerFamily(
  playerId: string,
  background: string,
  members?: FamilyMember[],
): Promise<PlayerNetworkView["family"]> {
  return sendJson("PUT", `/api/relationship/player/${encodeURIComponent(playerId)}/family`, {
    background,
    members,
  });
}

/** POST /api/relationship — 创建人际关系 */
export function postCreateRelationship(payload: {
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  bond?: number;
  note?: string;
}): Promise<{ id: string; type: string; typeLabel: string; bond: number }> {
  return sendJson("POST", "/api/relationship", payload);
}

/** GET /api/relationship/team/:teamId/chemistry — 球队化学反应 */
export function fetchTeamChemistry(teamId: string): Promise<TeamChemistryView> {
  return getJson<TeamChemistryView>(`/api/relationship/team/${encodeURIComponent(teamId)}/chemistry`);
}

/** GET /api/relationship/player/:playerId/morale — 球员士气 */
export function fetchPlayerMorale(playerId: string): Promise<PlayerMoraleView> {
  return getJson<PlayerMoraleView>(`/api/relationship/player/${encodeURIComponent(playerId)}/morale`);
}

// ── v0.6 §批次6: 人才市场 ──

/** GET /api/market/overview — 市场总览 */
export function fetchMarketOverview(): Promise<MarketOverviewView> {
  return getJson<MarketOverviewView>("/api/market/overview");
}

/** GET /api/market/phase — 当前阶段 */
export function fetchMarketPhase(): Promise<TransferMarketPhaseView> {
  return getJson<TransferMarketPhaseView>("/api/market/phase");
}

/** GET /api/market/free-players — 自由球员列表 */
export function fetchFreeAgentPlayers(): Promise<FreeAgentPlayerView[]> {
  return getJson<FreeAgentPlayerView[]>("/api/market/free-players");
}

/** GET /api/market/free-staff?job=xxx — 自由职员列表 */
export function fetchFreeAgentStaff(job?: string): Promise<FreeAgentStaffView[]> {
  const q = job ? `?job=${encodeURIComponent(job)}` : "";
  return getJson<FreeAgentStaffView[]>(`/api/market/free-staff${q}`);
}

/** POST /api/market/sign/player/:playerId — 签约自由球员 */
export function postSignFreeAgentPlayer(playerId: string): Promise<MarketSignResult> {
  return postJson<MarketSignResult>(`/api/market/sign/player/${encodeURIComponent(playerId)}`, {});
}

/** POST /api/market/sign/staff/:proId — 签约自由职员 */
export function postSignFreeAgentStaff(proId: string): Promise<MarketSignResult> {
  return postJson<MarketSignResult>(`/api/market/sign/staff/${encodeURIComponent(proId)}`, {});
}

/** POST /api/market/pending/:pendingId/cancel — 撤回受限市场签约 */
export function postCancelPendingSigning(pendingId: string): Promise<{ ok: true }> {
  return postJson(`/api/market/pending/${encodeURIComponent(pendingId)}/cancel`, {});
}

// ── v0.6 §批次6: ScoutMission ──

/** GET /api/scout/missions?status=xxx — 列出本队 ScoutMission */
export function fetchScoutMissions(status?: "pending" | "completed" | "expired"): Promise<ScoutMissionView[]> {
  const q = status ? `?status=${status}` : "";
  return getJson<ScoutMissionView[]>(`/api/scout/missions${q}`);
}

/** POST /api/scout/missions — 创建 ScoutMission */
export function postCreateScoutMission(payload: {
  scoutId: string;
  targetType: string;
  targetRef?: string | null;
  region?: string | null;
}): Promise<ScoutMissionView> {
  return postJson<ScoutMissionView>("/api/scout/missions", payload);
}

/** POST /api/scout/missions/:id/complete — 手动完成任务 */
export function postCompleteScoutMission(missionId: string): Promise<ScoutMissionView> {
  return postJson<ScoutMissionView>(`/api/scout/missions/${encodeURIComponent(missionId)}/complete`, {});
}

/** POST /api/scout/missions/:id/cancel — 撤回任务 */
export function postCancelScoutMission(missionId: string): Promise<{ ok: true }> {
  return postJson(`/api/scout/missions/${encodeURIComponent(missionId)}/cancel`, {});
}

// ── v0.6 §批次6: 球队模糊搜索 ──

/** GET /api/teams/search?q=xxx&leagueId=xxx&worldId=xxx&limit=30 */
export function searchTeams(params: TeamSearchParams = {}): Promise<TeamSearchResult[]> {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.leagueId) usp.set("leagueId", params.leagueId);
  if (params.worldId) usp.set("worldId", params.worldId);
  if (params.limit) usp.set("limit", String(params.limit));
  const q = usp.toString();
  return getJson<TeamSearchResult[]>(`/api/teams/search${q ? `?${q}` : ""}`);
}
