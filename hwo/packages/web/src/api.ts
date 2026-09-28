/**
 * HWO Web API 客户端——对接后端 REST 端点。
 *
 * 所有方法返回强类型 Promise；非 2xx 抛 Error。
 */

import type {
  TeamRoster,
  TeamDetail,
  TacticPreset,
  SimMatchRequest,
  SimOutput,
} from "./types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** GET /api/teams — 全部 6 支球队阵容概览。 */
export function fetchTeams(): Promise<TeamRoster[]> {
  return getJson<TeamRoster[]>("/api/teams");
}

/** GET /api/teams/:id — 球队详情（球员详细能力值 + ovr）。 */
export function fetchTeam(id: string): Promise<TeamDetail> {
  return getJson<TeamDetail>(`/api/teams/${encodeURIComponent(id)}`);
}

/** GET /api/tactics — 20 个战术预设。 */
export function fetchTactics(): Promise<TacticPreset[]> {
  return getJson<TacticPreset[]>("/api/tactics");
}

/** POST /api/sim/match — 模拟一场比赛，返回完整 SimOutput。 */
export async function postSimMatch(req: SimMatchRequest): Promise<SimOutput> {
  const res = await fetch("/api/sim/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`POST /api/sim/match → HTTP ${res.status}`);
  return (await res.json()) as SimOutput;
}
