# Godot 工程占位符

> 本目录将存放 Godot 4.3 LTS 工程项目文件。

## 📁 待主程入职后创建

```
game/
├── project.godot              # Godot 项目主文件
├── icon.svg                   # 项目图标
├── icon.svg.import            # 导入配置
├── .gitattributes             # Git属性
│
├── scenes/                    # 场景文件 (.tscn)
│   ├── main/                  # 主场景
│   ├── ui/                    # UI场景
│   ├── family/                # 家族系统
│   ├── character/             # 角色系统
│   └── event/                 # 事件系统
│
├── scripts/                   # 脚本文件
│   ├── core/                  # 核心模块
│   │   ├── game_manager.gd    # 游戏管理器
│   │   ├── data_manager.gd    # 数据管理器
│   │   ├── event_bus.gd       # 事件总线
│   │   ├── save_manager.gd    # 存档管理器
│   │   └── time_manager.gd    # 时间轴管理器
│   ├── family/                # 家族系统
│   │   ├── family.gd
│   │   ├── family_member.gd
│   │   └── family_tree.gd
│   ├── character/             # 角色系统
│   │   ├── character.gd
│   │   ├── character_stats.gd
│   │   └── relationship.gd
│   ├── event/                 # 事件系统
│   │   ├── event.gd
│   │   ├── event_chain.gd
│   │   └── event_trigger.gd
│   ├── culture/               # 文化系统
│   │   └── cultural_event.gd
│   ├── military/              # 军事系统
│   │   └── battle.gd
│   └── ui/                    # UI脚本
│       └── ui_controller.gd
│
├── data/                      # 数据文件
│   ├── config/                # 配置文件
│   │   ├── family_config.json
│   │   ├── character_template.json
│   │   └── event_config.json
│   └── save/                  # 存档目录（git忽略）
│
├── assets/                    # 美术资源
│   ├── characters/            # 角色立绘
│   ├── scenes/                # 场景原画
│   ├── ui/                    # UI资源
│   ├── effects/               # 特效
│   └── audio/                 # 音频（指向game/audio）
│
├── ui/                        # UI资源
│   ├── themes/                # 主题
│   ├── fonts/                 # 字体
│   └── icons/                 # 图标
│
└── audio/                     # 音频
    ├── bgm/                   # 背景音乐
    └── sfx/                   # 音效
```

## 🚀 主程入职后第一件事

1. 安装 Godot 4.3 LTS（详见 [GitHub仓库与Godot下载指南.md](../GitHub仓库与Godot下载指南.md)）
2. 在 Godot 中"导入项目" → 选择 `game/project.godot`
3. 配置 Git（详见 CONTRIBUTING.md）
4. 创建第一个 Hello World 场景
5. 配置 CI/CD

---

**创建时间**：2026-09-07
**等待主程入职**