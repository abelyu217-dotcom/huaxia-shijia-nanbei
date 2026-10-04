# HWO 系统调整方案 v1

> 范围：概览 / 财务 / 董事会 / 公关部 / 运营中心 / 人事 / 训练 / 人才市场
> 原则：**不做假数据**，所有展示项必须有后端系统与数据依据；参考 basketpulse.com 与 playrimattack.com 的布局与机制，融合 HWO 现有体系
> 待用户确认后开始实施；本轮不写代码

---

## 0. 总体架构变化

### 0.1 时间系统（核心前置）

**现状**：`season.advanceDay()` 为手动触发（"推进一日"按钮），AI 经理也是手动触发跑训练/阵容。

**调整为自动走时间**：
- 后端引入**世界时钟调度器**（WorldClockScheduler），按 1 秒 : 1 分钟（可配）自动推进赛季 `day`
- 每个 `day` 切换时按顺序执行：
  1. 比赛结算（当天有比赛则 sim）
  2. 训练更新（自动跑训练，更新 `trainExp` / `abilities` / `fatigue` 恢复）
  3. AI 经理自动跑（自家球队的阵容/战术无需用户介入，但用户可手动覆盖；其他球队由 AI 维护）
  4. 财务结算（每日收入/支出入账，更新 `TeamCash` 流水）
  5. 球队资讯生成（基于当天发生的事件，写入 `TeamNews`)
  6. 媒体中心新闻生成（基于联盟事件，写入 `MediaNews`)
  7. 球迷情绪更新（基于战绩、转会、公关动作）
  8. 董事会满意度更新（基于战绩、财务、球迷）
  9. 赞助商满意度更新（基于战绩、媒体曝光、球迷）
- 用户前端顶部显示**世界时钟**（赛季 X 日 Y 时），并提供"暂停/恢复"开关（仅本队视角，不影响他人）

**前端去除**："推进一日"按钮、"AI 经理"按钮、"今日赛程"模块（改为"球队资讯"流）。

### 0.2 数据模型新增（统一在此列出，后续各模块引用）

