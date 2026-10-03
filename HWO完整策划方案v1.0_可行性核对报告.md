# HWO 完整策划方案 v1.0 — 可行性核对报告

- **核对对象**：`.uploads/8bfb912a-6a27-439a-be9e-c0cd16060565_HWO完整策划方案v1.0.html`
- **核对基准**：当前代码库（`hwo/` monorepo，@hwo/shared + api + worker + web）
- **日期**：2026-10-02

---

## 1. 总结论

**方案总体可行，且与现有代码的产品脉络与技术底座高度一致，无需推翻架构。**

理由：

1. 方案的技术前提（服务器权威、异步批量模拟、确定性 PRNG、每日结算、文字直播 PBP）与现有实现完全吻合；
2. 13 个章节中，§11 三身份与 §12 商业化已基本实现，§2-§6、§8-§10 已有部分实现；真正「从零新建」的只有家族系统（§7，方案自身排在 P2）、公共青年/少年联赛与国家队（§3.3/3.4/3.5）；
3. 模拟算力实测 0.73 ms/场（10,000 场 7.3 秒），方案终态规模（40-50 核心国 + 卫星国 + 青年/少年赛）估算每日约 4,000-5,000 场，单核秒级即可消化，现有 BullMQ worker 并行余量充足；
4. 唯一的结构性分歧是**属性体系 38（方案）vs 17（现有引擎）**，通过「38 项作为展示/成长/球探层、折算为 17 项驱动引擎」的双层方案可低风险解决（详见《属性体系 38→17 映射设计草案》）。

---

## 2. 方案逐章核对表

图例：✅ 已实现 ｜ 🟡 部分实现 ｜ ❌ 未实现

