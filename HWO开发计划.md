# HWO 开发计划（v0.5 → v0.6）

> 更新日期：2026-10-01
> 基于：[三游戏UI调研与HWO借鉴方案](./三游戏UI调研与HWO借鉴方案.md)
> 已完成：7 项　待实施：14 项
> 技术栈：React 18 + TypeScript + Vite（前端）/ NestJS + Prisma + PostgreSQL（后端）

---

## 一、已完成（v0.5 已落地）

| # | 优先级 | 内容 | 落点 |
|:--|:-------|:-----|:-----|
| 1 | P0 | 左侧栏分组导航（球會/人事/比赛） | `App.tsx` + `styles.css` |
| 2 | P0 | 顶栏赛季信息（赛季名/第N日/阶段） | `App.tsx` |
| 3 | P1 | 阵容表格视图（位置筛选+列排序+OVR色） | `TeamPage.tsx` |
| 4 | P1 | 深度图 Depth Chart（5列×N档） | `LineupEditor.tsx` |
| 10 | P2 | 帮助提示气泡 HelpTooltip | `HelpTooltip.tsx` |
| 17 | P5 | OVR 等级色（金/紫/蓝/绿/灰） | `TeamPage.tsx` / `LineupEditor.tsx` |
| — | M4 | 高级战术层（pace/emphasis/screenDef/signatureActions/closerId） | `tactics.ts` / `TacticEditor.tsx` |

---

## 二、待实施开发顺序（按依赖 + ROI 排序）

### 阶段一：体验基础（快速见效，低风险，2 天）

#### Sprint 1.1 — 统一保存机制（#18）⭐ 建议先做
- **内容**：战术页/阵容页顶部加"Save All Changes"按钮 + "Last saved 时间戳" + "未保存变更"指示条；统一各页面保存交互。
- **现状**：`TacticEditor.tsx` 和 `LineupEditor.tsx` 已有 `dirty` 状态和单独保存按钮，但缺少统一的时间戳和"未保存"视觉提示。
- **参考**：JBL 顶部全局保存 + BP "未儲存變更"指示。
- **改动文件**：`TacticEditor.tsx`、`LineupEditor.tsx`、`styles.css`
- **依赖**：无
- **预估**：0.5 天
- **价值**：消除"改了不知道有没有保存"的焦虑，所有页面受益。

#### Sprint 1.2 — 球员状态色体系（#13）
- **内容**：引入 Peak/Good/Tired/Exhausted 四级状态，阵容表格和深度图中用颜色条/图标标记。
- **现状**：sim 引擎已有 `condition.fatigue`（0=满血, 1=力竭）和 `foulTrouble`，但前端无展示；`Player` 模型无 `status` 字段。
- **参考**：RA 球员状态色。
- **改动文件**：
  - 后端：`schema.prisma`（Player 加 `status` 字段，enum: peak/good/tired/exhausted）→ `prisma migrate dev`
  - 后端：`team.service.ts`（计算状态：基于 fatigue + foulTrouble + 近期表现）
  - 前端：`types.ts`（PlayerDetail 加 `status`）、`TeamPage.tsx`（表格列）、`LineupEditor.tsx`（深度图行）
- **依赖**：无
- **预估**：1 天
- **价值**：让疲劳系统可视化，为后续轮替策略打基础。

#### Sprint 1.3 — 球员队长标记 + 新秀标签（#20）
- **内容**：球员加"队长"标记（手动设置，每队1人），阵容页显示队长徽章；新秀标签（Rookie，紫色，基于 age≤22 或 draftPick 关系）。
- **参考**：BP 队长标记 + RA Core/Init 标签。
- **改动文件**：
  - 后端：`schema.prisma`（Team 加 `captainId`；Player 无需加字段，新秀由 age/draftPick 推导）→ `prisma migrate dev`
  - 后端：`team.service.ts`（支持设置队长）
  - 前端：`TeamPage.tsx`（队长徽章 + 新秀标签）、`LineupEditor.tsx`（深度图显示）
