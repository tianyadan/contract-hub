# 心智协同合同协作系统 V3 技术架构

> 网页即真相 · 浏览器导出 PNG · 全免费栈 · 2C2G 可运行

编写日期：2026-08-28  
状态：**已实施（2026-08-28）**  
废止文档：[V2-客户模板池与文档保真改造计划.md](./V2-客户模板池与文档保真改造计划.md)（业务层部分仍有效，文档层全部废止）

---

## 1. 背景与决策

### 1.1 业务诉求（最终确认）

| 诉求 | 说明 |
|------|------|
| 合同经常改动 | 必须支持**自由编辑**，不接受「只填变量、正文锁定」 |
| 所见即所得 | **网页上看到什么，导出就是什么** |
| 导出格式 | **不强制 DOCX**；按页顺序导出 **PNG** 即可 |
| 导入样式 | 从 WPS 导入时样式错乱**可接受**；用户在网页上手动调好再保存 |
| 出件后不可改 | 确认锁定后导出最终 PNG，作为交付物 |
| 服务器约束 | **2C2G**，目标支撑约 **4 人并发** |
| 成本约束 | **不采用任何付费方案**（OnlyOffice 商业版、SuperDoc 商业许可、Nutrient 等一律排除） |

### 1.2 为何废止 V1/V2 文档层路线

经线上验证与业界调研，以下路线**在技术上无法稳定达成**「导入 = 在线编辑 = 导出 DOCX」：

```text
DOCX → Python 解析为 JSON blocks → 前端 HTML/contentEditable 重排 → python-docx 重绘导出
```

| 问题 | 根因 |
|------|------|
| WPS 封面、制表位、空行间距错位 | JSON/HTML 模型丢失 OOXML 细节 |
| `docx-preview` 预览与编辑不一致 | 库定位为 **DOCX→HTML 只读渲染**，不支持回写 |
| 回车/拆段导致内容丢失 | contentEditable 与 React state 双轨同步 |
| `RenderWithTemplate` 仍难 100% 保真 | 无 `source_ref` 的块只能降级渲染 |
| OnlyOffice / Collabora | 官方最低 **4GB+ RAM**，2C2G 无法稳定 4 并发 |

**结论**：不再追求「与原始 WPS 文件像素级一致」，改为追求「**网页呈现与导出 PNG 一致**」。网页成为合同样式的**唯一真相来源**。

### 1.3 V3 一句话定义

> **导入 DOCX 仅作初稿参考 → 用户在网页自由编辑并调整样式 → 保存版本 → 确认锁定 → 浏览器按页导出 PNG 归档。**

---

## 2. 设计原则

1. **网页即真相（Web as Source of Truth）**  
   合同最终版式以浏览器内渲染结果为准，不以 OSS 上的原始 DOCX 为准。

2. **导出在客户端完成**  
   PNG 生成使用浏览器 `html-to-image` / `html2canvas`，**禁止**服务端 Puppeteer/Playwright 截图（2C2G 扛不住并发）。

3. **全免费开源栈**  
   仅使用 MIT/Apache 等宽松许可组件；AGPL 方案（如 SuperDoc 社区版）**不采用**，避免传染许可风险。

4. **业务层复用，文档层重做**  
   客户管理、模板池、分享、版本、确认、Presence 等 **Go + MySQL 能力保留**；文档解析/渲染/导出链路按本章废案清单逐步下线。

5. **导入乱了没关系**  
   产品文案明确：「导入后请在网页检查版式，最终以导出图片为准。」

---

## 3. 目标架构

### 3.1 端到端流程

