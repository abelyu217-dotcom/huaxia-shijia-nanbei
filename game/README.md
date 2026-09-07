# 《家业-南北篇》Godot 4.3 工程

> 这是《家业-南北篇》的游戏工程，使用 Godot 4.3 LTS + GDScript 开发。

## 📦 项目结构

```
game/
├── project.godot                 # Godot 项目配置
├── assets/
│   └── icon.svg                  # 项目图标
├── data/                         # JSON 数据
│   ├── families/                 # 家族配置
│   │   └── families.json
│   ├── characters/               # 角色配置
│   │   └── characters.json
│   ├── events/                   # 事件脚本
│   │   └── events.json
│   ├── estates/                  # 田庄配置
│   │   └── estates.json
│   └── configs/                  # 游戏规则
│       └── game_config.json
├── scripts/
│   ├── managers/                 # 自动加载单例（核心系统）
│   │   ├── GameManager.gd        # 全局游戏管理
│   │   ├── FamilyManager.gd      # 家族系统
│   │   ├── CharacterManager.gd   # 角色系统
│   │   ├── RelationshipManager.gd # 关系系统
│   │   ├── TimeManager.gd        # 时间推进
│   │   ├── EventManager.gd       # 事件系统
│   │   ├── SaveManager.gd        # 存档管理
│   │   └── EstateManager.gd      # 田庄系统
│   └── ui/                       # UI 场景脚本
│       ├── MainMenu.gd           # 主菜单
│       ├── FamilyPanel.gd        # 家族面板（主界面）
│       ├── CultivationScene.gd   # 养成界面
│       ├── MarriageScene.gd      # 联姻界面
│       ├── ConversationScene.gd  # 清谈界面
│       └── WarScene.gd           # 战争界面（淝水之战）
└── scenes/
    ├── main/
    │   └── MainMenu.tscn
    ├── family/
    │   └── FamilyPanel.tscn
    ├── character/
    │   ├── CultivationScene.tscn
    │   ├── MarriageScene.tscn
    │   └── ConversationScene.tscn
    └── war/
        └── WarScene.tscn
```

## 🚀 如何运行

### 前置要求
- Godot 4.3 LTS 或更高版本
- 下载地址：https://godotengine.org/download

### 步骤

1. **克隆仓库**
   ```bash
   git clone https://github.com/abelyu217-dotcom/huaxia-shijia-nanbei.git
   cd huaxia-shijia-nanbei/game
   ```

2. **打开 Godot**
   - 启动 Godot 4
   - 点击"导入"按钮
   - 选择 `game/project.godot` 文件
   - 项目会自动加载

3. **运行游戏**
   - 在 Godot 编辑器中按 F5
   - 或点击右上角的播放按钮

## 🎮 玩法说明

### 5个核心场景

1. **主菜单**：选择3个预设家族（琅琊王氏 / 陈郡谢氏 / 谯国桓氏）
2. **家族面板**：查看家族信息、田庄、族人列表
3. **养成界面**：选择族人、培养方向、培养时长
4. **联姻界面**：查看候选对象、确认联姻、生成后代
5. **清谈品评**：选择辩手和议题，进行清谈
6. **战争场景**：淝水之战（383年）

### 核心循环

```
创建家族 → 培养族人 → 田庄经营 → 联姻外交 → 清谈品评 → 应对事件 → 推进时间 → 结束/继续
```

## 🛠️ 已实现的系统

### 核心系统（自动加载）
- ✅ GameManager：游戏全局管理、数据加载、家族/角色状态
- ✅ FamilyManager：家族品级评估、联姻匹配、后代生成、功业管理
- ✅ CharacterManager：角色年龄、培养方向、属性成长
- ✅ RelationshipManager：血缘/姻亲/社交/政治关系管理
- ✅ TimeManager：时间推进、季节事件触发、年终结算
- ✅ EventManager：事件触发条件、选择处理、后果应用
- ✅ SaveManager：多存档槽位、JSON 序列化、版本兼容
- ✅ EstateManager：田庄收入/开支、建设/升级、部曲管理

### UI 场景
- ✅ MainMenu：3个预设家族选择
- ✅ FamilyPanel：主界面（时间、家族、族人、田庄）
- ✅ CultivationScene：5个培养方向
- ✅ MarriageScene：联姻匹配 + 后代生成
- ✅ ConversationScene：8个议题、2-4名辩手
- ✅ WarScene：淝水之战完整模拟

## 📚 数据规模

- **3 个预设家族**：琅琊王氏、陈郡谢氏、谯国桓氏
- **12 个核心角色**：王导、王敦、王羲之、谢安、谢玄、谢道韫、桓温、桓冲、桓玄等
- **5 个核心历史事件**：衣冠南渡、王敦之乱、苏峻之乱、兰亭雅集、淝水之战
- **6 种田庄类型**：顶级、普通、寒门、书香、军镇、寺院
- **8 个清谈议题**：老庄、周易、佛理、人物品评、诗文、琴棋书画、政事、军事

## 🎯 下一步开发

- [ ] 美术资源接入（黑白线稿角色立绘）
- [ ] 音效与背景音乐
- [ ] 更多角色对话脚本
- [ ] 自建家族系统
- [ ] 北朝剧本扩展
- [ ] 女性视角剧本
- [ ] Steam 发布准备

## 📖 相关文档

完整设计文档位于 `docs/` 目录：
- `docs/01-概念方案/` — 项目定位
- `docs/02-详细GDD/` — 数值与剧本
- `docs/03-原型PRD/` — 核心可玩原型需求
- `docs/04-美术风格指南/` — 视觉规范
- `docs/05-技术架构/` — 架构详细设计
- `docs/06-详细剧本/` — 剧本内容
- `docs/07-自建家族/` — 自建家族机制
- `docs/08-称王称帝/` — 帝王路线
- `docs/09-内容扩展/` — DLC 规划
- `docs/10-开发启动/` — 启动手册
- `docs/11-设计文档/` — 参考卡与文案集

## 📄 许可证

本项目所有代码采用 MIT 许可证。
美术资源、剧本内容采用 CC BY-NC-SA 4.0 许可证。