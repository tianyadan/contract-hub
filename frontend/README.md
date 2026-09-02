# 心智协同合同协作系统 - 前端（contract-web）

基于 **Vite + React 19 + TypeScript + Ant Design v6** 的前端项目。

## 本地启动

```bash
cd frontend
npm install
npm run dev
```

- 前端地址：`http://localhost:5173`
- 开发环境已配置代理：`/api` 自动转发到 Go 后端 `http://127.0.0.1:8080`（含 WebSocket）

## 路由规划

| 路径 | 页面 | 说明 |
|---|---|---|
| `/login` | 登录 / 注册页 | 公开 |
| `/` | 首页（工作台） | 需登录，主布局 |
| `/contracts` | 合同管理列表页 | 需登录，主布局 |
| `/contracts/:id` | 合同详情 / 在线编辑页 | 需登录，主布局 |
| `/share/:token` | 外部协作者访问页 | 公开，免登录，不套主布局 |
| `/customers` `/settings` `/statistics` | 占位页 | 需登录 |

## 当前功能

### 登录页
- 左侧品牌面板 + 右侧登录 / 注册表单，调用 `/api/auth/login`、`/api/auth/register`

### 主布局
- 左侧菜单：首页 / 合同管理 / 客户管理 / 系统设置 / 数据统计
- 顶部：系统名称 + 当前用户（下拉退出登录）

### 首页
- 合同总数 + 各状态数量卡片（清新配色，点击按状态跳转合同列表）
- 最近合同（名称 / 客户 / 编辑时间 / 状态，点击进入详情）

### 合同管理列表页
- 搜索：关键字 / 状态 / 客户名称 + 查询 / 重置
- 导入合同弹窗：合同信息 + DOCX 上传（仅 .docx、限 20MB）→ `POST /api/contracts`
- 表格：名称 / 编号 / 客户 / 状态 / 版本号 / 最近编辑时间 / 操作（查看 / 分享 / 下载）
- 后端分页

### 合同详情 / 在线编辑页
- 顶部：合同信息 + 状态 + **WebSocket 实时在线用户**（绿 / 灰点）+ 分享 / 保存版本 / 确认 / 下载
- **文档编辑器（样式保真 + 分页渲染）**：按 `document_content.page` 还原纸张大小与页边距，按原文档高度分页；按 `block.style` 还原字体（中文/西文）、字号、加粗、斜体、下划线、删除线、颜色、**文本高亮、文字阴影、段落底纹**、对齐、首行缩进、行距、段前段后；每页渲染页眉 / 页脚
- **Word 风格格式工具栏（文档顶部）**：字体、字号、加粗/斜体/下划线/删除线、字体颜色（预设色板 + 自定义）、文本高亮、段落底纹、文字阴影、左/中/右/两端对齐、行距，作用于当前选中的段落（点击段落即选中，绿色描边提示）
- 编辑能力：点击文本就地编辑、新增 / 删除段落（新增段落 `source_ref: null`，样式取文档默认）；保存版本时原样提交 `document_content`（含 `style` 与 `source_ref`）
- **导出即所见**：下载时后端模板渲染并应用 `block.style` 覆盖，Web 端编辑的样式（颜色/高亮/阴影/底纹/对齐等）原样进入导出 DOCX
- 保存版本：`POST /api/contracts/{id}/versions`（无修改时提示；保存后自动刷新变更与版本）
- 右侧变更记录时间线：新增（绿）/ 删除（红删除线）/ 修改（蓝，旧 → 新），展示操作人与时间
- 版本记录：可查看历史版本（只读）
- 确认合同：`POST /api/contracts/{id}/confirm`，确认后状态变为"已确认"，展示确认记录
- 下载 DOCX：`GET /api/contracts/{id}/download`（后端生成水印，前端 Blob 下载）
- 分享弹窗：选择权限（可编辑 / 只读）与有效期 → `POST /api/contracts/{id}/share`，支持复制与失效链接

### 外部协作者页 `/share/:token`
- 免登录，`GET /api/share/{token}` 获取概要 → 输入姓名加入（`POST /api/share/{token}/join`，姓名存 sessionStorage 刷新恢复）
- 查看 / 编辑（按分享权限：只读时禁用编辑）、保存版本、确认、下载
- 所有外部接口携带 `collaborator_name` 识别协作者
- WebSocket 实时在线状态（`/api/share/{token}/ws`）

## 目录结构

```text
frontend/
  src/
    api/            # request 封装（含 blob 下载/文件名解析）+ authApi + contractApi + shareApi
    components/     # 通用组件 + contract/ 合同业务组件
      contract/     #   ContractImportModal / ContractShareModal / DocumentEditor /
                    #   ChangeTimeline / PresenceAvatar / ConfirmActionBar
    hooks/          # usePresence（WebSocket 实时在线用户）
    layouts/        # MainLayout
    pages/          # Login / Home / ContractList / ContractDetail / Share / Placeholder
    types/          # auth / contract（ShareInfo / ShareContract / PresenceUser 等）
    utils/          # token / message / 合同状态配置
    theme.ts        # antd 全局主题（清新绿）
    App.tsx         # 路由配置
    main.tsx        # 应用入口
```

## 说明

- **样式保真渲染**：需要后端解析器输出 `page`（页面设置）与 `block.style`（样式）字段；旧数据（无这些字段）自动降级为普通流式渲染，并提示重新导入
- WebSocket：内部 `/api/ws/contracts/{id}?token={jwt}`，外部 `/api/share/{token}/ws?collaborator_name={name}`，消息协议 `{type: presence|join|leave, list/data: [{name, role}]}`
- 下载文件名的中文乱码问题：后端 Content-Disposition 建议使用 RFC 5987（`filename*=UTF-8''...`）编码，当前前端对非 ASCII 文件名回退为合同编号
- 代码规范：每个方法 / 组件前有中文注释；组件尽量复用；图标统一 SVG；主题清新绿 `#00b96b`

## 构建

```bash
npm run build   # 产物输出到 dist/
npm run lint    # oxlint 检查
```
