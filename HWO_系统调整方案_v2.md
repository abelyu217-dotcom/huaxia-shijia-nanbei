# HWO 系统调整方案 v2（基于真实参考细节）

> 已用浏览器抓取 basketpulse.com 与 playrimattack.com 真实页面，本方案的列结构、配色、组件均直接对齐参考站，可落地实施。
> 测试账号已就绪：**邮箱 `test@hwo.test` / 密码 `test12345`**（已绑"天津津门棕熊"队），前端 http://localhost:5173 已验证可登录进入管理页。

---

## 〇、参考站真实细节（已抓取）

### basketpulse 财务页 `/hk/finances`
- **现金余额**：219,614 Eu 白色大字，置于深蓝色卡片
- **配色**：深蓝主背景、白色文字、收入绿色、支出红色
- **收支表**：3 列 — 日期 / 描述 / 数量
- **时间选择**：顶部"週"选择器，如 `週 7 · 賽季112`
- **结构**：余额卡 → 收入分类汇总 → 支出分类汇总 → 流水表

### basketpulse 球员统计页 `/hk/Players/statistics`
- **列顺序**（精确）：姓名 / No. / 分鐘 / 比賽 / 得分 / 2% / 3% / 1% / 籃(攻/防/總/被) / 助攻 / 搶截 / 犯規(被/犯) / 失誤 / 封阻(封/被) / 效率
- 命中率以百分比数字展示（保留 HWO 命中率配色：≥50% 绿 / 35-50% 黄 / <35% 红）
- 表格底部"合計"行：本队合计 vs 对手合计对比
- 深色主题表格

### basketpulse 训练中心 `/hk/Training/overview`
- **顶部球员卡**：姓名、年龄、身高、潜力值
- **训练重心选择器**：下拉框（如"籃板"），单球员单能力训练
- **主区域**：球员详细训练数据 — RT（rating）/ 狀態 / 健康 / 各项能力值
- 单球员视图（非整队表格）

### basketpulse 球员技能页 `/hk/Players/skills`
- **列顺序**：姓名 / No. / 年齡 / 高 / 位置 / RT / 潛 / 健康 / 彈 / 速 / 壯 / 近 / 中 / 3 / 籃 / 擾 / 防 / 運 / 傳 / 攻 / 經
- 能力值用数字+颜色编码（高数值亮色，低数值暗色）
- RT 与潜力（潛）独立成列

### playrimattack 核心球员 `/#/core`
- **顶部横幅**：赛季状态 + 球队信息
- **球员卡片**：头像 / 球衣号 / OVR / TRV(trade value) / 位置 / 身高 / 年龄 / 健康 / 合同 / 特质
- **生涯数据表格**：赛季 / GP / MIN / PTS 等列
- **27 项能力值分组**：身体 / 投射 / 防守 / 控球 / 心理（每类含若干细分能力）

---

## 一、概览模块

### 1.1 三项调整

| 调整 | 实施 |
|------|------|
| 去"推进一日"按钮 | 后端新增 `WorldClockScheduler`（NestJS `@Cron` 或 `setInterval`），按配置速率（默认 1 秒 = 1 赛季分钟）自动调用现有 `season.advanceDay()`。前端移除按钮，顶部显示世界时钟（赛季 X 日 · 联赛阶段 · 阶段进度条）。 |
| 去"AI 经理"按钮 | day 切换时由后端 `AiManagerService` 自动调用（已存在 `AiManagerModule`），无需用户介入。前端按钮删除。 |
| 去"今日赛程"，加"球队资讯" | "今日赛程"模块删除，改为 `TeamNewsFeed` 组件，按时间线展示本队当天发生的事件。 |

### 1.2 球队资讯（TeamNewsFeed）数据来源

每天 day 切换后由 `TeamNewsService` 聚合以下事件写入 `TeamNews` 表，前端按时间倒序展示：

