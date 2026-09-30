/**
 * TacticBoard —— 球场可视化战术板
 *
 * 用 SVG 渲染半场俯视图，根据战术参数动态展示：
 * - 球员站位（由 offenseFocus 决定）
 * - 出手热区（由 tendencyMod 决定，颜色越深出手权重越高）
 * - 教练标志性动作（高亮对应区域）
 *
 * 纯展示组件，不触发网络请求。
 */

import type { PlaybookAction, TacticModSet } from "../types";

interface Props {
  modSet: TacticModSet;
  /** 球场宽度（px），高度按比例自适应 */
  width?: number;
}

// 半场尺寸（英尺）：宽 50，长 47（底线到中线）
// 映射到 SVG viewBox: 0 0 300 282（6:1 比例）
const COURT_W = 300;
const COURT_H = 282;
const BASKET_X = COURT_W / 2;
const BASKET_Y = COURT_H - 38; // 距底线 4 英尺

/** 各进攻侧重对应的 5 名球员站位（x, y 为 SVG 坐标） */
const POSITION_LAYOUTS: Record<string, Array<{ x: number; y: number; pos: string }>> = {
  // 五外站位
  outside: [
    { x: 40, y: 120, pos: "SF" },
    { x: 260, y: 120, pos: "SG" },
    { x: 150, y: 70, pos: "PG" },
    { x: 80, y: 190, pos: "PF" },
    { x: 220, y: 190, pos: "C" },
  ],
  // 内线收缩
  inside: [
    { x: 90, y: 160, pos: "SF" },
    { x: 210, y: 160, pos: "SG" },
    { x: 150, y: 110, pos: "PG" },
    { x: 110, y: 230, pos: "PF" },
    { x: 190, y: 230, pos: "C" },
  ],
  // 突破空间
  drive: [
    { x: 60, y: 150, pos: "SF" },
    { x: 240, y: 150, pos: "SG" },
    { x: 150, y: 60, pos: "PG" },
    { x: 100, y: 215, pos: "PF" },
    { x: 200, y: 215, pos: "C" },
  ],
  // 挡拆：两名球员在高位
  pnr: [
    { x: 70, y: 140, pos: "SF" },
    { x: 230, y: 140, pos: "SG" },
    { x: 130, y: 80, pos: "PG" },
    { x: 170, y: 110, pos: "PF" },
    { x: 150, y: 210, pos: "C" },
  ],
  // 碾压：内线扎堆
  bully: [
    { x: 80, y: 145, pos: "SF" },
    { x: 220, y: 145, pos: "SG" },
    { x: 150, y: 95, pos: "PG" },
    { x: 120, y: 220, pos: "PF" },
    { x: 180, y: 220, pos: "C" },
  ],
  // 均衡
  balanced: [
    { x: 55, y: 135, pos: "SF" },
    { x: 245, y: 135, pos: "SG" },
    { x: 150, y: 75, pos: "PG" },
    { x: 95, y: 205, pos: "PF" },
    { x: 205, y: 205, pos: "C" },
  ],
};

/** 热区定义：每个区域对应一个出手类型，中心坐标 + 半径 */
interface HeatZone {
  key: keyof TacticModSet["tendencyMod"];
  cx: number;
  cy: number;
  r: number;
  label: string;
}

const HEAT_ZONES: HeatZone[] = [
  { key: "three", cx: 150, cy: 50, r: 42, label: "三分" },
  { key: "midrange", cx: 150, cy: 130, r: 38, label: "中投" },
  { key: "inside", cx: 150, cy: 215, r: 28, label: "篮下" },
  { key: "drive", cx: 150, cy: 170, r: 30, label: "突破" },
  { key: "postup", cx: 110, cy: 220, r: 22, label: "背打" },
];

/** 标志性动作 → 高亮标注位置 */
const ACTION_SPOTS: Partial<Record<PlaybookAction, { x: number; y: number; label: string }>> = {
  pnr_ball_handler: { x: 130, y: 90, label: "挡拆持球" },
  pnr_roll_man: { x: 170, y: 150, label: "顺下" },
  isolation: { x: 150, y: 100, label: "单打" },
  post_up: { x: 110, y: 215, label: "低位" },
  spot_up: { x: 55, y: 140, label: "接球投" },
  transition: { x: 150, y: 40, label: "快攻" },
  cut: { x: 190, y: 180, label: "空切" },
  hand_off: { x: 130, y: 110, label: "手递手" },
  off_screen: { x: 210, y: 130, label: "无球掩护" },
  putback: { x: 180, y: 220, label: "补篮" },
  second_chance: { x: 150, y: 230, label: "二次进攻" },
};

