/**
 * ShopPage —— 商店页面（M4 商业化）
 *
 * - Credits 充值
 * - VIP 订阅
 * - 外观商店
 * - 钱包余额展示
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchWallet,
  fetchVipStatus,
  fetchVipPlans,
  postSubscribeVip,
  fetchCosmetics,
  fetchOwnedCosmetics,
  postBuyCosmetic,
  postEquipCosmetic,
  fetchCreditPackages,
  postCreatePaymentOrder,
  postSandboxComplete,
} from "../api";
import type {
  WalletInfo,
  VipStatus,
  CosmeticItem,
  OwnedCosmetic,
  CreditPackage,
} from "../types";

const RARITY_COLORS: Record<string, string> = {
  common: "#a4b0be",
  rare: "#7bed9f",
  epic: "#a55eea",
  legendary: "#ffd700",
};

const RARITY_NAMES: Record<string, string> = {
  common: "普通",
  rare: "稀有",
  epic: "史诗",
  legendary: "传奇",
};

const TYPE_NAMES: Record<string, string> = {
  jersey: "球衣",
  arena_skin: "球馆",
  avatar_frame: "头像框",
};

type Tab = "credits" | "vip" | "cosmetics";

export function ShopPage() {
  const [tab, setTab] = useState<Tab>("credits");
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [vip, setVip] = useState<VipStatus | null>(null);
  const [error, _setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadWallet = useCallback(() => {
    fetchWallet().then(setWallet).catch(() => {});
    fetchVipStatus().then(setVip).catch(() => {});
  }, []);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  return (
    <div className="page">
      <header className="page-head">
        <h2>商店</h2>
        <p className="muted">充值 Credits、订阅 VIP、购买外观</p>
      </header>

      {/* 钱包余额 */}
      {wallet && (
        <div className="card wallet-bar">
          <div className="wallet-coins">
            <span className="wallet-icon">🪙</span>
            <strong>{wallet.coins.toLocaleString()}</strong>
            <span className="muted">Coins</span>
          </div>
          <div className="wallet-credits">
            <span className="wallet-icon">💎</span>
            <strong>{wallet.credits.toLocaleString()}</strong>
            <span className="muted">Credits</span>
          </div>
          {vip && vip.active && (
            <div className="wallet-vip">
              <span className="badge badge-big">VIP {vip.type === "monthly" ? "月卡" : "季卡"}</span>
              <span className="muted">到期: {vip.expiresAt ? new Date(vip.expiresAt).toLocaleDateString() : "—"}</span>
            </div>
          )}
        </div>
      )}

      {error && <div className="state error">{error}</div>}
      {msg && <div className="state success">{msg}</div>}

      {/* Tab 切换 */}
      <div className="tabs">
        <button className={`tab${tab === "credits" ? " is-active" : ""}`} onClick={() => setTab("credits")}>充值</button>
        <button className={`tab${tab === "vip" ? " is-active" : ""}`} onClick={() => setTab("vip")}>VIP</button>
        <button className={`tab${tab === "cosmetics" ? " is-active" : ""}`} onClick={() => setTab("cosmetics")}>外观</button>
      </div>

      {tab === "credits" && <CreditsTab onPaid={() => { loadWallet(); setMsg("充值成功！Credits 已到账"); }} />}
      {tab === "vip" && <VipTab wallet={wallet} onSubscribe={() => { loadWallet(); setMsg("VIP 订阅成功！"); }} />}
      {tab === "cosmetics" && <CosmeticsTab wallet={wallet} onChanged={() => { loadWallet(); setMsg("操作成功"); }} />}
    </div>
  );
}