```prisma
// 球队现金账户
model TeamCash {
  id        String   @id @default(cuid())
  teamId    String   @unique
  balance   Int      @default(5_000_000)   // 当前现金余额（分单位：元）
  // 经济参数
  sponsorTier String  @default("C")       // 赞助档位 D<C<B<A<S
  arenaTicketPrice Int @default(50)      // 票价基准
  // 风险指标
  debt      Int      @default(0)         // 当前负债
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// 现金流水（真实收支依据）
model CashLedger {
  id        String   @id @default(cuid())
  teamId    String
  seasonId  String
  day       Int                    // 赛季第几日
  category  String                 // sponsor | ticket | broadcast | salary | staff | facility | academy | transfer | fine | other
  subType   String                 // main_sponsor / kit_sponsor / home_game / away_share / player_salary / staff_salary / upgrade / maintenance ...
  amount    Int                    // 正数=收入 负数=支出
  refId     String?                // 关联实体 ID（matchId / playerId / staffId / contractId）
  note      String?
  createdAt DateTime @default(now())
  @@index([teamId, seasonId, day])
  @@index([teamId, category])
}

// 赞助商
model Sponsor {
  id        String   @id @default(cuid())
  teamId    String
  type      String                 // main | kit | arena | broadcast
  name      String
  tier      String                 // D/C/B/A/S
  // 收入条款
  basePerSeason Int               // 赛季基础赞助费
  bonusPerWin   Int               // 每胜场奖金
  titleBonus    Int               // 夺冠奖金
  // 满意度系统
  satisfaction  Int   @default(60) // 0-100
  // 触发条件
  expectedWinRate Float @default(0.5) // 期望胜率
  expectedPlayoff Boolean @default(true)
  contractSeasons Int @default(2)
  startSeason Int
  endSeason   Int?
  createdAt DateTime @default(now())
  @@index([teamId])
}

// 董事会
model BoardDirector {
  id        String   @id @default(cuid())
  teamId    String
  name      String
  role      String                 // chair | ceo | sports_director | finance_director | investor
  loyalty   Int      @default(60)  // 0-100 对经理的支持度
  createdAt DateTime @default(now())
}

// 赛季目标
model SeasonGoal {
  id        String   @id @default(cuid())
  teamId    String
  seasonId  String   @unique(@default(cuid()))  // 一队一赛季一目标
  season    Int
  // 目标项
  expectedWinRate   Float   // 期望胜率
  expectedPlayoff   Boolean // 进季后赛
  expectedChampionship Boolean // 夺冠
  expectedRank      Int?     // 期望排名
  // 来源依据：上赛季战绩 + 球队实力评估（OVR 中位数 + 薪资总额）
  basisNote  String            // 依据说明
  // 完成情况
  achievedNote String?
  createdAt DateTime @default(now())
  @@unique([teamId, seasonId])
}

// 董事会提案
model BoardProposal {
  id        String   @id @default(cuid())
  teamId    String
  seasonId  String
  day       Int
  type      String                 // budget_request | facility_upgrade | fire_manager | sign_sponsor | academy_invest
  payload   Json                   // 提案参数
  reason    String                 // 触发依据（自动生成，非 mock）
  status    String   @default("pending") // pending | approved | rejected | expired
  votes     Json     @default("[]") // [{ directorId, vote }]
  createdAt DateTime @default(now())
  @@index([teamId, status])
}

// 联盟公告（系统级，有形成逻辑）
model LeagueAnnouncement {
  id        String   @id @default(cuid())
  leagueId  String?
  worldId   String?
  seasonId  String
  day       Int
  category  String                 // trade | injury | suspension | milestone | rule_change | schedule_change
  title     String
  content   String
  refId     String?                // 关联实体（matchId/playerId/tradeId）
  createdAt DateTime @default(now())
  @@index([seasonId, day])
}

// 球队讯息（私信流，自动生成）
model TeamMessage {
  id        String   @id @default(cuid())
  teamId    String
  seasonId  String
  day       Int
  channel   String                 // board | sponsor | player | staff | scout | league
  type      String                 // 例如 board_complaint / sponsor_praise / player_request
  title     String
  content   String
  refId     String?
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
  @@index([teamId, read])
}

// 媒体中心新闻
model MediaNews {
  id        String   @id @default(cuid())
  worldId   String?
  seasonId  String
  day       Int
  source    String                 // espn | nba_tv | local_paper | insider
  category  String                 // trade | game | injury | rumor | front_office | fan
  title     String
  content   String
  refId     String?                // 关联实体
  tags      Json     @default("[]")
  createdAt DateTime @default(now())
  @@index([seasonId, day])
}

// 球迷中心
model FanCenter {
  id           String   @id @default(cuid())
  teamId       String   @unique
  fanCount    Int      @default(1000)
  morale      Int      @default(60)   // 0-100
  loyalty     Int      @default(60)   // 0-100
  // 季票销售
  seasonTicketsSold Int @default(0)
  // 衍生品
  merchandiseRevenue Int @default(0)
  updatedAt   DateTime @updatedAt
}

// 球迷情绪事件（影响球迷指标的事件流）
model FanEvent {
  id        String   @id @default(cuid())
  teamId    String
  seasonId  String
  day       Int
  type      String                 // win | loss | trade | signing | firing | title | scandal
  impact    Int                    // 球迷情绪影响值（+/-）
  note      String?
  createdAt DateTime @default(now())
  @@index([teamId, seasonId, day])
}

// 训练计划（每天自动训练依据）
model TrainingPlan {
  id        String   @id @default(cuid())
  teamId    String   @unique
  // 训练重心：5 个位置各一项重点能力
  focusByPosition Json @default("{}") // { PG: "passing", SG: "three", SF: "midrange", PF: "rebounding", C: "postUp" }
  // 整队训练重心（影响 17 项能力的成长权重）
  teamFocus Json @default("{}")      // { speed: 1.0, vertical: 0.8 ... }
  updatedAt DateTime @updatedAt
}

// 训练日志（每日训练结果，可追溯）
model TrainingLog {
  id        String   @id @default(cuid())
  teamId    String
  seasonId  String
  day       Int
  playerId  String
  abilityKey String                  // 哪项能力值
  beforeVal  Int
  afterVal   Int
  gain       Float
  source     String                 // team_training | position_training | individual
  createdAt DateTime @default(now())
  @@index([teamId, seasonId, day])
}

// 球探探查任务
model ScoutMission {
  id        String   @id @default(cuid())
  teamId    String
  scoutId   String                  // Professional id
  targetType String                 // player | head_coach | asst_coach | trainer | agent | merchant | reporter
  targetRef String?                 // 球员/职员 ID（已知则填）
  region    String?                 // 探查区域
  status    String   @default("pending") // pending | completed | expired
  report    Json?                   // 探查报告内容
  accuracy  Int?                    // 报告准确度
  createdAt DateTime @default(now())
  completedAt DateTime?
  @@index([teamId, status])
}

// 交易市场阶段（每赛季一条状态记录）
model TransferMarketPhase {
  id        String   @id @default(cuid())
  seasonId  String  @unique
  phase     String   @default("closed") // closed | free_agency | restricted
  freeAgencyEndDay Int?             // 自由市场结束日（国际联赛 16 强赛前）
  restrictedStartDay Int?           // 受限市场开始日
  restrictedEndDay   Int?           // 赛季最后一日
  updatedAt DateTime @updatedAt
}
```