1. 比赛结果（标题如"第 1 日 95:88 胜 深圳海岸鲨鱼"，正文含关键球员 PBP 高光）
2. 训练成果（"韩一鸣 训练效果 +1.2 弹跳"，链接 TrainingLog）
3. 伤病/状态变化（疲劳累积、退役）
4. 转会动态（签约、裁员、交易完成 — 链接 TradeOffer）
5. 合同状态（续约、到期预警 — 链接 Contract）
6. 财务变动（大额收支、赞助商变化 — 链接 CashLedger）
7. 董事会动作（提案通过/否决 — 链接 BoardProposal）
8. 球迷反馈（情绪波动 — 链接 FanEvent）
9. 青训学院产出
10. 设施升级完成

每条资讯字段：`id / teamId / seasonId / day / category / title / content / refId / createdAt`，前端可点击跳转。

---

## 二、财务模块（对齐 basketpulse `/hk/finances`）

### 2.1 球队现金账户（新增）

```prisma
model TeamCash {
  id        String   @id @default(cuid())
  teamId    String   @unique
  balance   Int      @default(5_000_000)  // 当前余额（元）
  sponsorTier String  @default("C")      // D<C<B<A<S
  ticketPrice Int    @default(50)        // 票价基准
  debt      Int      @default(0)         // 负债
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 2.2 真实流水（CashLedger）

```prisma
model CashLedger {
  id        String   @id @default(cuid())
  teamId    String
  seasonId  String
  day       Int
  category  String   // sponsor | ticket | broadcast | salary | staff | facility | academy | transfer | fine | other
  subType   String   // main_sponsor / kit_sponsor / home_game / player_salary ...
  amount    Int      // 正=收入 负=支出
  refId     String?  // 关联实体 ID
  note      String?
  createdAt DateTime @default(now())
  @@index([teamId, seasonId, day])
  @@index([teamId, category])
}
```

**每日结算**（`FinanceService.runDaily(teamId, day)`）：

| 分类 | 子类 | 计算依据 |
|------|------|---------|
| sponsor | main_sponsor | `Sponsor.basePerSeason / 赛季天数` |
| sponsor | kit_sponsor | 同上 |
| sponsor | win_bonus | 当日胜场 × `Sponsor.bonusPerWin` |
| ticket | home_game | 主场赛 `fanCount × 上座率(fanMorale) × ticketPrice × arenaLv系数` |
| ticket | away_share | 客场赛 主场馆收入 × 10% |
| broadcast | league_share | 赛季固定 + 战绩奖金 |
| salary | player_salary | `Σ Player.salary / 赛季天数` |
| staff | staff_salary | `Σ Professional(employerTeamId) 月薪 / 30` |
| facility | maintenance | `(trainingHallLv + arenaLv) × 维护基数` |
| academy | invest | 升级/产出时入账 |
| transfer | fee_in / fee_out | TradeOffer 现金 |
| fine | league_fine | 联盟处罚事件 |

### 2.3 前端财务页（对齐 basketpulse 布局）

```
┌─────────────────────────────────────────────────┐
│ [深蓝卡片] 当前现金 ¥5,234,890                   │  ← 白色大字
│ 本日净 +12,300 · 本周净 +84,500 · 本赛季净 +1.2M │
├─────────────────────────────────────────────────┤
│ [週选择器] 週 1 · 賽季 1  ◀ ▶                   │  ← basketpulse 风格
├─────────────────────────────────────────────────┤
│ 收入分类 (绿色)              支出分类 (红色)     │
│  主赞助商 +120,000           球员薪资 -180,000   │
│  装备赞助 +30,000            职员薪资 -45,000    │
│  主场票务 +85,000            设施维护 -8,000     │
│  客场分红 +8,500             青训投入 -10,000    │
│  转播分成 +50,000            ...                 │
├─────────────────────────────────────────────────┤
│ 流水表 (3列: 日期 / 描述 / 数量)                 │
│  Day 1 · 主赞助商分成       +120,000             │
│  Day 1 · 球员日薪（10人）   -180,000             │
│  Day 1 · 主场票务(胜)      +85,000              │
│  ...                                              │
│ [筛选: 全部 / 收入 / 支出] [导出 CSV]            │
└─────────────────────────────────────────────────┘
```

支持三种视图切换：每日 / 每周 / 每赛季（与 basketpulse "週"选择器一致）。

### 2.4 钱包中"游戏币"用途澄清

**现状**：`User.coins` 与 `User.credits` 两套币。

**澄清**（待用户确认）：
- **现金（TeamCash.balance）** — 球队经营币，用于薪资、转会、设施、青训等所有球队运营支出
- **游戏币（User.coins）** — 经理个人增值币，仅用于：VIP 订阅、外观购买（球衣/球场地皮/头像框）、加速类增值服务（不影响竞技公平）
- **信用点（User.credits）** — 充值币，由真实货币购买，兑换为游戏币或购买稀有外观

建议将 `coins` 改名为 `managerPoints`（经理点数），与球队现金彻底分离，避免用户混淆。

### 2.5 球员合同去掉（待确认）

用户原文："4、球员合同去掉"。两种解读：

- **解读 A（推荐）**：财务页不再单列"球员合同"为独立支出项，球员薪资归入 `salary / player_salary`；合同管理（续约/裁员/年限）保留在球员名单下"合同管理"Tab，不影响财务展示。
- **解读 B**：完全删除合同系统，球员仅保留 `Player.salary` 字段，无年限/续约/裁员。

请确认采用哪种解读。**默认采用 A**。

---

## 三、董事会模块

### 3.1 赞助商满意度（Sponsor.satisfaction，非假数据）

```prisma
model Sponsor {
  id        String   @id @default(cuid())
  teamId    String
  type      String   // main | kit | arena | broadcast
  name      String
  tier      String   // D | C | B | A | S
  basePerSeason Int
  bonusPerWin   Int
  titleBonus    Int
  satisfaction  Int   @default(60)  // 0-100
  expectedWinRate Float @default(0.5)
  expectedPlayoff Boolean @default(true)
  contractSeasons Int @default(2)
  startSeason Int
  endSeason   Int?
  createdAt DateTime @default(now())
  @@index([teamId])
}
```

**满意度计算公式**（每日结算，所有项均有数据依据）：

```
satisfaction = clamp(
    50                                                          // 基准
  + (近10场胜率 - expectedWinRate) × 100 × 0.4                  // 战绩分
  + (本队 MediaNews 条数 - 联盟均值) × 0.5                       // 媒体曝光分
  + (fanMorale - 50) × 0.3                                       // 球迷士气分
  - 罚款次数(本季) × 10                                          // 处罚扣分
  - 阵容大变动次数(本季) × 5                                     // 频繁裁员扣分
, 0, 100)
```

**档位行为**：
- < 30：合同终止（生成 `TeamMessage(sponsor, type=terminated)`）
- 30-50：警告（生成 `TeamMessage(sponsor, type=warning)`）
- 50-80：正常
- > 80：续约涨薪（自动生成新 Sponsor 记录）

### 3.2 赛季目标（SeasonGoal，有制定依据）

```prisma
model SeasonGoal {
  id        String   @id @default(cuid())
  teamId    String
  seasonId  String
  season    Int
  expectedWinRate   Float
  expectedPlayoff   Boolean
  expectedChampionship Boolean
  expectedRank      Int?
  basisNote  String   // 依据说明（自动生成）
  achievedNote String?
  createdAt DateTime @default(now())
  @@unique([teamId, seasonId])
}
```

**制定依据**（赛季开始时由 `SeasonGoalService` 自动生成）：

1. **球队实力评估**：OVR 中位数 + 首发 5 人 OVR 加权 + 球员潜力均值
2. **上赛季战绩**：胜率、排名、是否季后赛/夺冠（来自 `Standing` + `MatchResult`）
3. **财务状况**：薪资总额占预算比（来自 `TeamCash.balance` 与 `Σ Player.salary`）
4. **联赛等级**：L1 保级/进季后赛；L2 升级；国际联赛 16 强

`basisNote` 字段自动生成文本，如：`"上赛季胜率 0.42（排名第 12），球队 OVR 中位数 73（联盟第 8），薪资占比 78%（健康），目标设定：胜率 0.50、进季后赛、夺冠否"`。

### 3.3 董事会提案（BoardProposal，触发依据明确）

```prisma
model BoardDirector {
  id        String   @id @default(cuid())
  teamId    String
  name      String
  role      String   // chair | ceo | sports_director | finance_director | investor
  loyalty   Int      @default(60)
  createdAt DateTime @default(now())
}

