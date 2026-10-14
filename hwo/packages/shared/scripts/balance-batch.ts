#!/usr/bin/env node
/**
 * sim 海量自动对局批量回归 CLI（M5 §6.1 平衡调参）
 *
 * 用途：
 *   - 在 CI / 调参阶段跑 N 场 sim（默认 10000，可调到 10 万）
 *   - 输出分布校验报告（HTML + JSON）
 *   - 验证 sim 引擎在大批量调用下的稳定性
 *
 * 用法：
 *   pnpm --filter @hwo/shared exec tsx scripts/balance-batch.ts --count 100000
 *   pnpm --filter @hwo/shared exec tsx scripts/balance-batch.ts --count 10000 --out /workspace/balance-report.html
 */

import { runBalanceBatch, summarizeBatch, statSummary, NBA_REAL_RANGES } from "../src/index.js";

interface CliArgs {
  count: number;
  outHtml: string;
  outJson: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    count: 10_000,
    outHtml: "/workspace/balance-report.html",
    outJson: "/workspace/balance-report.json",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--count" && argv[i + 1]) {
      args.count = parseInt(argv[i + 1]!, 10);
      i++;
    } else if (a === "--out" && argv[i + 1]) {
      args.outHtml = argv[i + 1]!;
      i++;
    } else if (a === "--out-json" && argv[i + 1]) {
      args.outJson = argv[i + 1]!;
      i++;
    }
  }
  return args;
}

