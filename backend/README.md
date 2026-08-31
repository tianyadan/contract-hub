# 心智协同合同协作系统 - Go 后端（contract-hub backend）

本项目是“心智协同合同协作系统 V1”的 Go 业务后端，使用 Gin 框架。

## 本地启动

```bash
cd backend
go mod tidy
go run ./cmd/server
```

服务默认监听 `http://127.0.0.1:8080`。

健康检查：

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/api/health
```

## 环境变量

复制 `.env.example` 为本地环境变量文件，或直接在 shell 中设置：

```bash
export SERVER_PORT=8080
export GIN_MODE=debug
export MYSQL_DSN='root:password@tcp(127.0.0.1:3306)/contract_manager?charset=utf8mb4&parseTime=True&loc=Local'
export JWT_SECRET='please-change-me'
export JWT_EXPIRE_HOURS=24
export DOC_ENGINE_BASE_URL=http://127.0.0.1:9002
```

## Swagger 接口文档

项目使用 `swaggo/swag` + `gin-swagger`，通过接口注释自动生成 API 文档。

### 访问地址

- Swagger UI：`http://127.0.0.1:8080/swagger/index.html`
- Swagger JSON：`http://127.0.0.1:8080/swagger/doc.json`

### 重新生成文档

新增或修改接口后，在 `backend` 目录执行：

```bash
# 安装 swag 命令行工具（第一次）
go install github.com/swaggo/swag/cmd/swag@v1.16.6

# 重新生成 docs/ 目录
swag init -g cmd/server/main.go -o docs --parseDependency --parseInternal
```

### 开发规范

- 所有 Handler 方法都必须写 Swagger 注释。
- 请求参数尽量定义成独立的 Request struct，方便 Swagger 生成 Schema。
- 响应统一使用 `response.Body`。
- 需要登录的接口使用 `@Security BearerAuth`。
- 本项目 Swagger 不设置 `@BasePath`，`@Router` 必须写完整路径（包含 `/api` 前缀），避免出现 `/api/api/...`。
- 生成后的 `docs/` 目录由 `swag init` 自动维护，不手工编辑。

## 认证接口

### 注册

```bash
curl -X POST http://127.0.0.1:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"zhangsan","password":"123456","nickname":"张三","email":"zhangsan@example.com"}'
```

### 登录

```bash
curl -X POST http://127.0.0.1:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"zhangsan","password":"123456"}'
```

登录成功返回 JWT：

```json
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "token": "eyJ...",
    "expires_at": "2026-08-17T...",
    "user": {}
  }
}
```

### 当前用户

```bash
curl http://127.0.0.1:8080/api/auth/me \
  -H 'Authorization: Bearer <token>'
```

## 合同接口

### 创建合同

上传 `.docx` 文件创建合同，文件会保存到阿里云 OSS，并自动生成 V1 版本。

```bash
curl -X POST http://127.0.0.1:8080/api/contracts \
  -H "Authorization: Bearer <token>" \
  -F "contract_name=测试合同" \
  -F "customer_name=心智协同" \
  -F "description=合同备注" \
  -F "file=@/path/to/contract.docx"
```

### 合同列表

分页查询当前登录用户的合同列表：

```bash
curl "http://127.0.0.1:8080/api/contracts?page=1&page_size=10&keyword=测试&status=0&customer_name=心智协同" \
  -H "Authorization: Bearer <token>"
```

支持参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `page` | int | 页码，默认 1 |
| `page_size` | int | 每页数量，默认 10，最大 100 |
| `keyword` | string | 合同名称或合同编号关键字 |
| `status` | int | 合同状态 |
| `customer_name` | string | 客户名称 |

分页响应已统一封装为：

```json
{
  "list": [],
  "total": 0,
  "page": 1,
  "page_size": 10,
  "total_pages": 0
}
```

### 合同详情

获取当前用户创建的合同详情，包含当前版本信息：

```bash
curl http://127.0.0.1:8080/api/contracts/{id} \
  -H "Authorization: Bearer <token>"
```

返回内容包含：

- 合同基本信息
- 当前版本号
- OSS 文件地址
- 文件名 / 大小 / Hash
- 结构化文档内容 `document_content`
- 创建时间 / 更新时间

### 保存新版本

提交编辑后的结构化文档，自动生成新版本并记录变更：

```bash
curl -X POST http://127.0.0.1:8080/api/contracts/{id}/versions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "document_content": {
      "headers": [],
      "footers": [],
      "blocks": []
    },
    "change_summary": "修改了服务费用条款"
  }'
```

### 版本列表