model BoardProposal {
  id        String   @id @default(cuid())
  teamId    String
  seasonId  String
  day       Int
  type      String   // budget_request | facility_upgrade | fire_manager | sign_sponsor | academy_invest
  payload   Json
  reason    String   // 触发依据（自动生成）
  status    String   @default("pending") // pending | approved | rejected | expired
  votes     Json     @default("[]")
  createdAt DateTime @default(now())
  @@index([teamId, status])
}
```

**触发条件**（自动检测，每条都有 `reason` 字段说明依据）：

| 类型 | 触发条件 | reason 示例 |
|------|---------|------------|
| budget_request | `TeamCash.balance < 阈值` | "现金余额 1,200,000 低于安全线 2,000,000，请求追加预算 1,000,000" |
| facility_upgrade | `Facility.trainingHallLv < 同联赛均值 - 1` | "训练馆 Lv1 低于联盟均值 Lv3，建议升级至 Lv3，预算 800,000" |
| fire_manager | `近 10 场胜率 < 0.3` 或 `BoardDirector.loyalty 均值 < 30` | "近 10 场胜率 0.20 远低于目标 0.50，董事会忠诚度 25/100，提议解雇经理" |
| sign_sponsor | `Sponsor.satisfaction < 50` 或 `endSeason 即将到期` | "主赞助商满意度 42/100，建议启动新赞助商洽谈" |
| academy_invest | `Academy.lastProdYear < 当前年 - 2` | "青训学院上次产出 2 年前，建议追加投入 500,000" |

投票按各 `BoardDirector.loyalty` 加权计算，结果通过 `TeamMessage(board)` 通知经理。

---

## 四、公关部模块

### 4.1 联盟公告（LeagueAnnouncement）

```prisma
model LeagueAnnouncement {
  id        String   @id @default(cuid())
  leagueId  String?
  worldId   String?
  seasonId  String
  day       Int
  category  String   // trade | injury | suspension | milestone | rule_change | schedule_change
  title     String
  content   String
  refId     String?
  createdAt DateTime @default(now())
  @@index([seasonId, day])
}
```

**形成逻辑**：每个事件源发生后由 `AnnouncementService` 自动生成公告，`refId` 指向原事件。

| 事件源 | 公告示例 |
|--------|---------|
| TradeOffer.status=accepted | "[球队A] 与 [球队B] 完成 [球员X] 交易" |
| Player.retired=true | "[球员X] 宣布退役，生涯场均 [PTS] 分" |
| MatchResult.isClutch=true | "[球员X] 关键球绝杀 [球队B]" |
| Player 得分破万 | "[球员X] 生涯得分破 10,000 分" |
| 联盟处罚 | "[球队A] 因 [违规] 被罚款 [金额]" |

### 4.2 讯息（TeamMessage）

```prisma
model TeamMessage {
  id        String   @id @default(cuid())
  teamId    String
  seasonId  String
  day       Int
  channel   String   // board | sponsor | player | staff | scout | league
  type      String   // board_complaint / sponsor_praise / player_request ...
  title     String
  content   String
  refId     String?
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
  @@index([teamId, read])
}
```

**形成逻辑**（每个频道的事件源）：

- **董事会**：提案结果、目标达成/未达预警
- **赞助商**：满意度变化、续约/终止通知
- **球员**：续约请求、不满情绪（基于 `PlayerRelationship` 与出场时间）
- **职员**：合同到期、加薪请求
- **球探**：报告完成、新发现
- **联盟**：处罚、规则变更、赛程调整

每条讯息有 `type + refId`，可点击跳转。

### 4.3 媒体中心（MediaNews）

```prisma
model MediaNews {
  id        String   @id @default(cuid())
  worldId   String?
  seasonId  String
  day       Int
  source    String   // espn | nba_tv | local_paper | insider
  category  String   // trade | game | injury | rumor | front_office | fan
  title     String
  content   String
  refId     String?
  tags      Json     @default("[]")
  createdAt DateTime @default(now())
  @@index([seasonId, day])
}
```

**形成逻辑**：

- 媒体源 4 类（ESPN / NBA TV / 地方报 / 内幕）
- 自动从当天联盟事件提炼新闻：
  - 比赛日：复盘（胜负原因、关键球员表现）
  - 交易日：流言、达成、评级
  - 伤病日：影响分析
  - 里程碑：专题
- 按权重排序，首页 Top 10
- 支持按 `category / source / tags` 筛选

---

## 五、运营中心 - 球迷中心（FanCenter）

```prisma
model FanCenter {
  id           String   @id @default(cuid())
  teamId       String   @unique
  fanCount    Int      @default(1000)
  morale      Int      @default(60)   // 0-100
  loyalty     Int      @default(60)   // 0-100
  seasonTicketsSold Int @default(0)
  merchandiseRevenue Int @default(0)
  updatedAt   DateTime @updatedAt
}