### 0.3 既有可复用资产

- `Professional` 模型（已存在）支持 `head_coach / asst_coach / trainer / scout / agent / merchant / arena_ops / reporter / caster / arbiter / union_rep` —— 职员中心直接复用
- `Facility` 模型 `trainingHallLv / arenaLv` —— 训练馆等级影响训练效率，主场馆影响票务
- `Academy` 模型 —— 青年球员产出
- `Contract` 模型 —— 球员合同管理（保留，详见 §2.4）
- `ScoutReport` 模型 —— 球探报告
- `season.advanceDay()` —— 自动走时间的执行入口

---

## 一、概览模块

### 1.1 调整项

| 调整 | 现状 | 方案 |
|------|------|------|
| 去掉"推进一日" | 手动按钮 | 改为 WorldClockScheduler 自动推进（1:1 显示时间） |
| 去掉"AI 经理" | 手动触发跑训练/阵容 | 系统在 day 切换时自动跑训练与 AI 阵容 |
| 去掉"今日赛程" | 列出本日比赛 | 改为"球队资讯"流，展示本队发生的变化 |

### 1.2 球队资讯（TeamNews）内容来源

每天 day 切换时由后端聚合以下事件写入：

1. 比赛结果（胜/负、关键球员表现、PBP 高光）
2. 训练成果（哪些球员成长、变化幅度）
3. 伤病/状态变化（疲劳、伤病、退役）
4. 转会动态（签约、裁员、交易完成）
5. 合同状态（续约、到期预警）
6. 财务变动（大额收支、赞助商变化）
7. 董事会动作（提案通过/否决）
8. 球迷反馈（情绪波动事件）
9. 青训学院产出
10. 设施升级完成

每条资讯包含：`标题 / 正文 / 时间(赛季日) / 类别 / 关联实体 ID`，前端按时间线展示，可点击跳转到详情。

### 1.3 前端改动

- 顶部菜单"概览"页：
  - 上：世界时钟（赛季 X 日 / 联赛阶段 / 阶段进度条）
  - 中：球队资讯流（替代今日赛程）
  - 下：本队摘要（OVR、战绩、现金、球迷士气、训练重心）