- **依赖**：无
- **预估**：0.5 天
- **价值**：低成本，增强阵容管理仪式感。

---

### 阶段二：战术系统深化（核心玩法，6 天）

#### Sprint 2.1 — 战术 Basic/Advanced 切换（#5）
- **内容**：战术页顶部加"基础/进阶"切换 Tab；基础模式只显示预设选择 + 核心参数（节奏/进攻侧重/防守强度），进阶模式显示全部微调项。
- **现状**：`TacticEditor.tsx` 已有完整参数面板，只需加模式切换隐藏部分区域。
- **参考**：RA Tactics 双模式。
- **改动文件**：`TacticEditor.tsx`
- **依赖**：无
- **预估**：0.5 天
- **价值**：降低新手门槛，高级玩家保留完整控制。

#### Sprint 2.2 — 末节策略（#9）⭐
- **内容**：战术页新增"末节策略"区块：
  - 领先时：是否故意犯规、最后一攻选择（压时间/抢攻）
  - 落后时：犯规战术触发阈值（分差≤N 且剩余时间≤M）、全场紧逼开关
- **现状**：sim 引擎已有 `closerId`（关键球执行者）和 `conditionalLineups`（late_game 情境），但缺少故意犯规和最后一攻策略。
- **参考**：BP 球隊戰術末节策略。
- **改动文件**：
  - shared：`types.ts`（TacticModSet 加 `endGameStrategies` 字段）、`tactics.ts`（fillTacticDefaults 补默认）
  - 后端：`tactic.service.ts`（validateModSet 加校验）
  - sim：`sim.ts`（末节情境下应用策略：故意犯规→增加对方罚球；压时间→增加 possessionTimeDelta）
  - 前端：`TacticEditor.tsx`（Advanced 模式下新增末节策略面板）
- **依赖**：#2.1（放在 Advanced 模式下）
- **预估**：1.5 天
- **价值**：补齐比赛最后阶段的策略控制，是经理游戏的关键决策点。

#### Sprint 2.3 — 球场可视化战术板（#6）
- **内容**：战术页加 SVG 半场示意图，用圆点标记球员位置和进攻跑动路线；防守阵型可视化（人盯人/联防的站位）。
- **参考**：RA Tactics 球场板。
- **改动文件**：新建 `TacticBoard.tsx` 组件 + SVG（纯 SVG，不引入图表库）
- **依赖**：无
- **预估**：2 天
- **价值**：战术从"数字滑块"升级为"视觉直观"，大幅提升沉浸感。

#### Sprint 2.4 — Familiarity 熟练度机制（#7）
- **内容**：每个战术选项有熟练度进度条（0-100），随使用场次提升，高熟练度提升战术执行效果（命中率/失误率）。
- **现状**：`TacticModSet.familiarity` 字段已存在，sim 引擎 `TacticalContext.familiarity` 已预计算但**未应用到概率计算**。
- **参考**：JBL Strategy Familiarity 滑块。
- **改动文件**：
  - sim：`sim.ts`（在投篮/失误概率中叠加熟练度修正：熟练度<50 降效 5-15%，>80 增效 3-8%）
  - 后端：比赛结算时累加当前 preset 的熟练度到 `Tactic.modSet.familiarity`
  - 前端：`TacticEditor.tsx`（显示熟练度条 + 解锁提示）
- **依赖**：无
- **预估**：1.5 天
- **价值**：增加战术养成深度，鼓励长期坚持一种打法。

#### Sprint 2.5 — 战术使用率统计可视化（#8）
- **内容**：战术页加"战术使用率"区域：条形图展示本赛季各战术的使用场次和胜率。
- **参考**：JBL Playbook Season Usage。
- **改动文件**：
  - 后端：`MatchResult` 或新表记录每场比赛使用的战术 presetId + 结果
  - 后端：`tactic.controller.ts` 加 `GET /api/tactics/team/:teamId/usage` 接口
  - 前端：`TacticEditor.tsx`（底部加使用率条形图，纯 div 实现）