model FanEvent {
  id        String   @id @default(cuid())
  teamId    String
  seasonId  String
  day       Int
  type      String   // win | loss | trade | signing | firing | title | scandal
  impact    Int      // 球迷情绪影响值（+/-）
  note      String?
  createdAt DateTime @default(now())
  @@index([teamId, seasonId, day])
}
```

**球迷数量增长**：
- 初始按城市规模（大市场 10 万、小市场 1 万）
- 胜率 > 60% 每日 +N，< 30% 每日 -N
- 转会：签约明星 +M，裁员 -m
- 夺冠一次性 +大额

**球迷士气计算**：
```
morale = clamp(
    50
  + 近5场净胜分 × 0.2
  + (fanLoyalty - 50) × 0.3
  - 连败场数 × 5
  + 季后赛席位 ? 5 : 0
, 0, 100)
```

**球迷忠诚度**：长期指标，受多年战绩、明星球员留存、票价调整影响。越高 → 季票续订率越高、衍生品购买力越强。

**季票销售**：赛季初按 `fanCount × 续订率` 一次性售出，续订率 = f(loyalty, 上赛季战绩)。收入入 `CashLedger(ticket, season_ticket)`。

**衍生品收入**：每日 `fanCount × 购买率 × 客单价`，与战绩、明星球员数量相关，入 `CashLedger(other, merchandise)`。

**球迷事件流**（FanEvent）：每发生影响球迷的事件（胜/负/交易/签约/解雇/夺冠/丑闻）写入，影响 morale/loyalty。前端展示为时间线。

---

## 六、人事模块

### 6.1 球员名单（对齐 basketpulse `/hk/Players/skills`）

#### (1) "球员详情" → "球员列表"

- Tab 重命名
- 表格列对齐 basketpulse `/hk/Players/skills`：
  ```
  姓名 / No. / 年齡 / 高 / 位置 / RT / 潛 / 健康 / 彈 / 速 / 壯 / 近 / 中 / 3 / 籃 / 擾 / 防 / 運 / 傳 / 攻 / 經
  ```
- 能力值用数字 + 颜色编码（高数值亮色，低数值暗色，与 basketpulse 一致）
- RT（OVR）与潜力（潛）独立成列
- **操作列**：若该球员无操作项则整列隐藏（已实现 `renderRowActions` 返回 null 时自动隐藏）

#### (2) 数据统计（对齐 basketpulse `/hk/Players/statistics`）

- 列顺序（精确对齐）：
  ```
  姓名 / No. / 分鐘 / 比賽(GP) / 得分 / 2% / 3% / 1%(罚球) / 籃(攻/防/總/被) / 助攻 / 搶截 / 犯規(被/犯) / 失誤 / 封阻(封/被) / 效率
  ```
- 命中率保留 HWO 配色：≥50% 绿、35-50% 黄、<35% 红
- 表格底部"合計"行：本队合计 vs 对手合计对比（新增）
- 数据来源：`StatsService.getTeamPlayerSeasonStats`（已实现，从 `MatchResult.boxScore` 聚合）
- 支持按位置/年龄筛选、按列排序、CSV 导出

#### (3) 合同管理（包含所有球员）

- 列出**所有球员**的合同（不止有操作的球员）
- 列：姓名 / 位置 / 年薪 / 总年限 / 剩余年数 / 球员选项 / 球队选项 / 交易否决 / 状态 / 裁员成本 / 操作
- 操作：续约 / 裁退（裁员成本 = 剩余年限 × 年薪 × 50%）
- 数据来源：`ContractService.getTeamContracts`（已实现）

### 6.2 职员中心（StaffCenter，新增模块）

复用既有 `Professional` 模型（已支持 `head_coach / asst_coach / trainer / scout / agent / merchant / arena_ops / reporter / caster / arbiter / union_rep`）。

- 新增后端 `staff` 模块：
  - `GET /api/staff/team/:teamId` → 列出本队所有职员
  - `POST /api/staff/hire` → 雇佣自由职员（需 transfer market 阶段）
  - `POST /api/staff/:id/fire` → 解雇（影响球迷/赞助商满意度）

- 职员分类卡片：
  - **教练组**：head_coach / asst_coach / trainer
  - **球探**：scout
  - **经纪人**：agent
  - **商务**：merchant / arena_ops
  - **媒体**：reporter / caster
  - **其他**：arbiter / union_rep

- 每个职员卡片：姓名 / 职位 / 等级 / 声望 / 雇佣状态 / 月薪 / 技能树
- 教练组影响：训练效率（trainer 等级 + 训练馆等级）、阵容 AI 自动决策质量（head_coach 等级）

### 6.3 核心球员页面（对齐 playrimattack `/#/core`）