- 删除"推进一日"和"AI 经理"按钮

---

## 二、财务模块

参考 `basketpulse.com/hk/finances` 布局：**现金余额 + 收入分类 + 支出分类 + 流水表**。

### 2.1 球队现有资金（新增 TeamCash）

- 新增 `TeamCash` 模型，初始余额按球队档位（如 500 万）
- 前端财务页顶部大字展示当前余额，并显示：
  - 本日净流额
  - 本周净流额
  - 本赛季净流额
  - 预计本季末余额（基于已签约合同与剩余赛程）

### 2.2 真实收支系统（CashLedger）

**所有收入/支出必须有依据**，不允许 mock。每天 day 切换时由 `FinanceService` 自动结算：

#### 收入项

| 分类 | 来源 | 计算依据 |
|------|------|---------|
| 主赞助商收入 | `Sponsor.type=main` | 按 `basePerSeason / 赛季天数` 每日入账，胜场触发 `bonusPerWin` |
| 装备赞助 | `Sponsor.type=kit` | 同上，档位影响单价 |
| 主场票务 | `Match.homeTeamId=本队 且 status=settled` | `fanCount × 上座率 × ticketPrice`，上座率=f(战绩+球迷士气)，主场馆等级加成 |
| 客场分红 | `Match.awayTeamId=本队` | 主场馆收入的固定比例（如 10%） |
| 转播分成 | 赛季固定 + 战绩奖金 | 按 `LeagueTeam` 成员均分 |
| 青训产出转售 | `Academy` 产出球员售出 | 一次性，记入 `transfer` |
| 转会费收入 | `TradeOffer.offerorCash` 入账 | 交易完成时入账 |

#### 支出项

| 分类 | 来源 | 计算依据 |
|------|------|---------|
| 球员薪资 | `Player.salary` | 每日 `salary / 赛季天数`，发薪日触发 |
| 职员薪资 | `Professional.employerTeamId=本队` | 同上，按 `job + level` 折算 |
| 设施维护 | `Facility` | `(trainingHallLv + arenaLv) × 维护基数` |
| 设施升级 | `Facility` 升级动作 | 一次性 |
| 青训投入 | `Academy.investment` | 升级或产出时投入 |
| 转会费支出 | `TradeOffer.offereeCash` | 交易完成时入账 |
| 裁员成本 | `ContractService.waivePlayer` | 剩余年限 × 年薪 × 50% |
| 罚款 | 联盟处罚事件 | 自动生成 `LeagueAnnouncement` 关联 |

#### 流水展示

- 三种视图：**每日 / 每周 / 每赛季**
- 列：日期、分类、子类、金额（收入+绿色 / 支出-红色）、备注、关联链接
- 支持按分类筛选、按金额排序、CSV 导出

### 2.3 钱包中"游戏币"的用途澄清

**现状**：`User.coins / User.credits` 两套币。

**澄清方案**（待确认）：

| 币种 | 性质 | 用途 |
|------|------|------|
| 现金（TeamCash）| 球队经营币 | 球队运营：薪资、转会、设施、青训 |
| 游戏币（User.coins）| 玩家增值币 | VIP 订阅、外观购买、加速类增值服务（不影响竞技公平） |
| 信用点（User.credits）| 充值币 | 由真实货币购买，兑换游戏币或购买稀有外观 |

**问题**：是否将"游戏币"统一改为"经理点数"（仅用于外观/VIP，不与球队经营混淆）？需用户确认。

### 2.4 球员合同去掉（待确认）

用户在财务模块下说"球员合同去掉"。两种解读：

- **解读 A**：财务页不再单列"球员合同"为独立支出项，但球员合同本身保留（在球员名单"合同管理"Tab 管理）。
- **解读 B**：完全删除球员合同系统，球员只保留 `salary` 字段，无年限/续约/裁员。

**默认采用解读 A**（更符合 basketpulse 与 HWO 既有设计）。请确认。

