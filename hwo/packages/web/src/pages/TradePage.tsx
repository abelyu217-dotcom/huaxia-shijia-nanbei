/**
 * TradePage —— 跨经理交易系统
 *
 * - 查看其他球队球员，发起交易报价
 * - 查看收到的报价：接受 / 拒绝 / 还价
 * - 查看发出的报价状态
 *
 * 薪资匹配：双方球员总薪资差异需在 25% 以内。
 */

import { useEffect, useMemo, useState } from "react";
import {
  fetchTeams,
  fetchSentTrades,
  fetchReceivedTrades,
  postTradeOffer,
  postAcceptTrade,
  postRejectTrade,
  postCounterTrade,
} from "../api";
import type { TradeOffer, PlayerDetail, TeamDetail } from "../types";
import { fetchTeam } from "../api";

interface Props {
  myTeamId: string;
}

type Tab = "make" | "received" | "sent";

export function TradePage({ myTeamId }: Props) {
  const [tab, setTab] = useState<Tab>("make");
  const [teams, setTeams] = useState<TeamDetail[]>([]);
  const [myTeam, setMyTeam] = useState<TeamDetail | null>(null);
  const [targetTeamId, setTargetTeamId] = useState<string>("");
  const [mySelected, setMySelected] = useState<string[]>([]);
  const [theirSelected, setTheirSelected] = useState<string[]>([]);
  const [myCash, setMyCash] = useState(0);
  const [theirCash, setTheirCash] = useState(0);
  const [sent, setSent] = useState<TradeOffer[]>([]);
  const [received, setReceived] = useState<TradeOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 加载球队列表和我的球队
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchTeams(), fetchTeam(myTeamId)])
      .then(([rosters, mine]) => {
        if (cancelled) return;
        // 取每支球队的详情
        return Promise.all(
          rosters.map((r) => fetchTeam(r.id).catch(() => null)),
        ).then((details) => {
          if (cancelled) return;
          const valid = details.filter(
            (d): d is TeamDetail => d !== null,
          );
          setTeams(valid);
          setMyTeam(mine);
          const other = valid.find((t) => t.id !== myTeamId);
          if (other) setTargetTeamId(other.id);
        });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [myTeamId]);

  // 加载交易列表
  const loadTrades = () => {
    Promise.all([fetchSentTrades(myTeamId), fetchReceivedTrades(myTeamId)])
      .then(([s, r]) => {
        setSent(s);
        setReceived(r);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  };

  useEffect(() => {
    loadTrades();
  }, [myTeamId]);

  const targetTeam = useMemo(
    () => teams.find((t) => t.id === targetTeamId) ?? null,
    [teams, targetTeamId],
  );

  const mySelectedPlayers = useMemo(
    () =>
      (myTeam?.players ?? []).filter((p) => mySelected.includes(p.id)),
    [myTeam, mySelected],
  );

  const theirSelectedPlayers = useMemo(
    () =>
      (targetTeam?.players ?? []).filter((p) => theirSelected.includes(p.id)),
    [targetTeam, theirSelected],
  );

  // 薪资计算（用 ovr 作为薪资近似）
  const salaryOf = (p: PlayerDetail) => p.ovr * 100;
  const mySalary = mySelectedPlayers.reduce(
    (s, p) => s + salaryOf(p),
    0,
  );
  const theirSalary = theirSelectedPlayers.reduce(
    (s, p) => s + salaryOf(p),
    0,
  );

  // 薪资匹配检查：|A - B| <= max(A, B) * 0.25
  const maxSalary = Math.max(mySalary + myCash, theirSalary + theirCash);
  const diff = Math.abs(
    mySalary + myCash - (theirSalary + theirCash),
  );
  const salaryMatch =
    maxSalary === 0 || diff <= maxSalary * 0.25;

  const toggleMyPlayer = (id: string) => {
    setMySelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleTheirPlayer = (id: string) => {
    setTheirSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = async () => {
    if (!salaryMatch) {
      setError("薪资不匹配：差异需在 25% 以内");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await postTradeOffer({
        offerorTeamId: myTeamId,
        offereeTeamId: targetTeamId,
        offerorPlayers: mySelected,
        offereePlayers: theirSelected,
        offerorCash: myCash,
        offereeCash: theirCash,
      });
      setMySelected([]);
      setTheirSelected([]);
      setMyCash(0);
      setTheirCash(0);
      loadTrades();
      setTab("sent");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async (id: string) => {
    try {
      await postAcceptTrade(id);
      loadTrades();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReject = async (id: string) => {
    try {
      await postRejectTrade(id);
      loadTrades();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCounter = async (id: string) => {
    // 简化：交换双方球员作为还价
    try {
      await postCounterTrade(id, {
        offerorPlayers: theirSelected,
        offereePlayers: mySelected,
      });
      loadTrades();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 加载交易中心…
      </div>
    );
  }

  return (
    <div className="trade-page">
      <div className="tab-nav">
        {([
          ["make", "发起交易"],
          ["received", `收到报价 (${received.length})`],
          ["sent", `发出报价 (${sent.length})`],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            className={`tab${tab === t ? " is-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="state error">{error}</div>}

      {tab === "make" && (
        <div className="panel">
          <div className="panel-head">
            <h2>发起交易</h2>
            <span className="hint">选择对方球队与交换球员</span>
          </div>
          <div className="panel-body">
            <div className="trade-target">
              <label>
                对方球队：
                <select
                  value={targetTeamId}
                  onChange={(e) => {
                    setTargetTeamId(e.target.value);
                    setTheirSelected([]);
                  }}
                >
                  {teams
                    .filter((t) => t.id !== myTeamId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="trade-teams">
              {/* 我的球员 */}
              <div className="trade-team-col">
                <h3>我的球队 ({myTeam?.name})</h3>
                <div className="trade-player-list">
                  {myTeam?.players.map((p) => (
                    <label
                      key={p.id}
                      className={`trade-player${
                        mySelected.includes(p.id) ? " selected" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={mySelected.includes(p.id)}
                        onChange={() => toggleMyPlayer(p.id)}
                      />
                      <span className="tp-name">{p.name}</span>
                      <span className="tp-ovr">OVR {p.ovr}</span>
                      <span className="tp-salary">
                        ${salaryOf(p).toLocaleString()}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="trade-cash">
                  <label>
                    现金送出：
                    <input
                      type="number"
                      value={myCash}
                      min={0}
                      onChange={(e) =>
                        setMyCash(Number(e.target.value) || 0)
                      }
                    />
                  </label>
                </div>
              </div>

              {/* 对方球员 */}
              <div className="trade-team-col">
                <h3>对方球队 ({targetTeam?.name})</h3>
                <div className="trade-player-list">
                  {targetTeam?.players.map((p) => (
                    <label
                      key={p.id}
                      className={`trade-player${
                        theirSelected.includes(p.id) ? " selected" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={theirSelected.includes(p.id)}
                        onChange={() => toggleTheirPlayer(p.id)}
                      />
                      <span className="tp-name">{p.name}</span>
                      <span className="tp-ovr">OVR {p.ovr}</span>
                      <span className="tp-salary">
                        ${salaryOf(p).toLocaleString()}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="trade-cash">
                  <label>
                    索要现金：
                    <input
                      type="number"
                      value={theirCash}
                      min={0}
                      onChange={(e) =>
                        setTheirCash(Number(e.target.value) || 0)
                      }
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* 薪资匹配摘要 */}
            <div className="trade-summary">
              <div className="ts-row">
                <span>我方送出薪资：</span>
                <b>${mySalary.toLocaleString()}</b>
                {myCash > 0 && (
                  <span className="ts-cash">
                    {" "}
                    + 现金 ${myCash.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="ts-row">
                <span>对方送出薪资：</span>
                <b>${theirSalary.toLocaleString()}</b>
                {theirCash > 0 && (
                  <span className="ts-cash">
                    {" "}
                    + 现金 ${theirCash.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="ts-match">
                {salaryMatch ? (
                  <span className="ts-ok">✓ 薪资匹配</span>
                ) : (
                  <span className="ts-bad">✗ 薪资不匹配（差异 {diff.toLocaleString()}）</span>
                )}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={submitting || !salaryMatch || mySelected.length === 0 || theirSelected.length === 0}
              >
                {submitting ? "提交中…" : "发送报价"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "received" && (
        <div className="panel">
          <div className="panel-head">
            <h2>收到的报价</h2>
          </div>
          <div className="panel-body">
            {received.length === 0 ? (
              <div className="empty-block">暂无收到的报价</div>
            ) : (
              <div className="trade-list">
                {received.map((t) => (
                  <TradeOfferCard
                    key={t.id}
                    offer={t}
                    myTeamId={myTeamId}
                    onAccept={() => handleAccept(t.id)}
                    onReject={() => handleReject(t.id)}
                    onCounter={() => handleCounter(t.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "sent" && (
        <div className="panel">
          <div className="panel-head">
            <h2>发出的报价</h2>
          </div>
          <div className="panel-body">
            {sent.length === 0 ? (
              <div className="empty-block">暂无发出的报价</div>
            ) : (
              <div className="trade-list">
                {sent.map((t) => (
                  <TradeOfferCard key={t.id} offer={t} myTeamId={myTeamId} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TradeOfferCard({
  offer,
  myTeamId,
  onAccept,
  onReject,
  onCounter,
}: {
  offer: TradeOffer;
  myTeamId: string;
  onAccept?: () => void;
  onReject?: () => void;
  onCounter?: () => void;
}) {
  const isPending = offer.status === "pending";
  const isReceived = offer.offereeTeamId === myTeamId;

  return (
    <div className={`trade-card status-${offer.status}`}>
      <div className="tc-head">
        <span className="tc-status">{offer.status}</span>
        <span className="tc-round">第 {offer.round} 轮</span>
        <span className="tc-expire">
          到期：{new Date(offer.expiresAt).toLocaleString()}
        </span>
      </div>
      <div className="tc-body">
        <div className="tc-side">
          <span className="tc-label">
            {isReceived ? "对方送出" : "我方送出"}
          </span>
          <span className="tc-players">
            {offer.offerorPlayers.length} 名球员
            {offer.offerorCash > 0 &&
              ` + $${offer.offerorCash.toLocaleString()}`}
          </span>
        </div>
        <div className="tc-arrow">→</div>
        <div className="tc-side">
          <span className="tc-label">
            {isReceived ? "我方送出" : "对方送出"}
          </span>
          <span className="tc-players">
            {offer.offereePlayers.length} 名球员
            {offer.offereeCash > 0 &&
              ` + $${offer.offereeCash.toLocaleString()}`}
          </span>
        </div>
      </div>
      {isPending && isReceived && (onAccept || onReject || onCounter) && (
        <div className="tc-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onAccept}
          >
            接受
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={onCounter}
          >
            还价
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onReject}
          >
            拒绝
          </button>
        </div>
      )}
    </div>
  );
}