**展示内容扩充**：

- 顶部横幅：赛季状态 + 球队信息
- **球员卡片**：头像 / 球衣号 / OVR / TRV(trade value) / 位置 / 身高 / 年龄 / 健康 / 合同 / 特质
- **生涯数据表格**：赛季 / GP / MIN / PTS / REB / AST / STL / BLK / FG% / 3P% / FT%
- **27 项能力值分组展示**（对齐 playrimattack）：
  - 身体：speed / vertical / strength / agility / stamina / lateral / burst / flexibility
  - 投射：three / midrange / freeThrow / layup / dunk
  - 防守：steal / block / rebounding
  - 控球：ballHandle / passing / pickRoll
  - 心理：workEthic / pressure / teamwork / leadership / iq
- 38 项档案分组展示（已有 `PROFILE_GROUPS` 定义）
- 王朝/传奇标签（DynastyRecord / HallOfFameEntry / EraTag）
- 关系网（PlayerRelationship）
- 球迷评价（基于 FanEvent 聚合）

### 6.4 训练中心（融合 basketpulse `/hk/Training/overview` 与 HWO 体系）

#### 设计原则

- **不手动加点**，每天自动训练，更新结果
- 训练效果 = f(训练馆等级 + trainer 职员等级 + 球员潜力 + 训练计划重心 + 疲劳)