```text
┌──────────────────────────────────────────────────────────────────┐
│  A. 模板 / 合同导入（初稿）                                        │
│  上传 DOCX → 浏览器解析为可编辑网页结构（样式可能不完整）            │
│  可选：docx-preview 只读参考 Tab（与编辑区分离，避免双轨）          │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│  B. 网页编辑（唯一真相）                                           │
│  纸张布局 + 格式工具栏：字体、对齐、缩进、行距、加粗、颜色等         │
│  自由输入、回车换行、Ctrl+A 全选                                   │
│  保存版本 → 结构化快照写入 contract_version                        │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│  C. 协作（沿用 V1）                                                │
│  分享链接 → 双人编辑 → 版本列表 → 变更说明（可简化为版本备注）       │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│  D. 确认锁定                                                       │
│  双方确认 → 合同状态「已确认」→ 编辑区只读                         │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│  E. 导出交付（PNG）                                                │
│  浏览器遍历 .doc-page → 逐页截图 → PNG-001.png, PNG-002.png …     │
│  打包 ZIP 或逐张下载；可选上传 OSS 作为合同终稿附件                 │
│  记录文件 hash、页数、导出时间                                     │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 逻辑架构图

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React     │     │   Go API    │     │   MySQL     │
│  编辑+导出   │────▶│  业务+存储   │────▶│  版本/客户   │
│  (浏览器)   │     │  (2C2G)     │     │             │
└─────────────┘     └──────┬──────┘     └─────────────┘
       │                   │
       │ PNG Blob          │ 元数据 / 可选 OSS
       ▼                   ▼
  本地下载            ┌─────────────┐
  或上传 OSS          │    OSS      │
                      │  PNG 终稿   │
                      └─────────────┘

【不再经过】document-engine 渲染 DOCX 导出热路径
【可选保留】document-engine /parse 仅作导入初稿（低优先级，可改为前端 mammoth）
```

### 3.3 2C2G 资源预算

| 组件 | 预估内存 | 说明 |
|------|---------|------|
| MySQL | ~400MB | `innodb_buffer_pool_size=256M` |
| Go API | ~300MB | 含 WebSocket Presence |
| Nginx | ~30MB | 反代 + 静态资源 |
| 系统 | ~300MB | — |
| **余量** | **~970MB** | 4 人并发编辑/导出在浏览器，服务端仅 IO |
| Python document-engine | **0（默认不启）** | 导出 PNG 后非必需；若保留导入解析，按需启动 |

---

## 4. 技术选型（全免费）

| 能力 | 选型 | 许可 | 运行位置 |
|------|------|------|---------|
| 前端框架 | React + TypeScript + Ant Design | MIT | 浏览器 |
| 合同编辑 | 纸张布局 HTML 编辑器（沿用并简化 `DocumentEditor`） | — | 浏览器 |
| 导入参考预览 | `docx-preview`（可选 Tab，只读） | MIT | 浏览器 |
| 导入转可编辑（备选） | `mammoth`（DOCX→HTML） | BSD | 浏览器 |
| PNG 导出 | `html-to-image` 或 `html2canvas` | MIT | 浏览器 |
| ZIP 打包 | `jszip` | MIT | 浏览器 |
| 后端 | Go (Gin) | BSD | 服务器 |
| 存储 | MySQL + 阿里云 OSS | — | 服务器 |
| 实时在线 | WebSocket Presence | — | 服务器 |

### 4.1 明确不采用

| 方案 | 排除原因 |
|------|---------|
| OnlyOffice Document Server | 官方最低 4GB RAM；转换进程单实例 500MB+ |
| Collabora Online | 空闲 ~1.3GB，2C2G 紧张 |
| SuperDoc 商业许可 | 付费 |
| SuperDoc AGPL | 闭源产品传染风险 |
| Nutrient / Syncfusion 等 | 付费 |
| docxtpl 纯变量填充 | 不符合「常改、自由编辑」 |
| 服务端 Puppeteer 截图 | 2C2G 无法 4 并发 |
| JSON → python-docx 重绘导出 | 版式不可控，与「网页即真相」冲突 |

---

## 5. 保留与废止

### 5.1 保留（业务层，继续维护）

| 模块 | 路径/表 | 说明 |
|------|---------|------|
| 客户管理 | `customer` 表、`Customer*Page` | V2 已实现 |
| 模板池 | `contract_template` 表、`Template*Page` | V2 已实现 |
| 从模板创建合同 | `CreateFromTemplate`、OSS CopyObject | 保留；复制 DOCX 仅作归档/参考 |
| 合同版本 | `contract_version` | 保留；存网页编辑快照 |
| 分享协作 | `contract_share`、`SharePage` | 保留 |
| 确认流程 | `contract_confirmation` | 保留；锁定后禁止编辑 |
| 在线 Presence | `usePresence`、WebSocket | 保留 |
| 鉴权 | JWT、分享 token | 保留 |