---

## 三、董事会模块

### 3.1 赞助商满意度（Sponsor.satisfaction）

**有依据，非假数据**。计算公式（每日结算）：

```
satisfaction = clamp(
   基准 50
 + 战绩分 (近 10 场胜率 - 期望胜率) × 100 × 0.4
 + 媒体分 (本队媒体新闻条数 - 联盟均值) × 0.5
 + 球迷分 (fanMorale - 50) × 0.3
 - 罚款次数 × 10
 - 阵容大变动 × 5  // 频繁裁员降满意度
, 0, 100)
```

- 满意度档位：< 30 终止合同；30-50 警告；50-80 正常；> 80 续约涨薪
- 触发续约/终止时自动生成 `TeamMessage(sponsor)` 通知经理

### 3.2 赛季目标（SeasonGoal）

**制定依据**（非随机）：

1. 球队实力评估（OVR 中位数 + 首发 5 人 OVR 加权 + 球员潜力均值）
2. 上赛季战绩（胜率、排名、是否季后赛/夺冠）
3. 财务状况（薪资总额占预算比）
4. 联赛等级（L1 目标保级/进季后赛；L2 目标升级；国际联赛目标 16 强）

**目标项**：胜率、是否进季后赛、是否夺冠、期望排名

**完成情况**：赛季末结算，写入 `achievedNote`，影响下赛季目标与董事会满意度。

### 3.3 董事会提案（BoardProposal）

**触发依据**（自动生成，非 mock）：

| 提案类型 | 触发条件 | 依据 |
|---------|---------|------|
| budget_request | 现金 < 阈值 或 季中加薪 | `TeamCash.balance` |
| facility_upgrade | 训练馆/主场馆等级落后同联赛均值 | `Facility` vs 同联赛 |
| fire_manager | 连续 10 场胜率 < 30% 或 董事会忠诚度 < 30 | `Standing + BoardDirector.loyalty` |
| sign_sponsor | 当前赞助商满意度低 或 合同即将到期 | `Sponsor` |
| academy_invest | 青年球员产出不足 | `Academy.lastProdYear` |

每提案自动生成 `reason` 字符串，列出依据数据。董事会投票按各 `BoardDirector.loyalty` 加权计算，结果通过 `TeamMessage(board)` 通知经理。

---

## 四、公关部模块

### 4.1 联盟公告（LeagueAnnouncement）

**形成逻辑**：

- 触发源：交易完成、重大伤病、停赛、球员退役、里程碑（得分破万、千板）、规则变更、赛程调整
- 每个事件源发生后由 `AnnouncementService` 自动生成公告，`refId` 指向原事件
- 内容模板化生成（基于事件数据填空），非 LLM 编造

例：交易完成 → 标题"[球队A] 与 [球队B] 完成 [球员X] 交易"，正文列出筹码。

### 4.2 讯息（TeamMessage）

**形成逻辑**：

- 频道：董事会、赞助商、球员、职员、球探、联盟
- 每个频道的事件源：
  - 董事会：提案结果、目标达成/未达预警
  - 赞助商：满意度变化、续约/终止通知
  - 球员：续约请求、不满情绪（基于 `PlayerRelationship` 与出场时间）
  - 职员：合同到期、加薪请求
  - 球探：报告完成、新发现
  - 联盟：处罚、规则变更、赛程调整
- 每条讯息有 `type + refId`，可点击跳转

### 4.3 媒体中心（MediaNews）

**形成逻辑**：

- 媒体源：espn / nba_tv / local_paper / insider
- 自动从当天联盟事件中提炼新闻：
  - 比赛日：复盘（胜负原因、关键球员表现）
  - 交易日：流言、达成、评级
  - 伤病日：影响分析
  - 里程碑：专题
- 内容量大时按权重排序，首页展示 Top 10
- 支持按 `category / source / tags` 筛选

---

## 五、运营中心模块