#### 数据模型

```prisma
model TrainingPlan {
  id        String   @id @default(cuid())
  teamId    String   @unique
  focusByPosition Json @default("{}") // { PG: "passing", SG: "three", SF: "midrange", PF: "rebounding", C: "postUp" }
  teamFocus Json @default("{}")      // 整队能力成长权重
  updatedAt DateTime @updatedAt
}

model TrainingLog {
  id        String   @id @default(cuid())
  teamId    String
  seasonId  String
  day       Int
  playerId  String
  abilityKey String
  beforeVal  Int
  afterVal   Int
  gain       Float
  source     String   // team_training | position_training | individual
  createdAt DateTime @default(now())
  @@index([teamId, seasonId, day])
}
```

#### 页面布局（融合 basketpulse + HWO）

```
┌──────────────────────────────────────────────────────────┐
│ 训练中心                                                  │
├──────────────────────────────────────────────────────────┤
│ [摘要条]                                                  │
│ 训练馆: Lv3 ████████░░  主场馆: Lv2 ██████░░░░            │
│ 训练师: Mike (Lv4)  助理教练: Tom (Lv3)  主教练: Tom (Lv5)│
├──────────────────────────────────────────────────────────┤
│ [今日训练计划] (每天 day 切换前可调 1 次)                 │
│ 位置训练重心:                                            │
│   PG = 传球  SG = 三分  SF = 中投  PF = 篮板  C = 低位   │
│ 整队训练重心 (滑块):                                      │
│   速度 0.8 / 弹跳 0.6 / 力量 1.0 / 敏捷 0.7 ...           │
├──────────────────────────────────────────────────────────┤
│ [球员训练视图] (basketpulse 风格 - 单球员详细)            │
│ ┌────────────────────────────────────────────────┐        │
│ │ 球员: 韩一鸣  位置: C  年龄: 24  潜力: 84      │        │
│ │ RT: 76  狀態: good  健康: 95                  │        │
│ │                                                │        │
│ │ 各项能力 (含训练增量):                         │        │
│ │   速度 65 (+0.3)  弹跳 72 (+1.2)  力量 78 ... │        │
│ │   ...                                          │        │
│ │ [训练重心下拉: 籃板 ▼]                         │        │
│ └────────────────────────────────────────────────┘        │
├──────────────────────────────────────────────────────────┤
│ [今日训练成果表]                                          │
│ 球员 | 位置 | 训练项 | 前值 | 后值 | 增量 | 来源          │
│ ...                                                      │
├──────────────────────────────────────────────────────────┤
│ [本周训练摘要] (柱状图)                                   │
│ 各球员能力增长总量                                        │
├──────────────────────────────────────────────────────────┤
│ [训练历史日志] (TrainingLog 时间线)                       │
└──────────────────────────────────────────────────────────┘
```

