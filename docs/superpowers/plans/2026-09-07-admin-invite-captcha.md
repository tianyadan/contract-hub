# Admin Invite Captcha Implementation Plan

> **For agentic workers:** Use executing-plans / implement task-by-task. Steps use checkbox syntax.

**Goal:** 管理员用户管理、邀请码注册、登录失败 3 次后图形验证码；本地开发完成后 push GitHub。

**Architecture:** `sys_user.role` + `invite_code` 表；JWT 带 role；内存验证码与失败计数；前端管理页与登录/注册改造。

**Tech Stack:** Go/Gin, MySQL, React/Ant Design, 标准库生成 PNG 验证码

## Global Constraints

- role: 0 普通 / 1 管理员
- status: 0 封禁 / 1 正常 / 2 软删除
- 重置密码固定 `12345678`
- 邀请码一次性、5 分钟
- 登录失败 ≥3 次强制图形验证码

---

### Task 1: SQL + 模型仓库

- Create: `sql/migrate_v9.sql`
- Modify: `deploy/mysql/init/00-bootstrap.sh`, user model/repo

### Task 2: 认证（邀请码 + 验证码 + JWT role）

- captcha store、invite repo/service、AuthService 改造、handler/router

### Task 3: 管理员 API

- AdminService/Handler、RequireAdmin、路由、main 接线、种子 admin

### Task 4: 前端

- 类型/API、Login/Register、用户管理与邀请码页、菜单与路由守卫

### Task 5: 验证并 push

- go build / 前端 tsc；commit；push origin main