// ── Credits 充值 Tab ──
function CreditsTab({ onPaid }: { onPaid: () => void }) {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCreditPackages().then(setPackages).catch((e) => setError(String(e)));
  }, []);

  async function handleBuy(pkg: CreditPackage) {
    setBusy(true);
    setError(null);
    try {
      const order = await postCreatePaymentOrder(pkg.id, "stripe");
      // 沙箱模式：一键完成
      await postSandboxComplete(order.orderId);
      onPaid();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="state error">{error}</div>;

  return (
    <div className="grid grid-2">
      {packages.map((pkg) => (
        <div key={pkg.id} className="card credit-pkg">
          <h3>{pkg.label}</h3>
          <div className="credit-amount">
            <span className="wallet-icon">💎</span>
            <strong>{pkg.credits}</strong>
            <span>Credits</span>
          </div>
          {pkg.bonus && <span className="badge badge-new">+{pkg.bonus} 赠送</span>}
          <div className="price">¥{(pkg.priceCents / 100).toFixed(2)}</div>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => handleBuy(pkg)}>
            {busy ? "处理中…" : "购买"}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── VIP Tab ──
function VipTab({ wallet, onSubscribe }: { wallet: WalletInfo | null; onSubscribe: () => void }) {
  const [plans, setPlans] = useState<Record<string, { price: number; durationDays: number; coins: number }>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchVipPlans().then(setPlans).catch(() => {});
  }, []);

  async function handleSubscribe(type: "monthly" | "seasonal") {
    setBusy(true);
    try {
      await postSubscribeVip(type);
      onSubscribe();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-2">
      {(Object.entries(plans) as Array<[string, { price: number; durationDays: number; coins: number }]>).map(([type, plan]) => (
        <div key={type} className="card vip-card">
          <h3>{type === "monthly" ? "月卡" : "季卡"}</h3>
          <dl className="kv">
            <div><dt>价格</dt><dd>{plan.price} 💎 Credits</dd></div>
            <div><dt>时长</dt><dd>{plan.durationDays} 天</dd></div>
            <div><dt>每日 Coins</dt><dd>+{plan.coins}</dd></div>
          </dl>
          <ul className="vip-benefits">
            <li>✓ 额外球探名额 ×2</li>
            <li>✓ 训练速度 +20%</li>
            <li>✓ 每日 Coins 奖励</li>
            <li>✓ 专属头像框</li>
          </ul>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || Boolean(wallet && wallet.credits < plan.price)}
            onClick={() => handleSubscribe(type as "monthly" | "seasonal")}
          >
            {busy ? "处理中…" : wallet && wallet.credits < plan.price ? "Credits 不足" : "订阅"}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── 外观 Tab ──
function CosmeticsTab({ wallet, onChanged }: { wallet: WalletInfo | null; onChanged: () => void }) {
  const [items, setItems] = useState<CosmeticItem[]>([]);
  const [owned, setOwned] = useState<OwnedCosmetic[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchCosmetics(filter || undefined).then(setItems).catch(() => {});
    fetchOwnedCosmetics().then(setOwned).catch(() => {});
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  function isOwned(itemId: string) {
    return owned.some((o) => o.itemId === itemId);
  }

  function isEquipped(itemId: string) {
    return owned.some((o) => o.itemId === itemId && o.equipped);
  }

  async function handleBuy(item: CosmeticItem) {
    setBusy(true);
    try {
      await postBuyCosmetic(item.id);
      onChanged();
      load();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function handleEquip(item: CosmeticItem) {
    setBusy(true);
    try {
      await postEquipCosmetic(item.id);
      onChanged();
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row gap" style={{ marginBottom: 12 }}>
        <button className={`btn btn-sm${!filter ? " is-active" : ""}`} onClick={() => setFilter("")}>全部</button>
        <button className={`btn btn-sm${filter === "jersey" ? " is-active" : ""}`} onClick={() => setFilter("jersey")}>球衣</button>
        <button className={`btn btn-sm${filter === "arena_skin" ? " is-active" : ""}`} onClick={() => setFilter("arena_skin")}>球馆</button>
        <button className={`btn btn-sm${filter === "avatar_frame" ? " is-active" : ""}`} onClick={() => setFilter("avatar_frame")}>头像框</button>
      </div>

      <div className="grid grid-2">
        {items.map((item) => {
          const owned = isOwned(item.id);
          const equipped = isEquipped(item.id);
          const color = RARITY_COLORS[item.rarity] || "#a4b0be";
          return (
            <div key={item.id} className="card cosmetic-card" style={{ borderColor: color }}>
              <div className="cosmetic-head">
                <strong>{item.name}</strong>
                <span className="badge" style={{ background: color, color: "#fff" }}>
                  {RARITY_NAMES[item.rarity]}
                </span>
              </div>
              <div className="muted">{TYPE_NAMES[item.type]} · {item.description}</div>
              <div className="cosmetic-price">
                <span>💎 {item.price}</span>
              </div>
              {owned ? (
                equipped ? (
                  <span className="badge badge-big" style={{ background: "#7bed9f" }}>已装备</span>
                ) : (
                  <button type="button" className="btn" disabled={busy} onClick={() => handleEquip(item)}>装备</button>
                )
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || Boolean(wallet && wallet.credits < item.price)}
                  onClick={() => handleBuy(item)}
                >
                  {wallet && wallet.credits < item.price ? "Credits 不足" : "购买"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