#### 训练算法（每天 day 切换时由 `TrainingService.runDaily(teamId)` 执行）

```
对每个球员 p:
  baseGain = (trainingHallLv × 0.1) + (trainerLevel × 0.05)
  focusBonus = 训练计划命中该球员位置的能力 +1.0 否则 +0.5
  potentialFactor = (potential - currentAbility) / max(potential - 50, 1)  // 越接近潜力成长越慢
  fatigueFactor = (100 - fatigue) / 100
  gain = baseGain × focusBonus × potentialFactor × fatigueFactor × 随机扰动(0.8~1.2)
  ability += gain (上限 potential)
  trainExp += gain × 100
  fatigue += 出场时间 × 0.5  // 比赛日额外疲劳
  写入 TrainingLog
```

#### 与 HWO 既有体系融合

- `Facility.trainingHallLv` → 训练效率系数
- `Academy.level` → 青年球员训练加成
- `Professional`(trainer) → 训练效率
- `Player.potential` → 能力上限
- `Player.fatigue / status` → 训练损耗与状态恢复
- `Career.advanceAllPlayers` → 生涯弧线（赛季末统一推进）

### 6.5 人才中心

#### (1) 球探探查选项扩充

```prisma
model ScoutMission {
  id        String   @id @default(cuid())
  teamId    String
  scoutId   String                  // Professional id
  targetType String                 // player | head_coach | asst_coach | trainer | agent | merchant | reporter | caster | arbiter | union_rep
  targetRef String?
  region    String?
  status    String   @default("pending") // pending | completed | expired
  report    Json?
  accuracy  Int?
  createdAt DateTime @default(now())
  completedAt DateTime?
  @@index([teamId, status])
}
```

**探查流程**：
1. 用户选择目标类型 + 区域/范围
2. 派出球探（消耗球探工时，每日有上限）
3. 球探完成返回 `ScoutReport`，准确度 = f(球探等级 + 目标雾值)
4. 报告展示在"球探报告"列表，可点击查看详情

#### (2) "自由市场" → "交易市场"，分两阶段

```prisma
model TransferMarketPhase {
  id        String   @id @default(cuid())
  seasonId  String  @unique
  phase     String   @default("closed") // closed | free_agency | restricted
  freeAgencyEndDay Int?     // 自由市场结束日（国际联赛 16 强赛前）
  restrictedStartDay Int?
  restrictedEndDay   Int?   // 赛季最后一日
  updatedAt DateTime @updatedAt
}
```

**阶段规则**：

| 阶段 | 时间窗口 | 行为 |
|------|---------|------|
| 自由市场 (free_agency) | 赛季开始 → 国际联赛 16 强赛前 | 球员/职员即时加入球队 |
| 受限市场 (restricted) | 16 强赛开始 → 赛季最后一日 | 球员/职员赛季最后一日统一加入 |