### 5.1 球迷中心（FanCenter）

**有逻辑有系统**：

#### 球迷数量增长

- 初始按球队所在城市规模（如大市场球队 10 万、小市场 1 万）
- 战绩影响：胜率 > 60% 每日 +N，< 30% 每日 -N
- 转会动态：签约明星 +M，裁员 -m
- 夺冠一次性 +大额

#### 球迷士气（morale 0-100）

```
morale = clamp(
   基准 50
 + 近 5 场净胜分 × 0.2
 + (fanLoyalty - 50) × 0.3
 - 连败场数 × 5
 + 季后赛席位 +
, 0, 100)
```

#### 球迷忠诚度（loyalty 0-100）

- 长期指标，受多年战绩、明星球员留存、票价调整影响
- 越高 → 季票续订率越高、衍生品购买力越强

#### 季票销售

- 赛季初按 `fanCount × 续订率` 一次性售出
- 续订率 = f(loyalty, 上赛季战绩)
- 季票收入入 `CashLedger(category=ticket, subType=season_ticket)`

#### 衍生品收入

- 每日 `fanCount × 购买率 × 客单价`，与战绩、明星球员数量相关
- 入 `CashLedger(category=other, subType=merchandise)`

#### 球迷事件流（FanEvent）

每发生影响球迷的事件（胜/负/交易/签约/解雇/夺冠/丑闻）写入事件，影响 morale/loyalty。前端展示为时间线。

---

## 六、人事模块

### 6.1 球员名单调整

#### (1) 球员详情 → 球员列表

- 改名"球员详情"为"球员列表"
- 表格列对齐 basketpulse.com/hk/Players/statistics：
  - 姓名 / 位置 / 年龄 / 身高 / 体重 / 经验年数 / OVR
  - GP / GS / MPG / PPG / RPG / APG / SPG / BPG / TO / FG%/3P%/FT% / +/-
- 操作列：若球员无操作项则隐藏整列
- 命中率保留配色（≥50% 绿、35-50% 黄、<35% 红）

#### (2) 数据统计

- 列结构与 basketpulse.com/hk/Players/statistics 完全一致
- 数据来源：`StatsService.getTeamPlayerSeasonStats`（已实现，从 `MatchResult.boxScore` 聚合）
- 支持按位置/年龄筛选、按列排序、CSV 导出
- 命中率配色保留

#### (3) 合同管理

- 包含**所有球员**的合同（不止有操作的球员）
- 列：姓名 / 位置 / 年薪 / 总年限 / 剩余年数 / 球员选项 / 球队选项 / 交易否决 / 状态 / 裁员成本 / 操作
- 操作：续约 / 裁退（裁员成本=剩余年限×年薪×50%）
- 数据来源：`ContractService.getTeamContracts`（已实现）

### 6.2 职员中心（StaffCenter，新增）

**包含各级教练与俱乐部其他职员**，数据源为 `Professional` 模型（已存在）。

- 新增后端模块 `staff`：
  - `GET /api/staff/team/:teamId` → 列出本队所有职员
  - `POST /api/staff/hire` → 雇佣自由职员（需 `transfer market` 阶段）
  - `POST /api/staff/:id/fire` → 解雇（影响球迷/赞助商满意度）
- 职员分类：
  - 教练组：head_coach / asst_coach / trainer
  - 球探：scout
  - 经纪人：agent
  - 商务：merchant / arena_ops
  - 媒体：reporter / caster
  - 其他：arbiter / union_rep
- 每个职员卡片展示：姓名 / 职位 / 等级 / 声望 / 雇佣状态 / 月薪 / 技能树
- 教练组影响：训练效率（trainer 等级 + 训练馆等级）、阵容 AI 自动决策质量（head_coach 等级）

### 6.3 核心球员页面（参考 playrimattack.com/#/core）

**展示内容扩充**：