### 5.2 废止（文档层，实施 V3 时删除或清空）

以下能力属于 **废案**，代码实施阶段**直接删除文件或清空逻辑**，不在此路线继续迭代。

#### 5.2.1 Python 文档引擎 — 导出与重绘

| 文件 | 原职责 | V3 处置 |
|------|--------|---------|
| `document-engine/app/services/docx_renderer.py` | JSON → DOCX；`render_docx_with_template` | **删除** |
| `document-engine/app/services/docx_diff.py` | 块级 JSON diff | **删除**（或降为可选，见 6.3） |
| `document-engine/app/main.py` 中 `/render`、`/diff` 路由 | 渲染与对比 API | **删除对应路由** |
| `document-engine/app/services/docx_parser.py` | DOCX → JSON | **暂缓删除**；可改为仅导入初稿，或整体替换为前端 `mammoth` 后删除 |

#### 5.2.2 Go 后端 — DOCX 下载热路径

| 文件/逻辑 | 原职责 | V3 处置 |
|-----------|--------|---------|
| `contract_service.go` 中 `Download` / 调 Python render | 生成 DOCX 下载 | **删除**；改为 PNG 元数据或 OSS 直链 |
| `share_service.go` 中 `renderWithOriginalTemplate` | 分享页 DOCX 下载 | **删除** |
| `docengine/client.go` 中 Render/Diff 调用 | 调 Python | **删除 Render/Diff**；Parse 视导入方案保留 |
| `GET /contracts/:id/download` | DOCX 下载 | **废弃**；新增 PNG 相关 API（见 7） |
| `GET /contracts/:id/preview` | 返回原始 DOCX 字节 | **降级为可选**；主界面不再依赖 |

#### 5.2.3 前端 — 双轨预览与 DOCX 导出

| 文件/逻辑 | 原职责 | V3 处置 |
|-----------|--------|---------|
| `ContractDetailPage` 导出 DOCX、`downloadContractDocx` | DOCX 下载 | **删除**；改为导出 PNG |
| `ContractDetailPage`「高保真预览」Tab 作为主路径 | docx-preview 与编辑双轨 | **合并**：编辑区即主视图；预览 Tab 可删或作「导入原文件参考」 |
| `DocxPreview` 作为合同主展示 | 只读 DOCX | **降级**为导入参考，或删除 |
| `document_content.render_mode: web_editor` 驱动导出逻辑 | 导出走 JSON 重绘 | **废止**；`render_mode` 改为 `web_canvas`（见 6.1） |
| `ChangeTimeline` 块级 diff 展示 | 段落增删改 | **简化**为版本备注 + PNG 缩略对比（可选） |

#### 5.2.4 数据与类型（逐步废弃字段）

| 字段/概念 | 原用途 | V3 处置 |
|-----------|--------|---------|
| `DocumentBlock.source_ref` | DOCX 模板定位导出 | **不再作为导出依据**；可保留字段避免迁移痛苦，但不写入导出逻辑 |
| `export_page_break_before` | Web 分页写入 DOCX | **删除使用** |
| `insert_after`（V2 规划未实现） | 插入段落定位 | **不实现** |
| `render_mode: template_editor` | 模板保真模式 | **不实现** |

### 5.3 V2 计划书中废止的章节

以下 V2 目标**整体废止**，不再实施：

- §3.5 文档样式保真（docx-preview 为主 + RenderWithTemplate 导出）
- §阶段 4「文档保真」全部任务
- §12.2 中 `template_editor`、`insert_after` 等增强
- §10 风险表中「docx-preview 不足 → OnlyOffice」对策

V2 已完成的**客户、模板池、合同分配**（阶段 1～3、5）**继续有效**。

---

## 6. 数据模型（V3 增量）

### 6.1 文档快照 `DocumentContent`（语义调整）

`contract_version.document_content` **继续存储 JSON**，但语义变更：

```typescript
interface DocumentContent {
  schema_version: 3                    // V3 升级为 3
  render_mode: 'web_canvas'            // 网页画布为唯一真相
  page?: PageSetup                     // 纸张宽高、边距（px/twips 换算用）
  default_style?: BlockStyle
  blocks: DocumentBlock[]              // 编辑中间结构，仅用于还原网页
  // 不再承诺可还原为 WPS 原版 DOCX
}
```