- **依赖**：#2.4（熟练度数据也来自使用率）
- **预估**：1 天
- **价值**：让玩家看到战术的实际效果，驱动策略调整。

---

### 阶段三：训练与球探（养成深度，6 天）

#### Sprint 3.1 — 训练升级为项目选择 + 字母评级（#11）
- **内容**：训练页改为选择训练项目（投篮/防守/体能/战术/内线等），每项训练后给出字母评级（S/A/B/C/D），评级影响能力成长幅度（S=+3~5, D=+0~1）。
- **现状**：`CareerPage.tsx` 目前是"一键训练"，所有能力均匀成长；后端 `career.service.ts` 的 `trainPlayer` 逻辑简单。
- **参考**：RA Training 字母评级。
- **改动文件**：
  - shared：`career.ts` 加训练项目类型 + 评级计算函数
  - 后端：`career.service.ts`（trainPlayer 改为接收 project 参数，按评级计算成长）
  - 前端：`CareerPage.tsx`（改为项目选择 + 评级展示）或新建 `TrainingPage.tsx`
- **依赖**：无
- **预估**：2 天
- **价值**：训练从"一键训练"升级为"有策略的选择"，增加养成博弈。

#### Sprint 3.2 — 训练进度可视化（#12）
- **内容**：训练页加折线图，展示球员各项能力随训练次数的变化趋势。
- **参考**：BP 跳躍進步图表。
- **改动文件**：
  - 后端：需要记录训练历史（新表 `TrainingLog` 或在 Player 存 Json）
  - 前端：新建 `TrainingChart.tsx`（纯 SVG 折线图，不引入图表库）
- **依赖**：#3.1（需要训练历史数据）
- **预估**：1.5 天
- **价值**：训练效果可视化，增强养成反馈。

#### Sprint 3.3 — 球探发现新秀机制（#14）
- **内容**：球探页每周可发现 1-3 名新秀，显示预估潜力范围（如 70-85 OVR）、性格图标（更衣室炸弹/领袖/勤奋等）；可签约进入青训。
- **参考**：BP Scouting 球探系统。
- **改动文件**：
  - 后端：新建 `scout` 模块（`scoutFindings` 表，含 playerId/potentialRange/personality/expiresAt）
  - 后端：每周生成球探发现（可手动触发）
  - 前端：新建 `ScoutingPage.tsx`（球探发现列表 + 签约操作）
  - 前端：`App.tsx` 导航加"球探"入口
- **依赖**：无
- **预估**：2.5 天
- **价值**：补齐"发现人才"玩法，与选秀/青训形成完整人才获取链。

---

### 阶段四：市场与经济（后期优化，3.5 天）

#### Sprint 4.1 — 自由球员市场聚合技能展示（#16）
- **内容**：市场页球员卡片只显示 4 项聚合技能（运动/投篮/防守/进攻），点击展开查看详情，减少信息过载。
- **参考**：BP Market 聚合技能。
- **改动文件**：
  - 前端：自由球员市场相关页面（需确认是否已存在市场页，当前 `TradePage.tsx` 是交易，自由球员签约在 `contract` API）
  - 前端：`PlayerCard.tsx`（若存在）或新建聚合技能卡片
- **依赖**：无
- **预估**：0.5 天
- **价值**：低成本提升市场页可读性。

#### Sprint 4.2 — 自由球员市场竞价制（#15）
- **内容**：自由球员签约改为竞价制：显示当前报价数、截止期限、最低薪资；多队同时竞价，截止时出价最高者得。
- **参考**：BP Market 竞价系统。
- **改动文件**：
  - 后端：`contract` 服务改为竞价模型（新表 `FreeAgentBid`，含 playerId/teamId/amount/expiresAt）
  - 后端：定时结算竞价（取最高出价）
  - 前端：市场页加竞价 UI（报价输入 + 当前最高 + 倒计时）
