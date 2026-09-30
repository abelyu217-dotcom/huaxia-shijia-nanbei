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
  FreeAgent,
  WorldInfo,
  ScoutReport,
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

/** POST /api/season/advance — 推进一日，结算当日所有比赛（需 JWT） */
export function postAdvanceDay(): Promise<AdvanceResult> {
  return sendJson<AdvanceResult>("POST", "/api/season/advance", {});
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
export function postTrainPlayer(playerId: string): Promise<TrainResult | null> {
  return sendJson<TrainResult | null>(
    "POST",
    `/api/career/train/${encodeURIComponent(playerId)}`,
    {},
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

/** POST /api/contract/:contractId/waive — 裁员 */
export function postWaivePlayer(
  contractId: string,
): Promise<{ waived: true; playerId: string }> {
  return sendJson(
    "POST",
    `/api/contract/${encodeURIComponent(contractId)}/waive`,
    {},
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