| 方案章节 | 状态 | 现有代码证据 | 差距说明 |
|---|---|---|---|
| §1 定位/核心循环/支柱 | ✅ | 每日战报、异步模拟、长线经营均为现有玩法形态 | 与设计支柱一致，无差距 |
| §2.1 国家三层架构 | 🟡 | World 仅有 `region` 字段（[schema.prisma](file:///workspace/hwo/packages/api/prisma/schema.prisma#L49-L63)），`League.type` 已预留 domestic/international | 五国差异化规则、国家五维属性（热度/人口/经济/青训/商业）未建模 |
| §2.2 首发 5 国差异化规则 | ❌ | 无工资帽类型（软帽/硬帽/财政公平/无帽）区分 | 需新增经济规则配置层 |
| §3.1 国内三角层级联赛 | 🟡 | 现有 League 为线性 `level 1/2`；升降级仅「L1 末 2 降 / L2 前 2 升」（[season.service.ts](file:///workspace/hwo/packages/api/src/season/season.service.ts#L413-L435)） | 需重构为层级树（1.1→2.1/2.2→3.1/3.2…）+ 降级附加赛 + 过渡赛；赛制「2 组 × 6 队双循环」与现有单循环生成器不同 |
| §3.2 国际联赛 32 队三阶段 | ❌ | 仅 `League.type = "international"` 字段就绪 | 分组/TOP 16/LAST 16/升降级赛制需全新实现（P1） |
| §3.3 青年赛 U16-18 | ❌ | Academy 模块只是「俱乐部青训学院」（[academy.service.ts](file:///workspace/hwo/packages/api/src/academy/academy.service.ts#L32-L50)），非公共青年联赛 | 公共联赛 + 每日 54 轮 + 选秀池对接需新建（P1） |
| §3.4 少年赛 U12-15 | ❌ | 无 | 「苗子卡」（仅特质标签无数值）与隐私红线需新建（P2） |
| §3.5 国家队赛事 | ❌ | 无国家队模型 | 全新系统（P2） |
| §4 球员 38 项五层属性 | 🟡 | 引擎为 **17 项能力值**（[types.ts](file:///workspace/hwo/packages/shared/src/types.ts#L14-L36)）+ 特质 + 原型；生成器按位置/tier 直接 roll 17 项（[generators.ts](file:///workspace/hwo/packages/shared/src/generators.ts#L38-L91)） | **结构性分歧**：需 38→17 折算层（见映射草案）；`abilities Json` 存储可容纳扩展 |
| §5 成长与年龄系统 | 🟡 | 五阶段模型 exist（[career.ts](file:///workspace/hwo/packages/shared/src/career.ts#L54-L60)），按「离潜力上限距离」成长 | 方案的「年龄系数 × 成长型 × 敬业度 × 训练师效率 × 出场时间」公式更细，需按 38 项分组重写成长（运动 29 衰退 / 技术 33 衰退 / 心智终身涨 / 静态定型） |
| §6 球探与 Fog of War | 🟡 | fog.ts 已有三级可见性骨架（FogValue/ScoutReport/FoggedPlayer）+ scout 模块 | 四类区域球探系统性偏差未实现；fog 需按 38 项分组展示（当前按 17 项） |
| §7 家族系统（六维/12 型/传承/联姻） | ❌ | 现有 [identity.service.ts](file:///workspace/hwo/packages/api/src/identity/identity.service.ts) 是「经理/化身/职业人」；dynasty 是球员王朝遗产线；PlayerFamily 仅 background 字段 | 六维属性、12 家族类型、代际传承（×0.8）、联姻系统全部新建（方案亦排 P2） |
| §8 经济系统 | 🟡 | wallet/contract/payment/finance 模块存在 | 赞助合同、工资帽五国差异、奢侈税、联赛分红、产业被动收入、破产风险未建模 |
| §9 赛季日历（63 天五线并行） | 🟡 | season 模块 + 单循环赛程 + 每日结算时钟（[schedule.service.ts](file:///workspace/hwo/packages/api/src/season/schedule.service.ts#L16-L42)） | 五线并行（国内二/四/六 + 国际三/日 + 青年/少年每日 + 国家队窗口）+ 63 天关键节点表需重建赛程生成器 |
| §10 事件时间表（8 时段） | ❌ | 仅有单一 `SETTLEMENT_HOUR`（每日 1 个结算时刻） | 需以 Cron 表替代单时钟（00:15 伤愈 / 02:00 赞助 / 09:15 周结算 / 12:15 榜单 / 18:00 批量模拟 / 19:00 发布 / 22:30 伤病 / 23:00 训练） |
| §11 三身份系统 | ✅ | 经理 / Avatar 球员 / 职业人（11 职业）已实现 | 与方案 §11.1 基本一致；§11.2 三条利益冲突需逐条核对补齐 |
| §12 商业化设计 | ✅ | vip / cosmetic / payment 三个模块；F2P + 订阅 + 外观方向一致 | 付费红线为设计约束，技术上兼容 |
| §13.1 P0 首发范围 | 🟡 | 国内联赛、赛季、模拟、文字直播、家族基础已在 | P0 的「38 项完整属性 + OVR 计算」待属性层落地 |
| §13.2-13.3 P1/P2 | ❌ | 大部分未建 | 见第 4 节工作量分级 |
| §13.4 非目标 | ✅ | 无 3D、无实时对战、无抽卡——现有架构天然契合 | 无需改动 |

---

## 3. 关键可行性验证

### 3.1 模拟算力（瓶颈验证）

- 实测数据：确定性引擎 **0.73 ms/场**，10,000 场 7.32 秒（[balance-report.json](file:///workspace/balance-report.json)）；
- 终态规模估算（40-50 核心国三层联赛 + 80 卫星国 NPC + 国际联赛 + 青年/少年联赛）：

| 场景 | 每日比赛场次估算 | 单核耗时估算 |
|---|---|---|
| P0（1 国 L1/L2，24 队） | ~10-20 场 | 毫秒级 |
| P1（+ 国际 32 队 + 青年赛） | ~300-600 场 | < 1 秒 |
| 终态（50 核心国 + 卫星 + 青年 + 少年） | ~4,000-5,000 场 | ~3-4 秒 |

结论：**算力不是瓶颈**，现有 BullMQ 多 worker 并发余量充足。

### 3.2 异步结算模型

方案 §10 的「18:00 批量模拟 → 19:00 发布」即现有模式：每日结算时钟入队 → [worker.ts](file:///workspace/hwo/packages/worker/src/worker.ts) 消费 settle-queue → 结果写回。8 个时段的改造只是把单一时钟换成 Cron 事件表，架构不变。

### 3.3 数据模型

`Player.abilities Json` 可无损容纳方案所需的属性扩展；World/League/Team/Season/Player 核心表齐全；新增系统以「追加迁移」方式落地，不动现有迁移历史（现有确定性/phase5 回归测试可护航）。

---

## 4. 主要差距与工作量分级

| 级别 | 工作项 | 性质 |
|---|---|---|
| P0 补齐 | ① 38 项属性层 + 38→17 折算（见映射草案）② 三角层级联赛重构 + 附加赛/过渡赛 ③ 五线并行赛程生成器 ④ 经济系统补充（赞助/工资帽/奢侈税/分红）⑤ 8 时段 Cron 事件体系 | ②③⑤ 为逻辑重构；① 为数据/展示层重构；④ 为规则层扩展 |
| P1 | 国际联赛三阶段赛制、公共青年联赛 U16-18 + 选秀对接、区域球探偏差、Premium 订阅接通 | 新系统，中等规模 |
| P2 | 家族六维/12 型/代际传承、国家队列、联姻系统、少年赛 U12、联邦选举、第二国解锁 | 新系统，内容量最大 |

---

## 5. 风险清单

| # | 风险 | 等级 | 缓解措施 |
|---|---|---|---|
| R1 | 属性体系重构破坏 sim 平衡 | 高 | 双层映射：引擎保持 17 项不动，38 项只做展示/成长/球探层；改完重跑 balance-batch 与 10,000 场基线（[balance-report.json](file:///workspace/balance-report.json)）比对分布 |
| R2 | 三角层级 + 复杂升降级规则 | 中 | 先以「单国三层」做配置化验证，再扩展多国；用回归测试锁定升降级边界 |
| R3 | 五线并行 63 天赛程生成复杂度 | 中 | 拆成独立的「多线排期引擎」模块，纯函数 + 确定性测试（复用 determinism 测试模式） |
| R4 | 8 时段 Cron 改造触碰结算链路 | 中 | 新增 cron 事件表与旧单时钟并行运行一个赛季，比对结果后再切换 |
| R5 | 家族/联姻系统防滥用（关联账号检测、公示） | 中 | 按方案 P2 排期；联姻前置条件（运营满 1 赛季等）即天然门槛 |
| R6 | 隐私红线（U12 无数值感数据） | 低 | 技术上容易：苗子卡只出特质标签，不出数值字段 |
| R7 | 终态国家数量的内容运营成本 | 低 | NPC 联赛只产赛果与人才，无人值守；算力验证通过 |

---

## 6. 落地路线建议

**先决策、后动工**（需要拍板的两个点）：

- **决策 1（属性）**：接受「38 项为源、17 项为引擎」的双层结构 → 按《属性体系 38→17 映射设计草案》执行；
- **决策 2（联赛）**：三角层级是否首发就做，还是 P0 先维持线性两级、P1 再做层级树（建议前者，因为升降级数据结构要一次到位）。

**推进顺序**：

1. P0-①属性层（不动引擎，风险最低、方案 §13.1 硬性要求）；
2. P0-②③联赛结构与赛程（一次到位，避免二次迁移）；
3. P0-④⑤经济与事件体系（依赖 ③ 的赛程底座）；
4. 平衡复跑 → P0 收口；
5. 按 P1 → P2 顺序推进新系统。

---

## 附录：核对依据文件清单

- 方案文档：`/workspace/.uploads/8bfb912a-6a27-439a-be9e-c0cd16060565_HWO完整策划方案v1.0.html`
- 引擎能力值定义：[types.ts](file:///workspace/hwo/packages/shared/src/types.ts#L14-L36)
- 球员生成器：[generators.ts](file:///workspace/hwo/packages/shared/src/generators.ts#L38-L91)
- 成长系统：[career.ts](file:///workspace/hwo/packages/shared/src/career.ts)
- 球探 fog：[fog.ts](file:///workspace/hwo/packages/shared/src/fog.ts)
- 数据模型：[schema.prisma](file:///workspace/hwo/packages/api/prisma/schema.prisma)
- 升降级：[season.service.ts](file:///workspace/hwo/packages/api/src/season/season.service.ts#L413-L435)
- 赛程与结算时钟：[schedule.service.ts](file:///workspace/hwo/packages/api/src/season/schedule.service.ts#L16-L42)
- 结算 worker：[worker.ts](file:///workspace/hwo/packages/worker/src/worker.ts)
- 平衡基线：[balance-report.json](file:///workspace/balance-report.json)