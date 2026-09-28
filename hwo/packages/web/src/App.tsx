/**
 * Demo 组件——fetch /api/sim/demo，展示比分与 PBP 前几条。
 * 证明前后端类型共享（@hwo/shared 的 SimOutput）+ 联通。
 */

import { useEffect, useState } from "react";
import type { SimOutput } from "@hwo/shared";

export function App() {
  const [data, setData] = useState<SimOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sim/demo")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SimOutput>;
      })
      .then((out) => {
        if (!cancelled) setData(out);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div style={{ color: "crimson" }}>加载失败：{error}</div>;
  if (!data) return <div>加载中…</div>;

  const pbpPreview = data.pbp.slice(0, 5);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>HWO Demo</h1>
      <p>
        比分：<strong>{data.result.homeScore}</strong> :{" "}
        <strong>{data.result.awayScore}</strong>（胜方：{data.result.winnerId}）
      </p>
      <h2>PBP（前 5 条）</h2>
      <ul>
        {pbpPreview.map((ev, i) => (
          <li key={i}>
            Q{ev.quarter} {ev.clock} — {ev.desc}
          </li>
        ))}
      </ul>
      <p style={{ color: "#888" }}>seed={data.seed}</p>
    </main>
  );
}