/** 将 tendencyMod 值（-1 ~ 1）映射到透明度（0 ~ 0.7） */
function heatOpacity(v: number): number {
  const t = (v + 1) / 2; // 0~1
  return Math.round(t * 70) / 100;
}

export function TacticBoard({ modSet, width = 300 }: Props) {
  const focus = modSet.offenseFocus ?? "balanced";
  const layout = POSITION_LAYOUTS[focus] ?? POSITION_LAYOUTS.balanced;
  const signatureSet = new Set(modSet.signatureActions ?? []);

  return (
    <div className="tactic-board" style={{ width }}>
      <svg
        viewBox={`0 0 ${COURT_W} ${COURT_H}`}
        width={width}
        height={(width * COURT_H) / COURT_W}
        className="tactic-board-svg"
      >
        {/* 球场底色 */}
        <rect x={0} y={0} width={COURT_W} height={COURT_H} fill="#f5ecd7" rx={6} />

        {/* 中线 */}
        <line
          x1={0} y1={COURT_H / 2}
          x2={COURT_W} y2={COURT_H / 2}
          stroke="#b8a878" strokeWidth={1.5} strokeDasharray="4 3"
        />

        {/* 三分线（弧） */}
        <path
          d={`M 30 ${BASKET_Y} Q 150 ${BASKET_Y - 110} 270 ${BASKET_Y}`}
          fill="none" stroke="#b8a878" strokeWidth={1.5}
        />
        {/* 三分线底角延伸 */}
        <line x1={0} y1={BASKET_Y} x2={30} y2={BASKET_Y} stroke="#b8a878" strokeWidth={1.5} />
        <line x1={270} y1={BASKET_Y} x2={300} y2={BASKET_Y} stroke="#b8a878" strokeWidth={1.5} />

        {/* 罚球线 + 禁区 */}
        <rect
          x={COURT_W / 2 - 50} y={BASKET_Y - 70}
          width={100} height={70}
          fill="none" stroke="#b8a878" strokeWidth={1.5}
        />
        <line
          x1={COURT_W / 2 - 50} y1={BASKET_Y - 70}
          x2={COURT_W / 2 + 50} y2={BASKET_Y - 70}
          stroke="#b8a878" strokeWidth={1.5}
        />

        {/* 篮筐 */}
        <circle cx={BASKET_X} cy={BASKET_Y} r={6} fill="none" stroke="#d63031" strokeWidth={2} />
        <line
          x1={BASKET_X} y1={BASKET_Y + 6}
          x2={BASKET_X} y2={BASKET_Y + 14}
          stroke="#d63031" strokeWidth={1.5}
        />

        {/* 出手热区 */}
        {HEAT_ZONES.map((z) => {
          const val = modSet.tendencyMod[z.key] ?? 0;
          const op = heatOpacity(val);
          return (
            <g key={z.key}>
              <circle
                cx={z.cx} cy={z.cy} r={z.r}
                fill="#e74c3c"
                fillOpacity={op}
              />
              {op > 0.2 && (
                <text
                  x={z.cx} y={z.cy + 3}
                  textAnchor="middle"
                  fontSize={9}
                  fill={op > 0.45 ? "#fff" : "#7f8c8d"}
                  fontWeight={600}
                >
                  {z.label}
                </text>
              )}
            </g>
          );
        })}

        {/* 球员站位 */}
        {layout.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x} cy={p.y} r={10}
              fill="#2d3436"
              stroke="#fff" strokeWidth={2}
            />
            <text
              x={p.x} y={p.y + 3}
              textAnchor="middle"
              fontSize={9}
              fill="#fff"
              fontWeight={700}
            >
              {p.pos}
            </text>
          </g>
        ))}

        {/* 标志性动作标注 */}
        {Array.from(signatureSet).map((a) => {
          const spot = ACTION_SPOTS[a];
          if (!spot) return null;
          return (
            <g key={a}>
              <circle
                cx={spot.x} cy={spot.y} r={5}
                fill="#f39c12" stroke="#fff" strokeWidth={1}
              />
              <text
                x={spot.x} y={spot.y - 7}
                textAnchor="middle"
                fontSize={8}
                fill="#e67e22"
                fontWeight={600}
              >
                {spot.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* 图例 */}
      <div className="tactic-board-legend">
        <div className="tbl-item">
          <span className="tbl-dot" style={{ background: "#e74c3c" }} />
          <span>出手热区（越深权重越高）</span>
        </div>
        <div className="tbl-item">
          <span className="tbl-dot" style={{ background: "#2d3436" }} />
          <span>球员站位</span>
        </div>
        <div className="tbl-item">
          <span className="tbl-dot" style={{ background: "#f39c12" }} />
          <span>标志性动作</span>
        </div>
      </div>
    </div>
  );
}