- 球员头像（如已生成）
- 基础信息：姓名 / 位置 / 年龄 / 身高 / 体重 / 经验
- OVR + 潜力值（potential）
- 17 项能力值（雷达图）
- 38 项档案（分组展示）
- 本赛季数据（场均、命中率）
- 生涯弧线（历年 OVR 变化曲线）
- 特质（traits）
- 关系网（PlayerRelationship，与其他球员/教练）
- 王朝/传奇标签（DynastyRecord / HallOfFameEntry / EraTag）
- 合同状态
- 球迷评价（基于球迷事件流聚合）

### 6.4 训练中心（参考 basketpulse.com/hk/Training/overview，融合 HWO 体系）

#### 设计原则

- **不手动加点**，每天自动训练，更新结果
- 训练效果 = f(训练馆等级 + trainer 职员等级 + 球员潜力 + 训练计划重心 + 疲劳)

#### 页面布局（融合）

```
┌──────────────────────────────────────────────────────────┐
│ 训练中心                                                  │
├──────────────────────────────────────────────────────────┤
│ 训练馆等级: Lv3 ████████░░  主场馆: Lv2 ██████░░░░       │
│ 训练师: Mike (Lv4)  助理教练: Tom (Lv3)  主教练: ...    │
├──────────────────────────────────────────────────────────┤
│ 今日训练计划 (可调整重心，但每日 1 次)                   │
│ 位置训练重心: PG=传球 SG=三分 SF=中投 PF=篮板 C=低位   │
│ 整队训练重心: 速度 0.8 / 弹跳 0.6 / 力量 1.0 ...        │
├──────────────────────────────────────────────────────────┤
│ 今日训练成果 (表格)                                      │
│ 球员 | 位置 | 训练项 | 前值 | 后值 | 增量 | 来源         │
│ ...                                                      │
├──────────────────────────────────────────────────────────┤
│ 本周训练摘要 (柱状图)                                     │
│ 各球员能力增长总量                                        │
├──────────────────────────────────────────────────────────┤
│ 训练历史日志 (TrainingLog)                                │
└──────────────────────────────────────────────────────────┘
```

#### 训练算法

每天 day 切换时由 `TrainingService.runDaily(teamId)` 执行：

```
对每个球员 p:
  baseGain = (trainingHallLv + trainerLevel) × 0.1
  focusBonus = (训练计划命中该球员位置的能力 +1) × 0.5
  potentialFactor = (potential - currentAbility) / (potential - 50)  // 越接近潜力成长越慢
  fatigueFactor = (100 - fatigue) / 100
  gain = baseGain × focusBonus × potentialFactor × fatigueFactor × 随机扰动
  ability += gain (上限 potential)
  trainExp += gain × 100
  fatigue += 出场时间 × 0.5
  写入 TrainingLog
```

#### 训练计划调整

- 用户可在训练中心调整"位置训练重心"和"整队训练重心"
- 每天 day 切换前可改一次（防止反复刷分）
- 不调整则沿用昨日计划

#### 与 HWO 既有体系融合

- `Facility.trainingHallLv` → 训练效率系数
- `Academy.level` → 青年球员训练加成
- `Professional` 中 trainer 等级 → 训练效率
- `Player.potential` → 能力上限
- `Player.fatigue` / `status` → 训练损耗与状态恢复
- `Career.advanceAllPlayers` → 生涯弧线（赛季末统一推进）

### 6.5 人才中心

#### (1) 球探探查选项扩充

新增 `ScoutMission` 模型，支持探查：

- 球员（其他球队球员、自由市场球员）
- 各类职员：head_coach / asst_coach / trainer / scout / agent / merchant / reporter / caster / arbiter / union_rep

探查流程：
1. 用户选择目标类型 + 区域/范围
2. 派出球探（消耗球探工时，每日有上限）
3. 球探完成返回 `ScoutReport`，准确度 = f(球探等级 + 目标雾值)
4. 报告展示在"球探报告"列表，可点击查看详情