function buildHtmlReport(stats: ReturnType<typeof runBalanceBatch>, report: ReturnType<typeof summarizeBatch>): string {
  const scoreSummary = statSummary(stats.teamScores);
  const fgSummary = statSummary(stats.fgPcts);
  const rebSummary = statSummary(stats.rebounds);

  const totalGames = stats.homeWins + stats.awayWins;
  const homeWinRate = totalGames > 0 ? (stats.homeWins / totalGames * 100).toFixed(1) : "0";
  const otRate = (stats.otGames / Math.max(stats.gamesPlayed, 1) * 100).toFixed(2);

  // 直方图 top 10 桶
  const buckets = Object.entries(stats.scoreHistogram)
    .map(([b, c]) => ({ bucket: parseInt(b, 10), count: c }))
    .sort((a, b) => a.bucket - b.bucket);
  const maxBucket = Math.max(...buckets.map((b) => b.count), 1);
  const histogramBars = buckets.map((b) => {
    const pct = (b.count / maxBucket * 100).toFixed(1);
    return `<div class="bar"><span class="lbl">${b.bucket}-${b.bucket + 4}</span><div class="fill" style="width:${pct}%"></div><span class="cnt">${b.count}</span></div>`;
  }).join("");

  const checkRows = report.checks.map((c) => {
    const cls = c.passed ? "pass" : "fail";
    const sym = c.passed ? "✓" : "✗";
    return `<tr class="${cls}"><td>${sym} ${c.metric}</td><td>${c.mean.toFixed(3)}</td><td>${c.ideal}</td><td>[${c.rangeMin}, ${c.rangeMax}]</td><td>${c.note}</td></tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>sim 平衡分布报告 · ${stats.gamesPlayed} 场</title>
<style>
  body{background:#0b0f17;color:#e6edf6;font-family:-apple-system,"PingFang SC",sans-serif;padding:30px;line-height:1.6}
  h1{color:#22d3ee;border-bottom:1px solid #26324a;padding-bottom:12px}
  .summary{background:#141b26;border:1px solid #26324a;border-radius:10px;padding:18px 22px;margin:18px 0}
  .summary.${report.allPassed ? "pass" : "fail"}{border-left:4px solid ${report.allPassed ? "#4ade80" : "#ef4444"}}
  table{width:100%;border-collapse:collapse;margin:18px 0;font-size:14px}
  th,td{padding:10px 12px;border:1px solid #26324a;text-align:left}
  th{background:#1b2433}
  tr.pass{color:#4ade80}
  tr.fail{color:#ef4444;background:rgba(239,68,68,.05)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:18px 0}
  .card{background:#1b2433;border:1px solid #26324a;border-radius:10px;padding:14px 16px}
  .card .v{font-size:24px;color:#22d3ee;font-weight:700}
  .card .l{font-size:12px;color:#9fb0c7;margin-top:4px}
  .histogram{background:#1b2433;border:1px solid #26324a;border-radius:10px;padding:18px;margin:18px 0}
  .bar{display:flex;align-items:center;margin:4px 0;font-size:13px}
  .bar .lbl{width:80px;color:#9fb0c7}
  .bar .fill{background:linear-gradient(90deg,#4ade80,#22d3ee);height:18px;border-radius:3px;margin:0 8px}
  .bar .cnt{color:#e6edf6;width:60px;text-align:right}
  code{background:#0d131d;padding:2px 6px;border-radius:4px;color:#fbbf24}
</style>
</head>
<body>
<h1>sim 平衡分布报告 <span style="font-size:18px;color:#9fb0c7">M5 §6.1</span></h1>

<div class="summary ${report.allPassed ? "pass" : "fail"}">
  <strong>${report.summary}</strong><br>
  <span style="color:#9fb0c7">总场次: ${stats.gamesPlayed} | 错误: ${stats.errors} | 平均耗时: ${stats.avgMs.toFixed(2)}ms/场</span>
</div>

<div class="grid">
  <div class="card"><div class="v">${stats.gamesPlayed}</div><div class="l">总场数</div></div>
  <div class="card"><div class="v">${stats.errors}</div><div class="l">错误数</div></div>
  <div class="card"><div class="v">${stats.avgMs.toFixed(2)}ms</div><div class="l">平均单场耗时</div></div>
  <div class="card"><div class="v">${otRate}%</div><div class="l">加时赛比例</div></div>
  <div class="card"><div class="v">${homeWinRate}%</div><div class="l">主场胜率</div></div>
  <div class="card"><div class="v">${scoreSummary.mean.toFixed(1)}</div><div class="l">平均得分（NBA 理想 ${NBA_REAL_RANGES.teamScore.ideal}）</div></div>
  <div class="card"><div class="v">${(fgSummary.mean * 100).toFixed(1)}%</div><div class="l">平均投篮命中率（NBA ${NBA_REAL_RANGES.fgPct.ideal * 100}%）</div></div>
  <div class="card"><div class="v">${rebSummary.mean.toFixed(1)}</div><div class="l">平均篮板（NBA ${NBA_REAL_RANGES.rebounds.ideal}）</div></div>
</div>

<h2>分布校验明细</h2>
<table>
  <thead><tr><th>指标</th><th>实际均值</th><th>理想值</th><th>合理区间</th><th>评估</th></tr></thead>
  <tbody>${checkRows}</tbody>
</table>

<h2>得分分布直方图</h2>
<div class="histogram">${histogramBars}</div>

<h2>性能预算</h2>
<table>
  <thead><tr><th>指标</th><th>实际</th><th>预算</th><th>状态</th></tr></thead>
  <tbody>
    <tr class="${stats.avgMs < 50 ? "pass" : "fail"}">
      <td>单场 sim 平均耗时</td>
      <td>${stats.avgMs.toFixed(2)}ms</td>
      <td>≤ 50ms</td>
      <td>${stats.avgMs < 50 ? "✓ 通过" : "✗ 超预算"}</td>
    </tr>
    <tr class="${stats.errors === 0 ? "pass" : "fail"}">
      <td>无 sim 错误</td>
      <td>${stats.errors}</td>
      <td>0</td>
      <td>${stats.errors === 0 ? "✓ 通过" : "✗ 有错误"}</td>
    </tr>
  </tbody>
</table>

<footer style="margin-top:40px;padding-top:14px;border-top:1px solid #26324a;color:#6b7c97;font-size:13px">
  HWO sim 平衡批量回归 · 生成于 ${new Date().toISOString()} · ${stats.gamesPlayed} 场自动对局
</footer>
</body>
</html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[balance-batch] 启动 ${args.count} 场 sim 自动对局...`);

  const t0 = Date.now();
  const stats = runBalanceBatch(args.count);
  const elapsed = (Date.now() - t0) / 1000;
  const report = summarizeBatch(stats);

  console.log(`[balance-batch] 完成 ${stats.gamesPlayed} 场，耗时 ${elapsed.toFixed(1)}s (${stats.avgMs.toFixed(2)}ms/场)`);
  console.log(`[balance-batch] ${report.summary}`);
  for (const c of report.checks) {
    const sym = c.passed ? "✓" : "✗";
    console.log(`  ${sym} ${c.metric}: mean=${c.mean.toFixed(3)} ideal=${c.ideal} range=[${c.rangeMin}, ${c.rangeMax}] → ${c.note}`);
  }

  // 写 HTML 报告
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir("/workspace", { recursive: true });

  const html = buildHtmlReport(stats, report);
  await writeFile(args.outHtml, html, "utf8");
  console.log(`[balance-batch] HTML 报告: ${args.outHtml}`);

  // 写 JSON 报告
  const jsonReport = {
    generatedAt: new Date().toISOString(),
    gamesPlayed: stats.gamesPlayed,
    errors: stats.errors,
    avgMs: stats.avgMs,
    elapsedSeconds: elapsed,
    otRate: stats.otGames / Math.max(stats.gamesPlayed, 1),
    homeWinRate: stats.homeWins / Math.max(stats.homeWins + stats.awayWins, 1),
    scoreSummary: statSummary(stats.teamScores),
    fgPctSummary: statSummary(stats.fgPcts),
    threePctSummary: statSummary(stats.threePcts),
    ftPctSummary: statSummary(stats.ftPcts),
    reboundsSummary: statSummary(stats.rebounds),
    assistsSummary: statSummary(stats.assists),
    turnoversSummary: statSummary(stats.turnovers),
    checks: report.checks,
    allPassed: report.allPassed,
    scoreHistogram: stats.scoreHistogram,
  };
  await writeFile(args.outJson, JSON.stringify(jsonReport, null, 2), "utf8");
  console.log(`[balance-batch] JSON 报告: ${args.outJson}`);

  if (!report.allPassed) {
    console.error("[balance-batch] ✗ 校验未全部通过，平衡被破坏！");
    process.exit(1);
  }
  console.log("[balance-batch] ✓ 全部校验通过");
}

main().catch((e) => {
  console.error("[balance-batch] 失败:", e);
  process.exit(1);
});