### 6.2 合同终稿 PNG（新增，建议）

```sql
-- migrate_v3.sql（实施时编写）
ALTER TABLE contract_version
  ADD COLUMN export_png_oss_prefix VARCHAR(500) DEFAULT NULL COMMENT '终稿 PNG 在 OSS 上的目录前缀',
  ADD COLUMN export_png_page_count INT DEFAULT 0 COMMENT 'PNG 页数',
  ADD COLUMN export_png_hash VARCHAR(64) DEFAULT NULL COMMENT '全部 PNG 内容哈希或 manifest 哈希',
  ADD COLUMN exported_at DATETIME DEFAULT NULL COMMENT 'PNG 导出时间';
```

亦可独立表 `contract_export_asset(version_id, page_no, oss_key, file_hash)`，按实现复杂度选择。

### 6.3 变更记录（简化）

| 方案 | 说明 |
|------|------|
| **推荐** | 保留 `change_summary` 文本 + 版本号；块级 `contract_change` **停止写入** |
| 备选 | 保留 diff 仅作内部审计，UI 不再展示块级红绿 diff |

---

## 7. API 设计（V3 增量）

### 7.1 新增

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/contracts/:id/export-png` | 客户端上传 PNG 包（multipart）或逐张；服务端写 OSS 并更新 version |
| `GET` | `/api/contracts/:id/export-png` | 获取终稿 PNG 列表（签名 URL） |
| `GET` | `/api/contracts/:id/versions/:vid/export-png` | 历史版本 PNG |

**轻量方案（P0）**：导出完全在浏览器本地下载，**不调后端**；P1 再增加上传 OSS 归档。

### 7.2 废弃

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/contracts/:id/download` | DOCX 下载 — **删除** |
| `GET` | `/api/share/:token/download` | 外部分享 DOCX — **删除** |
| `POST` | document-engine `/render` | — **删除** |

### 7.3 保留

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/contracts/:id/versions` | 保存网页编辑快照 |
| `GET` | `/api/contracts/:id/versions` | 版本列表 |
| 分享 / 确认 / Presence | 现有路由 | 不变 |

---

## 8. 前端交互

### 8.1 合同详情页（改造后）

```text
┌─────────────────────────────────────────────────────────┐
│  合同信息 │ 分享 │ 保存版本 │ 确认 │ 导出 PNG（按页）    │
├──────────────────────────────┬──────────────────────────┤
│  网页编辑器（主区域）         │  版本记录                 │
│  - 纸张分页 .doc-page         │  - V1, V2, V3…           │
│  - 格式工具栏                 │  - 可选：版本 PNG 缩略图   │
│  - 确认后只读                 │                          │
└──────────────────────────────┴──────────────────────────┘
```

- **删除**：「高保真预览 / 结构化编辑」双 Tab（或保留一个「导入原文件参考」只读 Tab，非必须）。
- **导出 PNG**：对 `.doc-page` 逐页 `html-to-image`，`scale: 2`，文件名 `合同编号-001.png` …
- **ZIP**：多页时 `jszip` 打包 `合同编号-终稿.zip`。

### 8.2 导入提示（产品文案）

> 从 WPS 导入的版式可能与原文件略有差异。请在下方编辑区调整到满意后保存；**最终以「导出 PNG」为准**。

### 8.3 锁定规则

| 状态 | 编辑 | 导出 PNG |
|------|------|---------|
| 草稿 / 协作中 | ✅ | ✅（草稿水印可选） |
| 已确认 | ❌ 只读 | ✅ 正式导出 |
| 已完成 | ❌ | ✅ 下载终稿 |

---

## 9. PNG 导出实现要点（实施参考）

```typescript
// 伪代码 — 实施阶段放入 frontend/src/utils/exportContractPng.ts

import { toPng } from 'html-to-image'
import JSZip from 'jszip'

/** 按页导出 PNG，返回 Blob 列表 */
async function exportPagesAsPng(pageElements: HTMLElement[], scale = 2): Promise<Blob[]> {
  const blobs: Blob[] = []
  for (const el of pageElements) {
    const dataUrl = await toPng(el, {
      cacheBust: true,
      pixelRatio: scale,
      backgroundColor: '#ffffff',
    })
    blobs.push(await (await fetch(dataUrl)).blob())
  }
  return blobs
}