#### (2) "自由市场" → "交易市场"，分两阶段

**模型**：`TransferMarketPhase`

**阶段规则**：

| 阶段 | 时间窗口 | 行为 |
|------|---------|------|
| 自由市场 (free_agency) | 赛季开始 → 国际联赛 16 强赛前 | 球员/职员即时加入球队 |
| 受限市场 (restricted) | 16 强赛开始 → 赛季最后一日 | 球员/职员赛季最后一日统一加入 |

**触发逻辑**：

- 赛季 day 切换时检查 `TransferMarketPhase`，自动切换阶段
- 自由市场期间签约：球员/职员立即入队，薪水从签约日起算
- 受限市场期间签约：球员/职员加入"待加入列表"，赛季最后一日统一入队，期间可被其他球队截胡（按出价 + 球员偏好决策）

#### (3) 交易市场内容

- 标签切换：球员 / 主教练 / 助理教练 / 训练师 / 球探 / 其他职员
- 列表：姓名 / OVR / 年龄 / 报价 / 状态（自由/受限/已被截胡）
- 操作：签约（消耗现金）、撤回

### 6.6 交易对方球队选择（搜索方式）

**现状**：下拉框选择目标球队。

**调整**：改为搜索框：

- 输入球队名/城市名，实时模糊匹配
- 展示搜索结果列表（球队名 + 城市 + 联赛 + OVR + 战绩）
- 点击选中填入表单
- 同时支持按 OVR 范围、联赛、战绩筛选

前端组件：`TeamSearchSelect`，复用 `GET /api/teams?search=xxx` 接口（后端需扩展模糊搜索）。

---

## 七、实施顺序建议

按依赖关系分批，每批完成后等用户测试反馈再进入下一批：

### 批次 1：基础架构（前置）
- 数据模型新增（迁移）
- WorldClockScheduler 自动走时间
- 球员名单 → 球员列表（重命名 + 操作列清理）

### 批次 2：财务系统
- TeamCash + CashLedger
- FinanceService 每日结算
- 财务页前端重构（每日/每周/每赛季视图）

### 批次 3：训练中心 + 职员中心
- TrainingPlan + TrainingLog
- TrainingService.runDaily
- StaffCenter 职员列表与雇佣
- 训练中心前端页面

### 批次 4：董事会 + 赞助商
- Sponsor + BoardDirector + SeasonGoal + BoardProposal
- 满意度/目标/提案自动生成逻辑
- 董事会前端页面

### 批次 5：公关部 + 运营中心
- LeagueAnnouncement + TeamMessage + MediaNews
- FanCenter + FanEvent
- 公关部 / 球迷中心前端

### 批次 6：人才市场 + 交易搜索
- ScoutMission 扩展职员
- TransferMarketPhase 阶段切换
- 交易市场改造
- TeamSearchSelect 组件
- 核心球员页面扩充

---

## 八、待用户确认的关键决策

1. **球员合同去掉**（§2.4）：解读 A 还是 B？
2. **游戏币用途**（§2.3）：是否将 User.coins 改名"经理点数"，仅用于外观/VIP？
3. **世界时钟速率**：1 秒 : 1 分钟 是否合适？是否需要支持加速档（2x / 4x）？
4. **训练计划调整频率**：每天 1 次是否合理？是否需要"训练日"概念（如每周一三五训练）？
5. **受限市场截胡机制**：是否需要"被截胡"逻辑？还是先到先得？
6. **球队资讯条数**：每天上限多少条？建议 10-20 条
7. **核心球员页面**：38 项档案是否全部展示？还是按权限分级（经理可见全部，球迷可见部分）？
8. **赞助商档位**：S/A/B/C/D 五档是否合理？或按球队等级自动定档？

---

## 九、测试页面说明

服务器已恢复（前端 5173 / 后端 3000），测试期间不会关闭，等待用户通知测试完成后再处理。
