/**
 * DraftPage —— 选秀大会
 *
 * - 初始化选秀（乐透抽签 + 生成选秀池）
 * - 查看选秀看板：顺位 + 可用球员
 * - 手动选人 / AI 自动选秀
 * - 查看选秀结果
 *
 * 需要先选择赛季与世界，通常用当前赛季 + 我所在的世界。
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchCurrentSeason,
  fetchDraftBoard,
  postInitDraft,
  postMakeDraftPick,
  postAutoDraft,
} from "../api";
import type { DraftBoard, DraftInitResult, SeasonInfo } from "../types";

interface Props {
  worldId?: string;
  myTeamId?: string;
}

export function DraftPage({ worldId, myTeamId }: Props) {
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [board, setBoard] = useState<DraftBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [initResult, setInitResult] = useState<DraftInitResult | null>(null);
  const [selectedPickId, setSelectedPickId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!season || !worldId) return;
    setLoading(true);
    try {
      const b = await fetchDraftBoard(season.id, worldId);
      setBoard(b);
      setError(null);
    } catch (e: unknown) {
      // 选秀未初始化时 board 为空
      setBoard(null);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [season, worldId]);

  // 加载当前赛季
  useEffect(() => {
    fetchCurrentSeason()
      .then(setSeason)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (season && worldId) load();
  }, [season, worldId, load]);

  async function handleInit() {
    if (!season || !worldId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await postInitDraft(season.id, worldId);
      setInitResult(r);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleMakePick(playerId: string) {
    if (!selectedPickId) return;
    setBusy(true);
    setError(null);
    try {
      await postMakeDraftPick(selectedPickId, playerId);
      setSelectedPickId(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleAutoDraft() {
    if (!season || !worldId) return;
    setBusy(true);
    setError(null);
    try {
      await postAutoDraft(season.id, worldId);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!worldId) {
    return (
      <div className="page">
        <header className="page-head">
          <h2>选秀大会</h2>
          <p className="muted">请先加入一个世界以参与选秀。</p>
        </header>
      </div>
    );
  }

  const picks = board?.picks ?? [];
  const available = board?.available ?? [];
  const unpicked = picks.filter((p) => !p.playerId);
  const myPicks = myTeamId
    ? picks.filter((p) => p.teamId === myTeamId)
    : [];

  return (
    <div className="page">
      <header className="page-head">
        <h2>选秀大会</h2>
        <p className="muted">
          赛季 {season?.name ?? "—"} · 世界 {worldId.slice(-6)}
        </p>
      </header>

      {error && <div className="state error">{error}</div>}

      <div className="row gap wrap">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !season}
          onClick={handleInit}
        >
          初始化选秀（乐透抽签）
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !board || unpicked.length === 0}
          onClick={handleAutoDraft}
        >
          AI 自动选秀剩余 ({unpicked.length})
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={load}
          disabled={loading}
        >
          刷新
        </button>
      </div>

      {initResult && (
        <div className="card">
          <h3>乐透抽签结果</h3>
          <p className="muted">
            共 {initResult.picksCreated} 个顺位，{initResult.prospectsCreated} 名新秀进入选秀池
          </p>
          <ol className="lottery">
            {initResult.lotteryOrder.map((slot, i) => (
              <li key={slot.teamId}>
                <span className="badge">#{i + 1}</span> 球队 {slot.teamId.slice(-6)}
              </li>
            ))}
          </ol>
        </div>
      )}

      {loading ? (
        <div className="state"><span className="spinner" /> 加载选秀看板…</div>
      ) : !board ? (
        <div className="card">
          <p className="muted">选秀大会尚未初始化。点击上方按钮开始乐透抽签。</p>
        </div>
      ) : (
        <div className="grid grid-2">
          {/* 顺位列表 */}
          <section className="card">
            <h3>顺位（{picks.length}）</h3>
            {myPicks.length > 0 && (
              <p className="muted">
                我的顺位：{myPicks.map((p) => `R${p.round}#${p.pickNum}`).join(", ")}
              </p>
            )}
            <table className="table compact">
              <thead>
                <tr>
                  <th>轮次.顺位</th>
                  <th>球队</th>
                  <th>选中球员</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {picks.map((p) => {
                  const isMine = p.teamId === myTeamId;
                  const isSelected = selectedPickId === p.id;
                  return (
                    <tr
                      key={p.id}
                      className={isSelected ? "is-selected" : undefined}
                    >
                      <td>R{p.round}#{p.pickNum}</td>
                      <td>
                        {p.team?.name ?? (p.teamId ? p.teamId.slice(-6) : "—")}
                        {isMine && <span className="badge">我</span>}
                      </td>
                      <td>
                        {p.player
                          ? `${p.player.name} (${p.player.position})`
                          : <span className="muted">未选</span>}
                      </td>
                      <td>
                        {!p.playerId && isMine && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setSelectedPickId(isSelected ? null : p.id)}
                          >
                            {isSelected ? "取消" : "选人"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* 可用球员 */}
          <section className="card">
            <h3>可用球员（{available.length}）</h3>
            {selectedPickId ? (
              <p className="muted">点击球员分配给当前选中顺位</p>
            ) : (
              <p className="muted">选择上方"选人"按钮以分配球员</p>
            )}
            <table className="table compact">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>位置</th>
                  <th>年龄</th>
                  <th>潜力</th>
                  <th>OVR</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {available.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.position}</td>
                    <td>{p.age}</td>
                    <td>{p.potential ?? "—"}</td>
                    <td><strong>{p.ovr}</strong></td>
                    <td>
                      {selectedPickId && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() => handleMakePick(p.id)}
                        >
                          选中
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