- **依赖**：#4.1（先优化展示再改机制）
- **预估**：3 天
- **价值**：市场从"先到先得"升级为"博弈竞价"，显著提升经济系统深度。

---

### 阶段五：排行榜（收尾，1.5 天）

#### Sprint 5.1 — TOP 球员/球队排行榜（#19）
- **内容**：新增排行榜页：MVP 榜（综合能力+数据）、得分榜、篮板榜、助攻榜、球队战力榜。
- **参考**：BP 排行榜。
- **改动文件**：
  - 后端：`season.service.ts` 或新建 `stats` 模块，从 `MatchResult.boxScore` 聚合球员数据
  - 前端：新建 `LeaderboardPage.tsx`（多 Tab 切换榜单）
  - 前端：`App.tsx` 导航加"排行榜"入口
- **依赖**：无
- **预估**：1.5 天
- **价值**：给玩家纵向比较目标，增强长期动力。

---

## 三、依赖关系图

```
阶段一（基础）
  #18 保存机制 ──────────────┐
  #13 状态色 ────────────────┤ 所有页面受益
  #20 队长标记 ──────────────┘

阶段二（战术）
  #5 Basic/Advanced ──► #9 末节策略
  #6 战术板（独立）
  #7 熟练度 ──────────► #8 使用率统计
                         │
阶段三（养成）             ▼
  #11 训练项目 ──────► #12 训练进度图
  #14 球探（独立）

阶段四（市场）
  #16 聚合展示 ──────► #15 竞价制

阶段五（排行）
  #19 排行榜（独立）
```

---

## 四、建议执行节奏

| 周次 | 内容 | 交付 |
|:-----|:-----|:-----|
| **Week 1** | 阶段一全部（#18 #13 #20） | 保存机制 + 状态色 + 队长标记 |
| **Week 2** | 阶段二前半（#5 #9 #6） | 战术双模式 + 末节策略 + 战术板 |
| **Week 3** | 阶段二后半（#7 #8） | 熟练度 + 使用率统计 |
| **Week 4** | 阶段三（#11 #12 #14） | 训练升级 + 进度图 + 球探 |
| **Week 5** | 阶段四（#16 #15） | 市场聚合 + 竞价制 |
| **Week 6** | 阶段五（#19）+ 回归测试 | 排行榜 + 全量回归 |

---

## 五、技术注意事项

1. **后端字段变更**：#13/#20/#7/#14/#15 涉及 Prisma schema 变更，需同步 `prisma migrate dev` + `prisma generate`。
2. **shared 包**：战术类型（#9 末节策略）需先在 `@hwo/shared` 定义，前后端共用。
3. **sim 引擎**：#9（末节策略）和 #7（熟练度）需修改 `sim.ts`，注意保持纯函数特性（不引入副作用）。
4. **图表选型**：#12/#8/#19 可先用纯 SVG 条形图/折线图，避免引入重型图表库（如需可考虑 recharts）。
5. **测试**：每个 Sprint 结束跑 `pnpm test` 确保无回归；sim 引擎改动需跑 `shared/tests/determinism.test.ts`。
6. **环境**：沙箱会重置，PostgreSQL/node_modules 可能丢失，开发前先确认 `pnpm dev` 正常。
7. **类型同步**：前端 `web/src/types.ts` 与 shared 类型需保持一致，PlayerDetail 等 API 契约类型需手动同步新增字段。

---

## 六、风险与缓解

| 风险 | 影响 | 缓解 |
|:-----|:-----|:-----|
| sim 引擎改动破坏确定性 | 比赛结果不可复现 | 每次改 sim 后跑 determinism 测试 |
| Prisma migration 冲突 | 数据库无法迁移 | 每个 Sprint 单独 migrate，避免多个 schema 变更合并 |
| 竞价制定时任务 | 需引入 cron/定时 | 初期用手动结算或 API 触发，后续加 @nestjs/schedule |
| 球探数据膨胀 | 数据库增长 | scoutFindings 加 expiresAt，定期清理过期发现 |
