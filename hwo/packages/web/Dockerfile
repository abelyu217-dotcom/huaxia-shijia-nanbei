# @hwo/web 生产镜像：构建静态资源 + nginx 托管 + /api 反代
# 构建上下文：仓库根目录
# docker build -f packages/web/Dockerfile -t hwo-web:latest .

# ---------- 1. build static assets ----------
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.5.2 --activate
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/
COPY packages/api/package.json packages/api/
RUN pnpm install --frozen-lockfile --filter @hwo/web...

COPY packages/shared packages/shared
COPY packages/web packages/web
COPY tsconfig.base.json ./
RUN pnpm --filter @hwo/shared build && \
    pnpm --filter @hwo/web build
# 输出在 /repo/packages/web/dist

# ---------- 2. runtime (nginx) ----------
FROM nginx:1.27-alpine AS runtime
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/packages/web/dist /usr/share/nginx/html
EXPOSE 80