```bash
curl "http://127.0.0.1:8080/api/contracts/{id}/versions?page=1&page_size=10" \
  -H "Authorization: Bearer <token>"
```

### 版本详情

```bash
curl http://127.0.0.1:8080/api/contracts/{id}/versions/{versionId} \
  -H "Authorization: Bearer <token>"
```

### 变更记录

```bash
curl "http://127.0.0.1:8080/api/contracts/{id}/changes?page=1&page_size=20" \
  -H "Authorization: Bearer <token>"
```

### 分享协作

内部用户创建分享链接：

```bash
curl -X POST http://127.0.0.1:8080/api/contracts/{id}/share \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"permission": 1, "expire_hours": 24}'
```

外部协作者访问：

```text
GET  /api/share/{token}
POST /api/share/{token}/join
GET  /api/share/{token}/contract
GET  /api/share/{token}/versions
GET  /api/share/{token}/versions/{versionId}
POST /api/share/{token}/versions
GET  /api/share/{token}/changes
POST /api/share/{token}/confirm
GET  /api/share/{token}/confirmations
```

外部请求时通过 Header 或 Query 传递姓名：

```text
X-Collaborator-Name: 张三
```

或：

```text
?collaborator_name=张三
```

### 合同确认

内部确认：

```bash
curl -X POST http://127.0.0.1:8080/api/contracts/{id}/confirm \
  -H "Authorization: Bearer <token>"
```

外部确认：

```bash
curl -X POST "http://127.0.0.1:8080/api/share/{token}/confirm?collaborator_name=张三"
```

查看确认记录：

```bash
curl http://127.0.0.1:8080/api/contracts/{id}/confirmations \
  -H "Authorization: Bearer <token>"
```

### 下载最终 DOCX

内部下载：

```bash
curl -X GET http://127.0.0.1:8080/api/contracts/{id}/download \
  -H "Authorization: Bearer <token>" \
  -o 合同.docx
```

外部下载：

```bash
curl -X GET "http://127.0.0.1:8080/api/share/{token}/download?collaborator_name=张三" \
  -o 合同.docx
```

下载的 DOCX 由 Python `/render` 渲染，内置“心智协同”文字水印。

### WebSocket 在线状态

内部用户：

```text
WS /api/ws/contracts/{id}?token={jwt}
```

外部协作者：

```text
WS /api/share/{token}/ws?collaborator_name=张三
```

消息格式：

```json
{
  "type": "presence",
  "list": [
    { "name": "张三", "role": "owner" },
    { "name": "外部客户小李", "role": "collaborator" }
  ]
}
```

事件类型：

- `presence`：当前在线用户列表
- `join`：有人上线
- `leave`：有人下线

### 注意事项

- 仅支持 `.docx` 文件。
- 文件大小限制为 20MB。
- 需要登录后携带 JWT 访问。
- 创建成功后自动生成 `contract`、`contract_version` V1 和审计日志。
- 合同列表只返回当前登录用户自己创建的合同。

## 当前进度

- 已初始化 Go + Gin 基础工程。
- 已提供统一响应结构 `pkg/response`。
- 已实现用户注册、登录、JWT 签发和 `/api/auth/me` 鉴权。
- 已实现创建合同接口 `POST /api/contracts`，支持上传 `.docx` 到阿里云 OSS。
- 已实现合同列表分页接口 `GET /api/contracts`，支持关键字、状态、客户名称筛选。
- 已实现合同详情接口 `GET /api/contracts/{id}`。
- 已实现在线编辑保存新版本、版本列表、版本详情、变更记录接口。
- 已实现分享链接、外部协作者加入、外部查看/编辑、合同确认接口。
- 已实现最终 DOCX 下载（Python 渲染 + 水印）。
- 已实现 WebSocket 在线状态。
- 已接入 MySQL，数据库名：`contract_manager`。
- 已接入阿里云 OSS，Bucket：`contract-hub`。
- 已接入 Swagger 接口文档：`/swagger/index.html`。
- 已预留 `internal/config`、`internal/router`、`internal/handler`、`internal/middleware`、`internal/docengine` 等目录。
- 已接入 Python Document Engine，创建合同时会自动解析 DOCX 并保存结构化内容。

## Python Document Engine

文档处理服务位于：

```text
document-engine/
```

使用 Python 3.12 + FastAPI 实现，当前已支持：

- DOCX 解析为结构化 JSON
- 段落、标题、表格
- 页眉、页脚
- Word 公式提取

启动方式：

```bash
cd document-engine
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 9002 --reload
```

Go 通过 `DOC_ENGINE_BASE_URL` 调用它，默认地址：

```text
http://127.0.0.1:9002
```
