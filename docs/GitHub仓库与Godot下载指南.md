# GitHub 仓库与 Godot 下载指南

本文档说明如何：
1. 创建 GitHub 仓库（推送代码）
2. 下载安装 Godot 4.3 LTS
3. 配置开发环境

---

## 一、创建 GitHub 仓库

### 方式1：通过 Web 界面（推荐新手）

1. 登录 GitHub（https://github.com）
2. 点击右上角 "+" → "New repository"
3. 填写仓库信息：
   - **Repository name**：`huaxia-shijia-nanbei` 或 `family-legacy`
   - **Description**：国内首款魏晋南北朝门阀家族深度策略游戏
   - **Visibility**：Private（私人）/ Public（公开）
   - **Initialize**：不要勾选任何选项（本地已有README）
4. 点击 "Create repository"
5. 按照 GitHub 提示，关联本地仓库并推送：

```bash
cd "/c/Users/Administrator/WorkBuddy/家业/家业-南北篇"

# 添加远程仓库（替换为你的GitHub用户名）
git remote add origin https://github.com/YOUR_USERNAME/huaxia-shijia-nanbei.git

# 推送主分支
git branch -M main
git push -u origin main
```

### 方式2：通过 GitHub CLI（需先安装）

#### 安装 GitHub CLI

**Windows**：
```powershell
# 使用 winget
winget install --id GitHub.cli

# 或使用 Chocolatey
choco install gh
```

**Mac**：
```bash
brew install gh
```

**Linux**：
```bash
# Debian/Ubuntu
sudo apt install gh
```

#### 登录 GitHub

```bash
gh auth login
```

按提示选择：
- GitHub.com
- HTTPS
- Login with a web browser

#### 创建仓库

```bash
cd "/c/Users/Administrator/WorkBuddy/家业/家业-南北篇"

# 创建仓库并推送
gh repo create huaxia-shijia-nanbei --private --source=. --remote=origin --push
```

参数说明：
- `--private`：私有仓库（公开可改为 `--public`）
- `--source=.`：当前目录
- `--remote=origin`：远程名称
- `--push`：自动推送

### 方式3：通过 SSH（推荐长期使用）

1. **生成 SSH 密钥**（如已有可跳过）：
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. **添加 SSH 密钥到 GitHub**：
   - 复制公钥：`cat ~/.ssh/id_ed25519.pub`
   - GitHub → Settings → SSH and GPG keys → New SSH key → 粘贴

3. **推送**：
   ```bash
   git remote set-url origin git@github.com:YOUR_USERNAME/huaxia-shijia-nanbei.git
   git push -u origin main
   ```

---

## 二、下载安装 Godot 4.3 LTS

### 1. 下载

#### 官方下载（推荐）

访问 https://godotengine.org/download

选择：
- **Godot 4.3 LTS**（不是最新版，是LTS版本）
- **Standard**（标准版，含.NET C#支持）
- 操作系统对应版本：
  - Windows: `Godot_v4.3-stable_win64.exe.zip`
  - Mac: `Godot_v4.3-stable_macos.universal.zip`
  - Linux: `Godot_v4.3-stable_linux.x86_64.zip`

#### 国内镜像（加速下载）

如果官网下载慢，可以使用以下镜像：

- **腾讯云镜像**：https://mirrors.cloud.tencent.com/godot/
- **国内GitHub镜像**：https://ghproxy.com/

### 2. 安装

#### Windows

1. 解压下载的zip文件
2. 将 `Godot_v4.3-stable_win64.exe` 放到合适位置，例如：
   - `D:\DevTools\Godot\`
3. **不要放在带中文或空格的路径**
4. 创建桌面快捷方式（可选）

#### Mac

1. 解压zip文件
2. 拖动Godot.app到Applications文件夹
3. 首次运行可能需要在"系统偏好设置"中允许

#### Linux

1. 解压zip文件
2. 运行：`./Godot_v4.3-stable_linux.x86_64`
3. 或安装为系统命令：
   ```bash
   sudo mv Godot_v4.3-stable_linux.x86_64 /usr/local/bin/godot
   chmod +x /usr/local/bin/godot
   ```

### 3. 验证安装

启动 Godot，应该看到项目管理器界面。

---

## 三、配置开发环境

### 1. 安装 VSCode

#### 下载

访问 https://code.visualstudio.com/Download

#### 推荐扩展

1. **Godot Tools**（CYMotive）
   - GDScript语法高亮、自动补全
   - 项目资源浏览
   - 调试支持

2. **GDScript Formatter**
   - 自动格式化GDScript代码

3. **C# Dev Kit**（如使用C#）
   - C#开发支持

### 2. 关联 VSCode 与 Godot

1. 在 Godot 中打开项目（项目.godot文件）
2. 编辑器 → 编辑器设置
3. 搜索 "external"
4. 设置：
   - **Text Editor → External**：`code` 或 VSCode路径
   - 或在 Godot 项目设置中配置

### 3. 配置 Git

#### 基本配置

```bash
git config --global user.name "你的名字"
git config --global user.email "your_email@example.com"
```

#### 配置 SSH（如使用SSH）

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
cat ~/.ssh/id_ed25519.pub
```

