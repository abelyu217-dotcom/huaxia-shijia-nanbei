# 贡献指南

> 感谢你考虑为《家业-南北篇》做出贡献！

## 📋 项目状态

**当前阶段**：M0 启动阶段（招人+环境搭建）
**M1 启动时间**：待团队组建完成

我们欢迎以下贡献：
- 🐛 Bug报告（Issue）
- 📝 文档改进（PR）
- 💡 功能建议（Discussion）
- 🎨 美术资源（待M1启动后）
- 💻 代码贡献（M1后）

---

## 🚀 快速开始

### 团队成员

1. **克隆仓库**
   ```bash
   git clone https://github.com/[org]/huaxia-shijia-nanbei.git
   cd huaxia-shijia-nanbei
   ```

2. **安装依赖**
   - Godot 4.3 LTS: https://godotengine.org/download
   - VSCode + Godot Tools 扩展
   - Git 2.0+

3. **打开项目**
   ```bash
   # 在 Godot 中打开 game/project.godot
   # 或在 Godot 中"导入项目"
   ```

4. **首次运行**
   - 在 Godot 中按 F5 启动
   - 应能进入主菜单（开发中可能为黑屏/默认场景）

---

## 📁 项目结构

```
家业-南北篇/
├── docs/          # 设计文档（必读）
├── game/          # Godot 工程
├── tools/         # 工具脚本
├── ci/            # CI/CD 配置
└── .github/       # GitHub 配置
```

**开发主要在 `game/` 目录，文档在 `docs/` 目录。**

---

## 🌿 分支策略

使用 Git Flow 工作流：

```
master (main)
  ↑
  ├── develop (开发主分支)
  │     ↑
  │     ├── feature/* (功能开发)
  │     ├── bugfix/* (Bug修复)
  │     └── refactor/* (重构)
  │
  ├── release/* (发布准备)
  └── hotfix/* (紧急修复)
```

### 分支命名规范

- `feature/xxx`：新功能
- `bugfix/xxx`：Bug修复
- `refactor/xxx`：重构
- `docs/xxx`：文档更新
- `test/xxx`：测试相关

### Commit 信息规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 添加联姻系统
fix: 修复存档损坏问题
docs: 更新架构文档
refactor: 重构族谱系统
test: 添加数值测试用例
chore: 更新依赖
```

示例：
```
feat(family): 添加家族品级晋升机制

- 实现九品中正制数值化
- 添加升品触发条件
- 单元测试覆盖率 80%

Closes #123
```

---

## 📝 开发规范

### 代码规范

#### GDScript
- 遵循 [Godot 官方风格指南](https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_styleguide.html)
- 使用 `snake_case` 命名
- 类名使用 `PascalCase`
- 常量使用 `UPPER_SNAKE_CASE`
- 缩进使用 **Tab**（Godot 默认）

#### C#
- 遵循 [.NET 命名规范](https://learn.microsoft.com/dotnet/csharp/fundamentals/coding-style/coding-conventions)
- 接口以 `I` 开头
- 异步方法以 `Async` 结尾

#### SQL
- 使用 `snake_case` 命名
- 表名使用复数
- 主键统一命名为 `id`

### 文档规范

- 所有文档使用 Markdown
- 文件命名：`YYYY-MM-DD_文档类型_标题.md`
- 中文文档使用 UTF-8 编码
- 中英混合时保留必要空格

### 美术规范

详见 [docs/04-美术风格指南/](docs/04-美术风格指南/)

---

## 🧪 测试规范

### 单元测试

- 所有核心业务逻辑必须有单元测试
- 覆盖率目标 ≥ 70%
- 测试文件命名：`*_test.gd` 或 `*Test.cs`

### 集成测试

- 关键流程（家族建立、单回合、存档）必须有集成测试
- 性能测试：60 FPS / 500MB 内存

### Playtest

- 每周五下午进行内部 Playtest
- 每月最后一个周五进行扩大 Playtest
- 收集反馈表 + 用户访谈

---

## 🔍 代码审查

所有代码合并前必须经过 Code Review：

1. 至少 1 名团队成员 Approve
2. CI/CD 必须通过
3. 测试覆盖率不能下降
4. 文档必须同步更新

---

## 🐛 Bug 报告

提交 Issue 时请包含：

1. **Bug 描述**：清晰、简洁
2. **复现步骤**：详细的步骤
3. **期望行为**：应该发生什么
4. **实际行为**：实际发生了什么
5. **截图/录屏**：如有
6. **环境**：操作系统、Godot版本、硬件配置
7. **日志**：如有

模板：
```markdown
## Bug 描述
简要描述

## 复现步骤
1. 第一步
2. 第二步
3. ...

## 期望行为
应该发生什么

## 实际行为
实际发生了什么

## 环境
- OS: Windows 11
- Godot: 4.3 LTS
- 显卡: RTX 3060

## 截图/日志
（附上）
```

---

## 💡 功能建议

在 Discussion 中提交，包含：

1. **背景**：为什么需要这个功能
2. **目标用户**：谁会受益
3. **建议方案**：具体如何实现
4. **替代方案**：还有哪些选项
5. **影响评估**：对其他功能的影响

---

## 📞 联系方式

- **GitHub Issues**：报告Bug和功能请求
- **GitHub Discussions**：讨论和建议
- **项目邮箱**：TBD
- **Discord**：TBD

---

## 📜 许可证

提交代码即表示你同意你的代码按项目许可证授权。

详见 [LICENSE](LICENSE)（待定）

---

## 🙏 致谢

感谢所有贡献者！

<!-- ALL-CONTRIBUTORS-LIST:START -->
<!-- 贡献者列表（自动生成） -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

---

**最后更新**：2026-09-07