# 管理员用户管理 / 邀请码注册 / 登录图形验证码 设计

日期：2026-09-07  
状态：已确认  
范围：本地开发 → push GitHub（本次不上服务器 Docker）

## 1. 背景与目标

当前系统任意人可注册，无管理员能力，登录无防暴力手段。需要：

1. 管理员管理用户：封禁、启用、软删除、重置密码为默认 `12345678`
2. 注册必须邀请码：管理员生成，一次性，5 分钟有效
3. 登录失败满 3 次后出现图形验证码

## 2. 数据设计

### 2.1 `sys_user` 扩展

| 字段 | 说明 |
|------|------|
| `role` TINYINT | `0` 普通用户 / `1` 管理员，默认 `0` |
| `status` | 沿用并扩展：`0` 封禁 / `1` 正常 / `2` 软删除 |

种子：若不存在管理员，插入 `admin` / 密码 `12345678` / `role=1` / `status=1`。

### 2.2 `invite_code` 表

- `id`, `code`(唯一), `created_by`, `expire_at`, `used_at`, `used_by_user_id`, `create_time`
- 生成时 `expire_at = now + 5min`
- 注册成功后写 `used_at` / `used_by_user_id`

## 3. 后端 API

### 认证（公开）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 增加必填 `invite_code` |
| POST | `/api/auth/login` | 可选 `captcha_id` + `captcha_code`；失败≥3 次强制 |
| GET | `/api/auth/captcha` | 返回 captcha_id + 图片（base64 或 PNG） |

登录失败计数键：`username + client IP`（进程内存；单实例够用）。成功清零。

### 管理员（需 JWT + role=1）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/users` | 分页列表，排除 `status=2`（或可筛） |
| POST | `/api/admin/users/:id/ban` | status=0 |
| POST | `/api/admin/users/:id/enable` | status=1 |
| POST | `/api/admin/users/:id/reset-password` | 设为 bcrypt(12345678) |
| DELETE | `/api/admin/users/:id` | status=2 |
| POST | `/api/admin/invite-codes` | 生成邀请码 |
| GET | `/api/admin/invite-codes` | 最近邀请码列表（可选） |

规则：不可操作自己删除/封禁；不可删除或封禁最后一个管理员。

JWT Claims 增加 `role`；中间件 `RequireAdmin`。

## 4. 前端

- 注册表单：邀请码必填
- 登录：本地/接口反馈失败次数；≥3 显示图形验证码并可刷新
- `UserVO` 增加 `role`；管理员侧栏增加「系统管理」：用户管理、邀请码
- 用户管理页：表格 + 封禁/启用/重置密码/删除
- 邀请码页：生成按钮 + 展示码与过期时间（方便复制）

## 5. 非目标

- 短信/邮箱验证码、细粒度 RBAC、硬删除、自定义重置密码、多实例共享 Redis 验证码（可后续）

## 6. 风险

| 风险 | 缓解 |
|------|------|
| 内存验证码/失败计数重启丢失 | 可接受；失败计数清零仅多几次机会 |
| 默认密码过弱 | 文档提示管理员首次改密；后续可强制改密 |
| 旧客户端无邀请码 | 注册接口直接拒绝，强制升级前端 |
