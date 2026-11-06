# @hwo/api 生产镜像（多阶段构建）
# 构建上下文：仓库根目录
# docker build -f packages/api/Dockerfile -t hwo-api:latest .

# ---------- 1. base ----------
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.5.2 --activate
WORKDIR /repo

# ---------- 2. deps ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/worker/package.json packages/worker/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile --filter @hwo/api...

# ---------- 3. build ----------
FROM deps AS build
COPY packages/shared packages/shared
COPY packages/api packages/api
COPY packages/worker packages/worker
COPY packages/web packages/web
COPY tsconfig.base.json ./
# 构建 shared 和 api（api 依赖 shared）
RUN pnpm --filter @hwo/shared build && \
    pnpm --filter @hwo/api build && \
    pnpm --filter @hwo/worker build

# ---------- 4. prisma ----------
FROM build AS prisma
WORKDIR /repo/packages/api
# 生成 prisma client（构建时执行）
RUN npx prisma generate

# ---------- 5. runtime ----------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# 仅拷贝运行所需文件
COPY --from=prisma /repo/package.json /repo/pnpm-workspace.yaml /repo/tsconfig.base.json ./
COPY --from=prisma /repo/packages/api/package.json packages/api/package.json
COPY --from=prisma /repo/packages/api/dist packages/api/dist
COPY --from=prisma /repo/packages/api/prisma packages/api/prisma
COPY --from=prisma /repo/packages/shared/package.json packages/shared/package.json
COPY --from=prisma /repo/packages/shared/dist packages/shared/dist
# prisma client 在 node_modules/.prisma 里
COPY --from=prisma /repo/node_modules/.prisma node_modules/.prisma
COPY --from=prisma /repo/node_modules/@prisma node_modules/@prisma
COPY --from=prisma /repo/node_modules/.pnpm node_modules/.pnpm

EXPOSE 3000
CMD ["node", "packages/api/dist/main.js"]
