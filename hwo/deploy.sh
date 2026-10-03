#!/usr/bin/env bash
# HWO 一键部署脚本（腾讯云 CVM）
#
# 用法（在仓库根目录）：
#   ./deploy.sh setup       # 首次：装 Docker + Docker Compose
#   ./deploy.sh init-env    # 首次：生成 .env 并填强密码
#   ./deploy.sh build       # 构建三个镜像
#   ./deploy.sh up          # 启动整套服务
#   ./deploy.sh migrate     # 应用 Prisma migration
#   ./deploy.sh seed        # 灌入种子数据（仅首次）
#   ./deploy.sh logs        # 滚动日志
#   ./deploy.sh down        # 停止
#   ./deploy.sh update      # git pull + rebuild + restart（更新代码后用）
#   ./deploy.sh backup      # 备份 postgres 到 ./backups/

set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"
ENV_FILE=".env"

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }

require_env() {
  if [ ! -f "$ENV_FILE" ]; then
    red "错误：$ENV_FILE 不存在。先运行 ./deploy.sh init-env"
    exit 1
  fi
}

cmd_setup() {
  green "==> 安装 Docker + Compose 插件"
  if command -v docker &>/dev/null; then
    yellow "Docker 已安装：$(docker --version)"
  else
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
  fi
  docker --version
  docker compose version
  green "==> 设置 docker 日志轮转"
  sudo mkdir -p /etc/docker
  cat <<'EOF' | sudo tee /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "3" }
}
EOF
  sudo systemctl restart docker
  green "完成"
}

cmd_init_env() {
  if [ -f "$ENV_FILE" ]; then
    yellow "$ENV_FILE 已存在，跳过生成"
    return
  fi
  green "==> 生成 $ENV_FILE"
  local pg_pass redis_pass minio_pass jwt
  pg_pass=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  redis_pass=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  minio_pass=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  jwt=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  sed -e "s|__REPLACE_ME_WITH_STRONG_PASSWORD__|$pg_pass|g" \
      -e "s|REDIS_PASSWORD=__REPLACE_ME_WITH_STRONG_PASSWORD__|REDIS_PASSWORD=$redis_pass|" \
      -e "s|MINIO_ROOT_PASSWORD=__REPLACE_ME_WITH_STRONG_PASSWORD__|MINIO_ROOT_PASSWORD=$minio_pass|" \
      -e "s|JWT_SECRET=__REPLACE_ME_WITH_STRONG_PASSWORD__|JWT_SECRET=$jwt|" \
      .env.production.example > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  green "完成。密码已写入 $ENV_FILE（仅 root 可读）"
  yellow "记得保留好 .env 备份"
}

cmd_build() {
  require_env
  green "==> 构建镜像"
  $COMPOSE build
}

cmd_up() {
  require_env
  green "==> 启动服务"
  $COMPOSE up -d
  yellow "等待健康检查..."
  $COMPOSE ps
}

cmd_migrate() {
  require_env
  green "==> 应用 Prisma migration"
  $COMPOSE exec -T api sh -c "cd packages/api && npx prisma migrate deploy"
}

cmd_seed() {
  require_env
  green "==> 灌入种子数据（仅首次）"
  $COMPOSE exec -T api sh -c "cd packages/api && npx prisma db seed"
}

cmd_logs() {
  require_env
  $COMPOSE logs -f --tail=200
}

cmd_down() {
  require_env
  $COMPOSE down
}

cmd_update() {
  require_env
  green "==> git pull"
  git pull --ff-only
  green "==> 重新构建 + 重启"
  $COMPOSE build
  $COMPOSE up -d
  green "==> migrate"
  cmd_migrate
  green "完成"
}

cmd_backup() {
  require_env
  local ts=$(date +%Y%m%d-%H%M%S)
  mkdir -p backups
  green "==> 备份 postgres 到 ./backups/pg-$ts.sql.gz"
  $COMPOSE exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "backups/pg-$ts.sql.gz"
  green "完成"
}

cmd_restore() {
  require_env
  local file=$1
  [ -z "$file" ] && { red "用法: ./deploy.sh restore <backup.sql.gz>"; exit 1; }
  red "警告：将从 $file 恢复，会覆盖现有数据！"
  read -p "确认输入 yes 继续: " ans
  [ "$ans" = "yes" ] || { yellow "已取消"; exit 0; }
  gunzip -c "$file" | $COMPOSE exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
  green "恢复完成"
}

case "${1:-}" in
  setup)    cmd_setup ;;
  init-env) cmd_init_env ;;
  build)    cmd_build ;;
  up)       cmd_up ;;
  migrate)  cmd_migrate ;;
  seed)     cmd_seed ;;
  logs)     cmd_logs ;;
  down)     cmd_down ;;
  update)   cmd_update ;;
  backup)   cmd_backup ;;
  restore)  cmd_restore "${2:-}" ;;
  *)
    cat <<EOF
HWO 部署脚本

用法：
  ./deploy.sh setup       # 首次：安装 Docker
  ./deploy.sh init-env    # 首次：生成 .env（强密码）
  ./deploy.sh build       # 构建 api/worker/web 镜像
  ./deploy.sh up          # 启动服务
  ./deploy.sh migrate     # 应用数据库 migration
  ./deploy.sh seed        # 灌种子数据（仅首次）
  ./deploy.sh logs        # 滚动日志
  ./deploy.sh down        # 停止
  ./deploy.sh update      # git pull + rebuild + restart
  ./deploy.sh backup      # 备份 postgres
  ./deploy.sh restore <f> # 从备份恢复

首次部署顺序：setup → init-env → build → up → migrate → seed
EOF
    exit 1 ;;
esac