**触发逻辑**：赛季 day 切换时检查 `TransferMarketPhase`，自动切换阶段。受限市场期间签约加入"待加入列表"，赛季最后一日统一入队。

#### (3) 交易市场内容

- 标签切换：球员 / 主教练 / 助理教练 / 训练师 / 球探 / 其他职员
- 列表：姓名 / OVR / 年龄 / 报价 / 状态（自由/受限/已被截胡）
- 操作：签约（消耗现金）、撤回

### 6.6 交易对方球队选择（搜索方式）

**现状**：下拉框。
**调整**：搜索框。

实现：
- 新增前端组件 `TeamSearchSelect`
- 输入球队名/城市名，实时模糊匹配
- 展示搜索结果列表（球队名 + 城市 + 联赛 + OVR + 战绩）
- 点击选中填入表单
- 同时支持按 OVR 范围、联赛、战绩筛选
- 后端扩展 `GET /api/teams?search=xxx` 支持模糊搜索（已有 list 接口，加 query 参数）

---

## 七、实施顺序（按依赖关系分批，每批完成等用户测试反馈再进下一批）

### 批次 1：基础架构（前置）
- 数据模型新增（Prisma migration）
- WorldClockScheduler 自动走时间
- 球员名单 → 球员列表（重命名 + 操作列清理）
- 删除"推进一日"和"AI 经理"按钮

### 批次 2：财务系统
- TeamCash + CashLedger 模型
- FinanceService.runDaily
- 财务页前端重构（对齐 basketpulse 布局：余额卡 + 週选择器 + 收支分类 + 流水表）
- 数据统计 Tab 优化（合計行 + basketpulse 列对齐）

### 批次 3：训练中心 + 职员中心
- TrainingPlan + TrainingLog 模型
- TrainingService.runDaily
- Staff 模块（职员列表、雇佣、解雇）
- 训练中心前端页面（融合 basketpulse 单球员视图 + 整队表格）

### 批次 4：董事会 + 赞助商
- Sponsor + BoardDirector + SeasonGoal + BoardProposal 模型
- 满意度/目标/提案自动生成逻辑
- 董事会前端页面

### 批次 5：公关部 + 运营中心
- LeagueAnnouncement + TeamMessage + MediaNews 模型
- FanCenter + FanEvent 模型
- 公关部 / 球迷中心 / 媒体中心前端

### 批次 6：人才市场 + 交易搜索 + 核心球员
- ScoutMission 扩展职员
- TransferMarketPhase 阶段切换
- 交易市场改造（球员 + 各类职员）
- TeamSearchSelect 组件
- 核心球员页面扩充（对齐 playrimattack）

---

## 八、待用户确认的关键决策

1. **球员合同去掉**（§2.5）：解读 A 还是 B？（默认 A）
2. **游戏币用途**（§2.4）：是否将 `User.coins` 改名"经理点数"，仅用于外观/VIP，与球队现金彻底分离？
3. **世界时钟速率**：1 秒 : 1 赛季分钟 是否合适？是否需要加速档（2x / 4x）？
4. **训练计划调整频率**：每天 1 次是否合理？
5. **受限市场截胡机制**：是否需要"被截胡"逻辑？还是先到先得？
6. **球队资讯条数上限**：每天 10-20 条是否合适？
7. **核心球员页面**：38 项档案是否全部展示？还是按权限分级？
8. **赞助商档位**：S/A/B/C/D 五档是否合理？还是按球队等级自动定档？

---

## 九、测试环境说明

- 前端 http://localhost:5173 已确认可登录进入管理页（包含导航菜单、概览、战绩、财务摘要、积分榜、今日赛程等模块）
- 测试账号：`test@hwo.test` / `test12345`（已绑"天津津门棕熊"队）
- 后端 http://localhost:3000 已运行
- 数据库已 seed 16 支球队 + 球员 + 赛季 2027-2028
- 测试期间不会关闭服务器，等待用户通知测试完成后再处理

如用户仍打不开页面，可能是浏览器缓存问题，建议：
1. 硬刷新（Ctrl+Shift+R / Cmd+Shift+R）
2. 或换无痕模式访问 http://localhost:5173/
3. 或确认访问的是 `localhost:5173` 而非其他地址
