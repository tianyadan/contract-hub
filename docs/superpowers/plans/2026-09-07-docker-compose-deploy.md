# Docker Compose Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Docker Compose 统一部署 frontend(nginx) + Go backend + Python document-engine + MySQL，公网仅开放 80，并在 `122.51.86.159` 上线。

**Architecture:** 仓库根目录 `docker-compose.yml`；各服务独立 Dockerfile；Nginx 托管前端并反代 `/api`（含 WebSocket）与 `/swagger`；MySQL 首次空卷用 `deploy/mysql/init` 按序执行 SQL；密钥仅服务器 `.env`。

**Tech Stack:** Docker Compose v2, nginx:alpine, golang:1.25, python:3.12-slim, mysql:8.0, node:22-alpine

## Global Constraints

- 公网只映射宿主机端口 **80**
- 真实密钥不进 Git；仅 `.env.example` 入库
- MySQL 不执行 `migrate_v1_data.sql`
- 跳过 `migrate_v6.sql` / `migrate_v7.sql`（当前 `sql/init.sql` 已含完整 `user_watermark_setting` 含 density 等列，再执行 v7 的 ALTER 会失败）
- `PUBLIC_WEB_ORIGIN=http://122.51.86.159`
- OSS Endpoint 使用外网：`oss-cn-qingdao.aliyuncs.com`，Bucket：`contract-hub`

---

## File Structure

| 路径 | 职责 |
|------|------|
| `docker-compose.yml` | 四服务编排、网络、卷、依赖 |
| `.env.example` | 环境变量键名与占位 |
| `.gitignore` | 忽略根目录 `.env` |
| `deploy/nginx/nginx.conf` | SPA + `/api` WS 反代 + `/swagger` |
| `deploy/mysql/init/00-bootstrap.sh` | 首次建库后按序导入 SQL |
| `backend/Dockerfile` | Go 多阶段构建 |
| `document-engine/Dockerfile` | FastAPI/uvicorn |
| `frontend/Dockerfile` | node build → nginx |
| `frontend/nginx.conf` | 可选：Dockerfile 直接引用 `deploy/nginx/nginx.conf` |

---

### Task 1: MySQL 启动脚本 + Nginx 配置

**Files:**
- Create: `deploy/mysql/init/00-bootstrap.sh`
- Create: `deploy/nginx/nginx.conf`

- [ ] **Step 1: 写 MySQL bootstrap**

`deploy/mysql/init/00-bootstrap.sh`：

```bash
#!/bin/bash
set -euo pipefail
# MySQL 容器首次初始化：按序导入 schema（跳过 v1_data / v6 / v7）
SQL_DIR="/sql"
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 <<EOSQL
CREATE DATABASE IF NOT EXISTS contract_manager DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EOSQL
run_sql() {
  echo "Running $1 ..."
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 contract_manager < "$SQL_DIR/$1"
}
run_sql init.sql
run_sql migrate_v2.sql
run_sql migrate_v3.sql
run_sql migrate_v4.sql
run_sql migrate_v5.sql
run_sql migrate_v8.sql
echo "MySQL schema bootstrap done."
```

说明：compose 将仓库 `sql/` 挂到容器 `/sql`，将本脚本挂到 `/docker-entrypoint-initdb.d/00-bootstrap.sh`。

- [ ] **Step 2: 写 nginx.conf**

`deploy/nginx/nginx.conf`：listen 80；`/` try_files SPA；`/api/` 反代 `backend:8080` 并带 WebSocket 头；`/swagger/` 反代；`client_max_body_size 50m`；`proxy_read_timeout 3600s`。

- [ ] **Step 3: Commit**

```bash
git add deploy/
git commit -m "feat(deploy): 新增 MySQL 初始化脚本与 Nginx 反代配置"
```

---

### Task 2: 三个 Dockerfile

**Files:**
- Create: `backend/Dockerfile`
- Create: `document-engine/Dockerfile`
- Create: `frontend/Dockerfile`

- [ ] **Step 1: backend/Dockerfile**

多阶段：`golang:1.25-bookworm` 编译 `./cmd/server` → `gcr.io/distroless/static-debian12` 或 `debian:bookworm-slim` 运行（若需 CA 证书访问 OSS，优先 bookworm-slim 并 `ca-certificates`）。

```dockerfile
FROM golang:1.25-bookworm AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server ./cmd/server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /out/server /app/server
EXPOSE 8080
CMD ["/app/server"]
```

- [ ] **Step 2: document-engine/Dockerfile**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
EXPOSE 9002
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9002"]
```

- [ ] **Step 3: frontend/Dockerfile**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY ../deploy/nginx/nginx.conf  # 不行：context 在 frontend
```

正确做法：compose 中 `frontend` 的 build context 为仓库根目录，dockerfile 为 `frontend/Dockerfile`，以便 COPY `deploy/nginx/nginx.conf` 与 `frontend/`。

调整后的 `frontend/Dockerfile`（context=仓库根）：

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY deploy/nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(deploy): 新增 Go/Python/前端 Dockerfile"
```

---

### Task 3: docker-compose.yml + .env.example + .gitignore

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`（根目录）

- [ ] **Step 1: 写 compose**

服务：`mysql`（healthcheck）、`document-engine`、`backend`（depends_on healthy mysql）、`frontend`（ports `"80:80"`）。

mysql volumes：
- `mysql_data:/var/lib/mysql`
- `./deploy/mysql/init/00-bootstrap.sh:/docker-entrypoint-initdb.d/00-bootstrap.sh:ro`
- `./sql:/sql:ro`

backend env 从 `.env` 注入；`MYSQL_DSN` 可用 compose 内插值构造。

- [ ] **Step 2: .env.example**（无真实密钥）

含：`MYSQL_ROOT_PASSWORD`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`、`JWT_SECRET`、`JWT_EXPIRE_HOURS`、`PUBLIC_WEB_ORIGIN`、`OSS_*`。

- [ ] **Step 3: 根 `.gitignore` 加入 `.env`**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(deploy): 新增 docker-compose 与环境变量模板"
```

---

### Task 4: Push 并服务器部署

**Files:** 无仓库新文件；服务器创建 `/home/contract-hub/.env`

- [ ] **Step 1: `git push origin main`**

- [ ] **Step 2: SSH 到 `122.51.86.159`**

检查 Docker / Compose；`cd /home/contract-hub && git pull`。

- [ ] **Step 3: 写入服务器 `.env`**（中等复杂度密码 + OSS AK，不回写仓库）

- [ ] **Step 4: `docker compose up -d --build`**

- [ ] **Step 5: 验证**

```bash
curl -sS http://127.0.0.1/api/health
curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1/
curl -sS http://122.51.86.159/api/health
```

Expected: health JSON `code:0`；前端 HTTP 200。

---

## Spec coverage

| Spec 项 | Task |
|---------|------|
| 只开 80 | Task 3 |
| Nginx SPA + API + WS | Task 1 |
| MySQL 自动 init+migrate（跳过 v1_data） | Task 1（并跳过冲突的 v6/v7） |
| 三服务 Dockerfile | Task 2 |
| env 文件 | Task 3–4 |
| 服务器上线 | Task 4 |
