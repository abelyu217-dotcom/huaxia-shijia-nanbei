/**
 * DailyReward —— 每日登录奖励组件
 *
 * 参考 Rim Attack 的每日奖励设计：连续 7 天签到日历，每日可领取不同奖励。
 * 状态持久化到 localStorage（key: hwo_daily_reward_state）：
 *   - lastClaimDate：ISO 日期字符串（YYYY-MM-DD）
 *   - streak：连续天数 1-7
 * 断签处理：若上次领取非昨天，streak 重置为 1。
 *
 * 组件自包含触发按钮 + 下拉面板，无 props。
 */

import { useEffect, useRef, useState } from "react";

interface RewardState {
  lastClaimDate: string | null; // YYYY-MM-DD
  streak: number; // 连续天数 1-7（0 表示尚未开始）
}

const STORAGE_KEY = "hwo_daily_reward_state";

interface RewardDef {
  day: number;
  label: string;
  kind: "coins" | "credits" | "item";
}

const REWARDS: RewardDef[] = [
  { day: 1, label: "100 Coins", kind: "coins" },
  { day: 2, label: "200 Coins", kind: "coins" },
  { day: 3, label: "50 Credits", kind: "credits" },
  { day: 4, label: "300 Coins", kind: "coins" },
  { day: 5, label: "100 Credits", kind: "credits" },
  { day: 6, label: "500 Coins", kind: "coins" },
  { day: 7, label: "200 Credits + 随机外观道具", kind: "item" },
];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadState(): RewardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lastClaimDate: null, streak: 0 };
    const parsed = JSON.parse(raw) as Partial<RewardState>;
    const streak =
      typeof parsed.streak === "number" && Number.isFinite(parsed.streak)
        ? parsed.streak
        : 0;
    const last =
      typeof parsed.lastClaimDate === "string" ? parsed.lastClaimDate : null;
    return { lastClaimDate: last, streak: Math.max(0, Math.min(7, streak)) };
  } catch {
    return { lastClaimDate: null, streak: 0 };
  }
}

function saveState(s: RewardState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function DailyReward() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<RewardState>(() => loadState());
  const [toast, setToast] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭面板
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // 奖励提示自动消失
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const now = new Date();
  const today = toDateStr(now);
  const yd = new Date(now);
  yd.setDate(now.getDate() - 1);
  const yesterday = toDateStr(yd);

  const claimedToday = state.lastClaimDate === today;
  const continuing = state.lastClaimDate === yesterday;

  // 今日可领取的天数索引（断签或满 7 天后回到 Day 1）
  const pendingDay = continuing
    ? state.streak >= 7
      ? 1
      : state.streak + 1
    : 1;

  // 当前周期内已领取的天数集合
  let claimedDays: number[];
  if (claimedToday) {
    claimedDays = Array.from({ length: state.streak }, (_, i) => i + 1);
  } else if (continuing && state.streak < 7) {
    claimedDays = Array.from({ length: state.streak }, (_, i) => i + 1);
  } else {
    claimedDays = [];
  }

  const todayHighlight = claimedToday ? null : pendingDay;
  const displayStreak = claimedToday
    ? state.streak
    : continuing
      ? state.streak
      : 0;
  const subText =
    displayStreak === 0
      ? "今日重新开始连续签到"
      : `已连续签到 ${displayStreak} 天`;

  function handleClaim() {
    if (claimedToday) return;
    const newStreak = continuing
      ? state.streak >= 7
        ? 1
        : state.streak + 1
      : 1;
    const next: RewardState = { lastClaimDate: today, streak: newStreak };
    setState(next);
    saveState(next);
    const reward = REWARDS.find((r) => r.day === pendingDay);
    setToast(reward ? `已领取：${reward.label}` : "已领取奖励");
  }

  return (
    <div className="daily-reward" ref={wrapRef}>
      <button
        type="button"
        className={`btn btn-ghost btn-sm daily-reward-trigger${
          !claimedToday ? " is-pending" : ""
        }`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg
          className="daily-reward-icon"
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="8" width="18" height="4" rx="1" />
          <path d="M12 8v13" />
          <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
          <path d="M7.5 8a2.5 2.5 0 0 1 0-5C9 3 12 4 12 8" />
          <path d="M16.5 8a2.5 2.5 0 0 0 0-5C15 3 12 4 12 8" />
        </svg>
        <span>每日奖励</span>
        {!claimedToday && (
          <span className="daily-reward-dot" aria-label="今日可领取" />
        )}
      </button>

      {open && (
        <div
          className="daily-reward-panel"
          role="dialog"
          aria-label="每日登录奖励"
        >
          <div className="daily-reward-head">
            <span className="daily-reward-title">每日登录奖励</span>
            <button
              type="button"
              className="daily-reward-close"
              onClick={() => setOpen(false)}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <div className="daily-reward-sub">{subText}</div>

          <div className="reward-grid">
            {REWARDS.map((r) => {
              const isClaimed = claimedDays.includes(r.day);
              const isToday = todayHighlight === r.day;
              const isLocked = !isClaimed && !isToday;
              const cls = [
                "reward-cell",
                isClaimed ? "reward-cell-claimed" : "",
                isToday ? "reward-cell-today" : "",
                isLocked ? "reward-cell-locked" : "",
                r.day === 7 ? "reward-cell-final" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div key={r.day} className={cls}>
                  <div className="reward-cell-day">Day {r.day}</div>
                  <div className="reward-cell-label">{r.label}</div>
                  {isClaimed && (
                    <span className="reward-cell-check" aria-label="已领取">
                      ✓
                    </span>
                  )}
                  {isLocked && (
                    <span className="reward-cell-lock" aria-label="未解锁">
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="4" y="11" width="16" height="10" rx="2" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className={`reward-claim-btn${
              claimedToday ? " is-disabled" : " is-active"
            }`}
            onClick={handleClaim}
            disabled={claimedToday}
          >
            {claimedToday
              ? "今日已领取"
              : `领取 Day ${pendingDay} 奖励`}
          </button>

          {toast && <div className="reward-toast">{toast}</div>}
        </div>
      )}
    </div>
  );
}
