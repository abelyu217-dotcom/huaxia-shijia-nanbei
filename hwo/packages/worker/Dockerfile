# @hwo/worker 生产镜像（多阶段构建）
# 构建上下文：仓库根目录
# docker build -f packages/worker/Dockerfile -t hwo-worker:latest .

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.5.2 --activate
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/worker/package.json packages/worker/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile --filter @hwo/worker...

FROM deps AS build
COPY packages/shared packages/shared
COPY packages/api packages/api
COPY packages/worker packages/worker
COPY packages/web packages/web
COPY tsconfig.base.json ./
RUN pnpm --filter @hwo/shared build && \
    pnpm --filter @hwo/worker build

FROM build AS prisma
WORKDIR /repo/packages/api
RUN npx prisma generate

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prisma /repo/package.json /repo/pnpm-workspace.yaml /repo/tsconfig.base.json ./
COPY --from=prisma /repo/packages/worker/package.json packages/worker/package.json
COPY --from=prisma /repo/packages/worker/dist packages/worker/dist
COPY --from=prisma /repo/packages/shared/package.json packages/shared/package.json
COPY --from=prisma /repo/packages/shared/dist packages/shared/dist
COPY --from=prisma /repo/packages/api/prisma packages/api/prisma
COPY --from=prisma /repo/node_modules/.prisma node_modules/.prisma
COPY --from=prisma /repo/node_modules/@prisma node_modules/@prisma
COPY --from=prisma /repo/node_modules/.pnpm node_modules/.pnpm

CMD ["node", "packages/worker/dist/worker.js"]
