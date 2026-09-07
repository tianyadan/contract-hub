# Docker Compose 统一部署设计

日期：2026-09-07  
状态：已确认  
范围：本地编写 Docker/Nginx/MySQL 配置 → push GitHub → 服务器拉取并 `docker compose` 上线

## 1. 背景与目标

心智协同合同协作系统包含：

- React 前端（Vite）
- Go 业务后端（Gin，默认 `:8080`）
- Python Document Engine（FastAPI，默认 `:9002`）
- MySQL 8（库名 `contract_manager`）

目标：用 Docker Compose 在单机统一管理上述服务；前端由 Nginx 托管静态资源并反代 API；公网仅开放 80，可通过 `http://122.51.86.159` 访问。

成功标准：

1. 浏览器打开 `http://122.51.86.159` 可进入前端
2. `/api`（含 WebSocket）经 Nginx 到达 Go 后端
3. MySQL 首次启动自动完成建库与迁移至 v8
4. Go 可调用容器内 Document Engine；OSS 配置生效后可上传合同
5. 敏感信息仅存在服务器 `.env`，不进入 Git

## 2. 架构

```
浏览器
  │
  ▼ :80 (唯一公网端口)
frontend (nginx)
  ├─ /          → 静态 React build
  ├─ /api/      → backend:8080（含 WebSocket Upgrade）
  └─ /swagger/  → backend:8080（可选，便于排查接口）

Docker 内网
  backend ──► mysql:3306 (contract_manager)
  backend ──► document-engine:9002
  backend ──► 阿里云 OSS (外网 Endpoint)
```

| 服务 | 容器内端口 | 宿主机映射 | 说明 |
|------|------------|------------|------|
| frontend/nginx | 80 | **80** | 唯一对外入口 |
| backend | 8080 | 无 | 仅内网 |
| document-engine | 9002 | 无 | 仅内网 |
| mysql | 3306 | 无 | 仅内网 |

`PUBLIC_WEB_ORIGIN=http://122.51.86.159`（二维码验真等公开链接）。

## 3. 仓库文件结构

```
docker-compose.yml
.env.example                 # 占位，无真实密钥
.gitignore                   # 忽略 .env、数据卷等
deploy/
  nginx/nginx.conf
  mysql/init/                # 入口脚本 + 有序 SQL
backend/Dockerfile
document-engine/Dockerfile
frontend/Dockerfile          # multi-stage: node build → nginx
```

真实 `.env` 只在服务器创建，永不 commit。

## 4. 各服务设计

### 4.1 MySQL

- 镜像：`mysql:8.0`
- 库名：`contract_manager`
- 字符集：`utf8mb4`
- 首次空数据卷执行初始化：
  1. 建库（由官方入口或脚本保证）
  2. `sql/init.sql`
  3. `migrate_v2.sql` → `v3` → `v4` → `v5` → `v6` → `v7` → `v8`
- **不执行** `migrate_v1_data.sql`（旧数据迁移；空库无意义）
- 密码：中等复杂度，来自 `.env`（如 `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD`）
- 数据持久化：Docker named volume

实现注意：官方 `/docker-entrypoint-initdb.d` 只在数据目录为空时执行一次。用编号前缀脚本保证顺序（例如 `01-init.sql`、`02-migrate_v2.sql` …），或一个 `00-bootstrap.sh` 按序 `source` 仓库 `sql/` 文件。

### 4.2 Go backend

- 多阶段构建：`golang` 编译 → 精简运行镜像
- 入口：`./cmd/server`
- 环境变量对齐现有 `backend/.env.example`：
  - `SERVER_PORT=8080`
  - `GIN_MODE=release`
  - `MYSQL_DSN=...@tcp(mysql:3306)/contract_manager?...`
  - `JWT_SECRET` / `JWT_EXPIRE_HOURS`
  - `DOC_ENGINE_BASE_URL=http://document-engine:9002`
  - `PUBLIC_WEB_ORIGIN=http://122.51.86.159`
  - OSS：`OSS_ENDPOINT=oss-cn-qingdao.aliyuncs.com`，`OSS_BUCKET=contract-hub`，AK/SK 来自 `.env`
- `depends_on` mysql（建议带 healthcheck）与 document-engine
- 无宿主机端口映射

### 4.3 Document Engine

- 基于 Python 3.12 + `requirements.txt`
- `uvicorn app.main:app --host 0.0.0.0 --port 9002`
- 无公网映射；仅供 backend 内网调用

### 4.4 Frontend + Nginx

- 构建阶段：`npm ci && npm run build`
- 运行阶段：nginx 镜像，拷贝 `dist` + `deploy/nginx/nginx.conf`
- Nginx 要点：
  - SPA：`try_files $uri $uri/ /index.html`
  - `/api/` → `http://backend:8080`
  - WebSocket：`Upgrade` / `Connection` 头
  - 上传体积：`client_max_body_size` 适当加大（合同 DOCX）
  - 可选 `/swagger/` 反代到 backend

## 5. Compose 与环境变量

`docker-compose.yml` 服务：`mysql`、`backend`、`document-engine`、`frontend`。

`.env.example` 列出全部键名与占位值；服务器复制为 `.env` 后填入真实密码与 OSS AK。

安全约定：

- 不把服务器 root 密码、MySQL 密码、JWT、OSS AK 写入仓库
- 聊天中出现过的密钥，上线后建议轮换
- 公网只开 80；云安全组同步只放行 80（及 SSH 22）

## 6. 部署流程

1. 本地完成 Docker 相关文件并 push 到 GitHub
2. 服务器 `/home/contract-hub`：`git pull`
3. 写入 `.env`（不进 Git）
4. `docker compose up -d --build`
5. 验证：
   - `http://122.51.86.159/` 前端
   - `http://122.51.86.159/api/health`（或 `/health`）
   - 登录 / 上传（依赖 OSS）

## 7. 非目标（本次不做）

- HTTPS / 域名证书
- 公网暴露 MySQL、8080、9002
- K8s / 多机编排
- 改造业务代码为本地磁盘存储（继续用 OSS）
- 执行 `migrate_v1_data.sql`

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| SQL 迁移重复执行失败 | 仅空卷首次执行；ALTER 脚本按版本顺序且一次跑完 |
| init.sql 与后期 migrate 部分重叠 | `CREATE TABLE IF NOT EXISTS` 可容忍；ALTER 依赖顺序，空库只跑一遍 |
| OSS 网络 | 非阿里云 VPC 用外网 Endpoint `oss-cn-qingdao.aliyuncs.com` |
| WebSocket 断连 | Nginx 显式 Upgrade 配置与足够 `proxy_read_timeout` |
| 密钥进仓 | `.gitignore` + 仅 `.env.example` 入库 |