将公钥添加到 GitHub。

#### 配置 GPG 签名（可选但推荐）

```bash
git config --global commit.gpgsign true
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
```

### 4. 创建 Godot 项目

**注意**：本仓库还没有 Godot 项目文件。需要主程入职后创建。

主程入职后：
1. 在 Godot 中"导入项目"
2. 选择 `game/project.godot`（待创建）
3. 开始开发

---

## 四、CI/CD 配置

### GitHub Actions 基础

在 `.github/workflows/` 中已创建目录。

#### 示例：基础 CI

创建 `.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Godot
        uses: chickensoft-games/setup-godot@v2
        with:
          version: 4.3.0
      - name: Build
        run: |
          godot --headless --export-release "Linux/X11" build/game.x86_64
```

详见 `.github/workflows/` 目录（待主程入职后完善）。

---

## 五、推荐的目录结构

### 已创建

```
家业-南北篇/
├── README.md                ✅
├── CHANGELOG.md             ✅
├── CONTRIBUTING.md          ✅
├── PROJECT.md               ✅
├── .gitignore               ✅
│
├── docs/                    ✅ 10个核心文档
├── game/                    📁 Godot工程（待主程创建）
├── tools/                   📁 工具脚本
├── scripts/                 📁 项目脚本
├── ci/                      📁 CI/CD配置
└── .github/workflows/       📁 GitHub Actions
```

### 待主程创建

```
game/
├── project.godot            # Godot项目文件
├── scenes/                  # 场景文件
├── scripts/                 # GDScript/C#
├── data/                    # 数据文件
├── assets/                  # 美术资源
├── ui/                      # UI资源
└── audio/                   # 音频资源
```

---

## 六、常见问题

### Q1：gh 命令找不到？

**解决**：
- 安装 GitHub CLI（见上文）
- 或使用 Web 界面创建仓库

### Q2：git push 被拒绝？

**错误**：`Permission denied (publickey)`

**解决**：
```bash
# 检查SSH连接
ssh -T git@github.com

# 如失败，重新配置SSH
ssh-add ~/.ssh/id_ed25519
```

### Q3：Godot 下载后无法运行？

**Windows**：
- 检查是否解压完整
- 检查是否被杀毒软件拦截
- 尝试"以管理员身份运行"

**Mac**：
- 系统偏好设置 → 安全性与隐私 → 仍要打开

**Linux**：
```bash
chmod +x Godot_v4.3-stable_linux.x86_64
./Godot_v4.3-stable_linux.x86_64
```

### Q4：VSCode 找不到 Godot Tools？

**解决**：
1. 打开 VSCode
2. 左侧扩展栏
3. 搜索 "Godot Tools"（CYMotive）
4. 安装

### Q5：第一次 push 很大？

**原因**：可能提交了 `.godot/`、`*.import` 等生成文件

**解决**：
- 检查 `.gitignore` 是否生效
- 删除已跟踪的生成文件：
  ```bash
  git rm --cached -r .godot/
  git rm --cached -r *.import
  git commit -m "chore: remove generated files"
  ```

---

## 七、下一步行动

### 立即（今天）

1. ✅ 创建 GitHub 仓库
2. ✅ 推送本地代码
3. 🟡 下载 Godot 4.3 LTS
4. 🟡 安装 VSCode + Godot Tools

### 这周

5. ✅ 招人挂出（BOSS直聘/猎聘/社区）
6. 🟡 准备面试题
7. 🟡 美术外包接洽

### 这月

8. ✅ 组建3人核心团队
9. 🟡 完成 M1-W1 任务
10. 🟡 搭建 CI/CD 基础

---

**最后更新**：2026-09-07

**项目方**：待补
**联系邮箱**：TBD