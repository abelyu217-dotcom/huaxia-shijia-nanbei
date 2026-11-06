# Hoops World Online · 篮球经理世界

多人在线篮球经理 F2P 游戏。浏览器 PWA，服务端权威 sim，每日同步批量结算。

## 技术栈

- **前端**：React + Vite + TypeScript + PWA
- **后端**：Node.js + NestJS + TypeScript
- **sim 引擎**：纯 TypeScript 纯函数（确定性 PRNG，可重放/审计/灰度调参）
- **数据库**：PostgreSQL + Redis
- **队列**：BullMQ（每日结算并行 sim）

## 仓库结构

```
hwo/
├── packages/
│   ├── shared/    # 共享类型 + sim 引擎（前后端共用）
│   ├── api/       # NestJS 服务端
│   ├── worker/    # BullMQ sim worker
│   └── web/       # React + Vite 前端
├── docker-compose.yml
└── .github/workflows/
```

## 快速开始

```bash
# 1. 启动基础设施（PostgreSQL/Redis/MinIO）
docker compose up -d

# 2. 安装依赖
pnpm install

# 3. 运行测试（含 sim 确定性测试）
pnpm test

# 4. 启动开发环境（API + Web 并行）
pnpm dev
```

- API：http://localhost:3000
- Web：http://localhost:5173

## 核心命令

| 命令 | 说明 |
|------|------|
| `pnpm test` | 全部测试 |
| `pnpm test:determinism` | sim 确定性测试（CI 阻断部署） |
| `pnpm build` | 构建全部包 |
| `pnpm dev` | 并行启动 API + Web 开发服务器 |

## 设计文档

详细系统设计见 `/workspace/*.html`（17 个核心系统 + 技术架构）。
