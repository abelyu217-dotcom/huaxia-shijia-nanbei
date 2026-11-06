# @hwo/api 生产镜像（多阶段构建）
# 构建上下文：仓库根目录

# ---------- 1. base ----------
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.5.2 --activate
WORKDIR /repo

# ---------- 2. deps + build ----------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/worker/package.json packages/worker/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile --filter @hwo/api...

COPY packages/shared packages/shared
COPY packages/api packages/api
COPY tsconfig.base.json ./
# 先生成 Prisma Client（TypeScript 编译需要类型）
RUN cd /repo/packages/api && npx prisma generate
# 构建 shared 和 api
RUN pnpm --filter @hwo/shared build && \
    pnpm --filter @hwo/api build

# ---------- 3. runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

# 拷贝 package.json 等用于安装生产依赖
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json

# 安装生产依赖（含 @prisma/client）
RUN pnpm install --frozen-lockfile --filter @hwo/api... --prod

# 拷贝构建产物和 prisma schema
COPY --from=build /repo/packages/api/dist packages/api/dist
COPY --from=build /repo/packages/api/prisma packages/api/prisma
COPY --from=build /repo/packages/shared/dist packages/shared/dist

# 重新生成 Prisma Client（运行时需要）
RUN cd /app/packages/api && npx prisma generate

EXPOSE 3000
CMD ["node", "packages/api/dist/main.js"]
