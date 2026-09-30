# 篮球经理游戏 UI 调研与 HWO 借鉴方案

> 调研对象：JBL(jblfl.com) · Rim Attack(playrimattack.com) · BasketPulse(basketpulse.com)
> 调研日期：2026-09-30
> 目标：提取可落地的 UI 布局与游戏系统改进点，为 HWO 下一阶段迭代提供参考

---

## 一、三游戏布局结构横向对比

| 维度 | JBL | Rim Attack | BasketPulse | HWO 现状 |
|:---|:---|:---|:---|:---|
| **整体框架** | 顶栏 + 固定左栏 + 可滚主区 | 顶栏状态栏 + 固定左栏 + 主区 | 营销落地页（单列） | 顶栏 + 主区（无左栏） |
| **顶部信息密度** | 赛季/联赛/日期/通知/设置 | 赛季状态/游戏时间/队伍/金币/快捷入口 | Logo + 登录注册 Tab | 品牌 + 导航 Tab + 登出 |
| **侧边栏** | 两级菜单（球队 / 联盟） | 分组菜单（Team/Personnel/Games/Rim Attack） | 无 | 无（导航放顶栏 Tab） |
| **主区组织** | 面包屑 + Tab + 内容 | Tab + 子Tab + 内容 | 卡片网格 | 单页面内容 |
| **配色** | 深紫黑 (#1a1a2e) + 蓝紫强调 | 深黑 (#0D0D0D) + 橙 (#FF6600) | 白/蓝/灰 | 深蓝黑 (#0b0f17) + 橙 (#ff6b35) |
| **保存机制** | 顶部"Save All Changes" + Last saved 时间戳 | "Save Tactics"/"Set as Default" 按钮 | - | 各页面独立保存按钮 |

### 关键差异：HWO 缺左侧栏

三个游戏**全部采用"顶栏 + 固定左栏 + 主区"的三栏管理后台布局**。HWO 目前把所有导航塞在顶栏 Tab，当功能模块增多（生涯/青训/选秀/交易/战术/训练/球探…）时顶栏会拥挤。

---

## 二、JBL 深度图 & 战术系统借鉴

### 2.1 Depth Chart（深度图）

**JBL 实现**：
- 5 个位置（PG/SG/SF/PF/C）**垂直排列**
- 每位置 **4 档**：首发 / 替补 / 第三阵容 / 第四阵容
- 用**下拉选择器**替换球员，不用滑块设轮换时间
- 球员卡片：姓名 + 身高 + 星级 + 位置缩写
- 顶部有"Save All Changes"按钮 + "Last saved"时间戳

**对 HWO 的借鉴**：
- HWO 当前 LineupEditor 只有首发 5 人，缺少深度图概念。可在阵容页加 **Depth Chart 子页**：5 位置 × N 档表格，下拉选球员。
- 轮换分钟可用"档位 + 分钟输入框"组合（比纯滑块更精确）。

### 2.2 Strategy（战术）

**JBL 实现**：
- 分两大区：**Offensive Settings** + **Offensive Emphasis Points**
- Offensive Settings：Pace / Offensive Focus / Ball Distribution / Offensive Freedom（4 个下拉）
- Emphasis Points：**最多选 2 项**，每项带 **Familiarity 熟练度滑块**
- 防守同理（Defense Intensity / Screen Defense / Defense Emphasis）

**对 HWO 的借鉴**：
- HWO 战术编辑器已实现上述字段（pace/offenseFocus/emphasis/screenDef），可直接对齐。
- **可补"Familiarity 熟练度"机制**：每个战术选项有熟练度进度，随使用场次提升，影响战术执行效果——增加养成深度。

### 2.3 Playbook（战术板）

**JBL 实现**：
- Season Usage 统计（各战术使用率）
- Offensive Tendencies 条形图（三分/中投/内线/突破倾向）
- Signature Actions 战术动作矩阵
- Coach's Signature 教练签名战术

**对 HWO 的借鉴**：
- HWO 已有 playbook action 库，可在战术页加 **"战术使用率统计"** 可视化区域，让玩家看到自己战术的实际执行分布。

---

## 三、Rim Attack 核心系统借鉴

### 3.1 Roster（阵容）—— 信息密度最高的设计

**RA 实现**：
- 表格列：姓名、号码、位置、年龄、**PROJ.POT 潜力评级**、身高、**OVR（橙色高亮）**、**≈TRV 市场估值**、状态、PHY/SHO/DEF/BAL/MEN 五维
- 位置筛选按钮组：PG / SG / SF / PF / C（可多选）
- 视图切换：**Compact（5项均值）/ All 27（全能力）**
- 子 Tab：Abilities / Stats / Advanced / Advanced Analysis / Contracts / Next season
- 球员标签：Init（新秀-紫）、Core（核心-橙）

**对 HWO 的借鉴**：
- HWO 阵容页可升级为**表格视图**：加"市场估值"列（根据 OVR+年龄+合同算出的交易价值），加"潜力"列，加位置筛选。
- 加 **Compact/Detailed 视图切换**，减少滚动。
- 球员加 **Core 核心标记**（玩家手动标记或按 OVR 自动标记）。

### 3.2 Tactics（战术）—— 球场可视化

**RA 实现**：
- **Basic / Advanced 编辑级别切换**（新手简化、高手全开）
- **Player Tactical Positions 球场板**：真实篮球场可视化，5 位置放球员卡片，可拖拽/点击替换
- "No-Sub-When-Fatigued"（疲劳时不轮换）开关
- **Board style 选择器**（主题皮肤：Obsidian Lava 等）
- 条件轮换规则表格：Label/Action + Trigger Condition（如 0:00~5:00 强制某球员上场）
- 球队条件战术 + 个人条件战术分层

**对 HWO 的借鉴**：
- **加球场可视化战术板**：在战术编辑器用 SVG/Canvas 画半场，5 个位置放球员头像，比纯下拉更直观。
- **加 Basic/Advanced 切换**：新手只显示 pace/focus，高级用户才看 emphasis/screenDef/familiarity，降低上手门槛。
- **条件轮换**：可设"第X节X分钟时让某球员上场"，HWO 已有 rotation grid，可加条件触发。

### 3.3 Training（训练）—— 周度训练表

**RA 实现**：
- 周度训练表格：每个球员选 **Drill（26 种：Speed/Vertical/Strength/Agility...）**
- Tch 技术评级（A+/A/.../E/N 字母等级，彩色徽章）
- Exp 经验、Frm 疲劳、Sns 敏感度、Coo 协调、Def/Reb/Int
- CHANGE 变化值（绿 + / 红 -）、Points 训练得分
- 评级配色：A 绿、B 黄橙、C 浅橙、D 红、E 灰

**对 HWO 的借鉴**：
- HWO 训练系统可升级：每个球员选**训练项目**而非单一训练，项目影响不同能力。
- **字母评级徽章**（A+/A-/B+...）比纯数字更直观，OVR 可用同色系。
- 疲劳（Frm）独立维度，影响轮换和比赛表现。

### 3.4 配色与状态体系

**RA 配色**：
- 主橙 #FF6600（按钮/高亮/进度条/标签）
- 深黑背景 #0D0D0D~#1A1A1A
- **状态色**：Peak Form 金、Good Form 橙、Slightly Tired 蓝、Exhausted 灰、Well Prepared 绿
- **评级色**：A 绿、B 黄橙、C 浅橙、D 红、E 灰

**对 HWO 的借鉴**：
- HWO 已有橙主色，可引入**球员状态色体系**（Peak/Good/Tired/Exhausted），在阵容和比赛模拟中显示。
- OVR 等级色可细化：按数值段给色（≥90 金、80-89 紫、70-79 蓝、<70 灰），与 RA 评级色对齐。

---

## 四、BasketPulse 借鉴（营销与社区）

**BP 首页特色**：
- 免费游戏、Time friendly（时间友好，不肝）、球迷社区、自定义球员命名、篮球国度
- TOP Players / TOP national teams 排行榜
- 用户评价卡片

**对 HWO 的借鉴**：
- 加 **"Time friendly" 设计理念**：每个页面操作不超过 3 步，避免信息过载。
- 加 **TOP Players / TOP Teams 排行榜**（已有 standings，可加球员榜）。
- 球员命名自定义（已有）。

---

## 五、HWO 具体改进优先级（按 ROI 排序）

### P0 — 布局架构升级（影响所有页面）
1. **引入左侧栏导航**：顶栏精简为品牌+赛季信息+用户区；左栏放所有功能模块（球队/阵容/战术/训练/交易/生涯/青训/选秀/赛程/联盟）。参考 RA 的分组菜单 + JBL 的两级菜单。
2. **顶栏加赛季/日期/球队状态**：参考 RA 顶栏（赛季状态、游戏时间、队伍名、快捷入口）。

### P1 — 阵容与深度图
3. **阵容页升级为表格视图**：加市场估值、潜力、位置筛选、Compact/Detailed 切换。参考 RA Roster。
4. **新增 Depth Chart 深度图页**：5 位置 × 4 档，下拉选球员，分钟输入框。参考 JBL Depth Chart。

### P2 — 战术系统增强
5. **战术页加 Basic/Advanced 切换**。参考 RA Tactics。
6. **加球场可视化战术板**（SVG 半场 + 球员卡片）。参考 RA。
7. **加 Familiarity 熟练度机制**。参考 JBL Strategy。
8. **加战术使用率统计可视化**。参考 JBL Playbook。

### P3 — 训练与状态体系
9. **训练升级为项目选择 + 字母评级**。参考 RA Training。
10. **引入球员状态色体系**（Peak/Good/Tired/Exhausted）。参考 RA。

### P4 — 视觉与体验
11. **OVR 等级色细化**（金/紫/蓝/灰）。参考 RA 评级色。
12. **统一保存机制**：战术页顶部"Save All Changes" + "Last saved"时间戳。参考 JBL。
13. **加 TOP 球员/球队排行榜**。参考 BP。

---

## 六、布局草图（推荐 HWO 新架构）

```
┌─────────────────────────────────────────────────────────────┐
│  HWO  2026-2027 赛季 · 第15日    南京金陵公牛  💰 1250万  ⚙ │  ← 顶栏（精简）
├──────────┬──────────────────────────────────────────────────┤
│ 球队     │  [面包屑] 球队管理 > 阵容                         │
│ ├ 阵容   │  ┌────────────────────────────────────────────┐  │
│ ├ 深度图 │  │ 位置筛选: [PG][SG][SF][PF][C]  [Compact▼]  │  │
│ ├ 战术   │  │ ┌────┬────┬────┬────┬────┬────┐            │  │
│ 训练     │  │ │姓名│POS│OVR │潜力│估值│状态│            │  │
│ ├ 周训练 │  │ ├────┼────┼────┼────┼────┼────┤            │  │
│ ├ 球探   │  │ │陈杰│SF │ 72 │ B  │1640│Good│            │  │
│ 交易     │  │ └────┴────┴────┴────┴────┴────┘            │  │
│ ├ 发起   │  └────────────────────────────────────────────┘  │
│ 生涯     │                                                  │
│ 青训     │  主内容区（随页面变化）                            │
│ 选秀     │                                                  │
│ 赛程     │                                                  │
│ 联盟     │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

---

## 七、实施建议

- **分步实施**：先做 P0 布局架构（左栏 + 顶栏精简），再做 P1 阵容/深度图，最后 P2-P4 战术/训练增强。
- **保持深色主题**：HWO 当前深蓝黑 + 橙与 RA 风格接近，无需大改配色，只需细化状态色和 OVR 等级色。
- **表格优先**：阵容/训练/市场等数据密集页用表格（RA 风格），战术/深度图用可视化（JBL 风格）。
- **保存统一**：所有设置页用"顶部保存按钮 + Last saved"模式，替代各页面分散保存。

---

*本方案基于公开页面调研，BasketPulse 游戏内界面需注册后进一步补充。*