/** 打包 ZIP 并触发下载 */
async function downloadPngZip(blobs: Blob[], baseName: string) {
  const zip = new JSZip()
  blobs.forEach((blob, i) => {
    zip.file(`${baseName}-${String(i + 1).padStart(3, '0')}.png`, blob)
  })
  const content = await zip.generateAsync({ type: 'blob' })
  // ... trigger download
}
```

**注意**：

- 导出前 `blur` 编辑区，确保 DOM 与已保存内容一致；若有未保存修改，提示先保存。
- 跨域图片（OSS 头像等）需 `useCORS` 或导出前替换为 inline。
- 水印可在导出前向 `.doc-page` 注入绝对定位 DOM，与正文一并截图。

---

## 10. 部署清单（2C2G）

### 10.1 最小进程

```text
nginx          → 80/443
contract-hub   → Go 二进制 :8080
mysql          → 3306
```

**默认不启动** `document-engine`（Python）。若保留 DOCX 导入解析，可：

- 改为前端 `mammoth` 纯浏览器导入，**彻底去掉 Python 服务**；或
- Python 仅监听内网，按需调用 `/parse`，且 **单 worker、低并发**。

### 10.2 不推荐组件

- OnlyOffice / Collabora Docker
- Redis（除非 Presence 扩容需要，初期可不用）
- 服务端 Chromium / Puppeteer

---

## 11. 实施阶段

| 阶段 | 内容 | 优先级 | 状态 |
|------|------|--------|------|
| **P0** | 前端：按 `.doc-page` 导出 PNG + ZIP 下载 | P0 | ✅ 已完成 |
| **P1** | 确认后锁定编辑；导出前校验已保存 | P0 | ✅ 已完成 |
| **P2** | 隐藏/删除 DOCX 下载入口与后端路由 | P0 | ✅ 已完成 |
| **P3** | 删除 `docx_renderer.py`、`/render`、Go render 调用 | P1 | ✅ 已完成 |
| **P4** | 合同详情 UI 合并为单编辑视图；弱化 docx-preview Tab | P1 | ✅ 已完成 |
| **P5** | `migrate_v3.sql` + PNG 上传 OSS 归档 API | P2 | ✅ 已完成 |
| **P6** | 简化变更记录 UI；停止块级 diff 写入 | P2 | ✅ 已完成 |
| **P7** | 评估下线 `docx_parser` / Python 服务 | P3 | ✅ 已评估：保留 `/parse` 导入，服务改为 parse-only |
| **P8** | V2 阶段 6「业务类型枚举」（与文档层无关，可并行） | P3 | ⏭️ 未纳入本次 |

---

## 12. 风险与对策

| 风险 | 对策 |
|------|------|
| PNG 分辨率不足 | `pixelRatio: 2` 或 3；A4 宽度按 794px 设计 |
| 超长合同页数多 | 分页导出 + ZIP；单页失败重试 |
| 导入 DOCX 乱码/乱版 | 产品预期管理 + 网页手动调整 |
| 用户习惯 DOCX 交付 | 说明「终稿以 PNG 为准」；必要时后期再加 PDF（仍浏览器打印） |
| 块级 diff 下线后审计变弱 | 版本备注 + PNG 归档 + 文件 hash |

---

## 13. 修订记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-08-28 | v1.1 | 按 §11 完成 P0～P7 实施并勾选进度 |

---

## 14. 总结

V3 不是推翻 V2 的业务改造，而是**更换文档技术路线**：

1. **放弃** DOCX 导入=导出、JSON 重绘、RenderWithTemplate、OnlyOffice 等路线。  
2. **确立** 网页编辑为唯一真相，PNG 为法定交付物。  
3. **算力下沉到浏览器**，2C2G 只跑 Go + MySQL，支撑 4 人并发。  
4. **实施时**按 §5.2 废案清单删除代码，按 §11 分阶段落地。

业务流仍为：**模板池 → 客户 → 分配合同 → 协作编辑 → 确认 → 导出归档**。
