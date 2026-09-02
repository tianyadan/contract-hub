/**
 * 合同相关类型定义。
 * 字段与 Go 后端 ContractListItem / ContractDetailVO / VersionListItem /
 * VersionDetailVO / ChangeListItem 保持一致。
 */

/** 块在原始 DOCX 中的模板位置（后端渲染保样式用） */
export interface SourceRef {
  /** 原始元素类型：段落 / 表格 */
  kind: 'paragraph' | 'table'
  /** 在正文（body）中的原始序号，从 0 开始 */
  index: number
}

/** 页面设置（纸张大小、页边距、方向），单位 twips（1 twip = 1/20 pt） */
export interface PageSetup {
  /** 页面宽度（twips） */
  width: number
  /** 页面高度（twips） */
  height: number
  /** 方向：纵向 / 横向 */
  orientation: 'portrait' | 'landscape'
  /** 上边距（twips） */
  margin_top: number
  /** 右边距（twips） */
  margin_right: number
  /** 下边距（twips） */
  margin_bottom: number
  /** 左边距（twips） */
  margin_left: number
}

/** 块样式（解析自原始 DOCX，前端渲染保真用） */
export interface BlockStyle {
  /** 对齐方式：left / center / right / justify */
  alignment?: string
  /** 行距（倍数或固定 pt 值） */
  line_spacing?: number
  /** 行距规则：multiple / exact / at_least */
  line_spacing_rule?: string
  /** 段前距（pt） */
  space_before?: number
  /** 段后距（pt） */
  space_after?: number
  /** 首行缩进（twips） */
  indent_first_line?: number
  /** 左缩进（twips） */
  indent_left?: number
  /** 右缩进（twips） */
  indent_right?: number
  /** 字号（pt） */
  font_size?: number
  /** 西文字体 */
  font_name?: string
  /** 中文字体（w:eastAsia） */
  east_asia_font?: string
  /** 加粗 */
  bold?: boolean
  /** 斜体 */
  italic?: boolean
  /** 下划线 */
  underline?: boolean
  /** 删除线 */
  strike?: boolean
  /** 文字颜色（hex，无 #） */
  color?: string
  /** 文本高亮（Word 高亮名：yellow / green / cyan / magenta / blue / red / darkBlue 等） */
  highlight?: string
  /** 文字阴影 */
  shadow?: boolean
  /** 段落底纹（背景色 hex，无 #，如 F2F2F2） */
  shading?: string
}

/** 段落内单个 run（混合样式，如金额部分蓝色下划线） */
export interface DocumentRun {
  /** run 文本 */
  text: string
  /** run 级样式（颜色、下划线、加粗、字号等） */
  style: BlockStyle
}

/** 文档内容块（由 Python Document Engine 解析生成） */
export interface DocumentBlock {
  /** 块唯一 ID，Diff 和在线编辑都基于它定位 */
  id: string
  /** 块类型：paragraph 段落 / heading 标题 / table 表格 / formula 公式 */
  type: 'paragraph' | 'heading' | 'table' | 'formula'
  /** 块文本内容（段落内 runs 拼接后的完整文本） */
  text: string
  /** 排序号 */
  order: number
  /** 原 DOCX 页序号，从 0 开始；导入解析时生成，用于 web 按原文档分页展示 */
  page_index?: number
  /**
   * 当前块前强制分页。
   * 新版编辑器以 Web 页面为最终排版标准，导入时只把 DOCX 显式分页符转换为该字段；
   * 真实页数由前端按纸张尺寸、页边距和块高度重新计算。
   */
  page_break_before?: boolean
  /** 历史兼容字段：旧版曾写入 Web 自动分页。新版不再用于 DOCX 强制分页 */
  export_page_break_before?: boolean
  /** 标题级别（heading 使用） */
  level: number
  /** 公式列表（formula 使用） */
  formulas: string[]
  /** 表格行数据（table 使用） */
  rows?: string[][]
  /**
   * 原始 DOCX 模板位置。
   * - 已有段落 / 表格：保留原值（编辑、保存时绝对不能丢，否则导出样式丢失）
   * - 新增内容块：必须为 null
   * - 旧数据可能缺失该字段，后端会降级为无模板渲染
   */
  source_ref?: SourceRef | null
  /** 块样式（段落级主导样式，字体、字号、对齐、缩进等），旧数据可能缺失 */
  style?: BlockStyle
  /**
   * 段落内混合 run 样式（局部颜色 / 下划线等）。
   * 段落内样式统一时该字段为空，仅靠 style 即可。
   */
  runs?: DocumentRun[]
}

/** 结构化文档内容（保存新版本时的请求体结构） */
export interface DocumentContent {
  /** 文档结构版本。3 表示网页画布为最终导出标准 */
  schema_version?: number
  /** 渲染模式：web_canvas 表示以网页呈现为准导出 PNG */
  render_mode?: 'web_canvas' | 'web_editor' | string
  /** 元数据（可选） */
  metadata?: Record<string, unknown>
  /** 页面设置（纸张大小 / 页边距 / 方向），前端分页渲染用 */
  page?: PageSetup
  /** 文档默认样式（Normal 样式兜底） */
  default_style?: BlockStyle
  /** 页眉 */
  headers?: { id: string; text: string }[]
  /** 页脚 */
  footers?: { id: string; text: string }[]
  /** 正文块列表 */
  blocks: DocumentBlock[]
}

/** 合同列表返回项 */
export interface ContractListItem {
  /** 合同 ID */
  id: number
  /** 合同编号 */
  contract_no: string
  /** 合同名称 */
  contract_name: string
  /** 客户名称 */
  customer_name: string
  /** 合同状态：0已导入 1已分享 2协作中 3已确认 4已完成 5已取消 */
  status: number
  /** 状态中文描述 */
  status_text: string
  /** 当前版本号 */
  current_version_no: number
  /** 创建时间 */
  create_time: string
  /** 最近更新时间 */
  update_time: string
}

/** 合同列表查询参数 */
export interface ContractListParams {
  /** 页码，默认 1 */
  page?: number
  /** 每页数量，默认 10，最大 100 */
  page_size?: number
  /** 合同名称或编号关键字 */
  keyword?: string
  /** 合同状态筛选 */
  status?: number
  /** 客户名称 */
  customer_name?: string
}

/** 合同列表分页结果 */
export interface ContractListResult {
  /** 当前页合同列表 */
  list: ContractListItem[]
  /** 总记录数 */
  total: number
  /** 当前页码 */
  page: number
  /** 每页数量 */
  page_size: number
  /** 总页数 */
  total_pages: number
}

/** 合同当前版本信息（详情接口内嵌） */
export interface ContractVersionVO {
  id: number
  version_no: number
  oss_url: string
  file_name: string
  file_size: number
  file_hash: string
  /** 文档内容 JSON 字符串（需要解析为 DocumentContent） */
  document_content: string
  change_summary: string
  create_time: string
}

/** 合同详情 */
export interface ContractDetail {
  id: number
  contract_no: string
  contract_name: string
  customer_name: string
  customer_contact: string
  customer_phone: string
  status: number
  status_text: string
  current_version_id: number
  current_version_no: number
  description: string
  create_time: string
  update_time: string
  /** 当前版本（可能为空） */
  version?: ContractVersionVO
}

/** 版本列表返回项 */
export interface ContractVersionItem {
  version_id: number
  version_no: number
  change_summary: string
  created_by: number
  created_by_name: string
  create_time: string
}

/** 版本详情 */
export interface ContractVersionDetail {
  version_id: number
  version_no: number
  /** 结构化文档内容 */
  document_content: DocumentContent
  change_summary: string
  created_by: number
  created_by_name: string
  create_time: string
}

/** 变更记录列表返回项（change_type：0新增 1删除 2修改） */
export interface ContractChange {
  id: number
  from_version_id: number
  to_version_id: number
  change_type: number
  change_type_text: string
  block_id: string
  clause_no: string
  old_content: string
  new_content: string
  /** 变更说明（含样式 diff 中文描述） */
  change_reason?: string
  operator_name: string
  create_time: string
}

/** 保存新版本请求参数 */
export interface SaveVersionParams {
  /** 编辑后的结构化文档 */
  document_content: DocumentContent
  /** 本次修改说明 */
  change_summary: string
}

/** 保存新版本返回结果 */
export interface SaveVersionResult {
  contract_id: number
  version_id: number
  version_no: number
  change_count: number
  create_time: string
}

/** 分享入口信息（加入前，不含合同名称/编号） */
export interface SharePublicInfo {
  permission: number
  permission_text: string
  status: number
  expire_time?: string
}

/** 分享链接信息（后端 ShareInfoVO，内部创建分享时返回） */
export interface ShareInfo {
  /** 分享记录 ID */
  share_id: number
  /** 分享令牌 */
  token: string
  /** 合同 ID */
  contract_id: number
  /** 合同名称 */
  contract_name: string
  /** 合同编号 */
  contract_no: string
  /** 权限：0 只读 1 可编辑 */
  permission: number
  /** 权限描述：只读 / 可编辑 */
  permission_text: string
  /** 分享状态 */
  status: number
  /** 过期时间（不传则不过期） */
  expire_time?: string
  /** 创建时间 */
  create_time: string
}

/** 确认操作结果 */
export interface ConfirmOutcome {
  status: 'pending' | 'completed'
  message: string
  pending_parties?: string[]
}

/** 双方确认进度 */
export interface ConfirmProgress {
  requires_dual_confirm: boolean
  has_internal_confirm: boolean
  has_external_confirm: boolean
  pending_parties: string[]
  will_finalize_on_next: boolean
}

/** 创建分享链接请求参数 */
export interface CreateShareParams {
  /** 权限：0 只读 1 可编辑 */
  permission: 0 | 1
  /** 过期小时数，0 表示不过期 */
  expire_hours: number
}

/** 外部协作者看到的合同内容（ShareContractVO） */
export interface ShareContract {
  contract_id: number
  contract_no: string
  contract_name: string
  status: number
  status_text: string
  current_version_id: number
  current_version_no: number
  /** 当前版本文档内容 */
  document_content: DocumentContent
  /** 当前协作者权限：0 只读 1 可编辑 */
  permission: number
}

/** 外部协作者信息（CollaboratorVO） */
export interface Collaborator {
  collaborator_id: number
  name: string
  /** 权限：0 只读 1 可编辑 */
  permission: number
}

/** 合同确认记录（ContractConfirmation） */
export interface ContractConfirmation {
  id: number
  contract_id: number
  version_id: number
  user_id?: number | null
  collaborator_id?: number | null
  /** 确认人姓名 */
  confirmer_name: string
  /** 确认人类型：0 内部用户 1 外部协作者 */
  confirmer_type: number
  /** 确认状态：0 取消确认 1 已确认 */
  confirm_status: number
  confirm_ip: string
  user_agent: string
  confirm_time: string
  create_time: string
}

/** 在线状态用户（WS presence 消息） */
export interface PresenceUser {
  /** 用户标识（role-name） */
  id: string
  /** 展示名称 */
  name: string
  /** 角色：owner 创建者 / collaborator 协作者 */
  role?: string
  /** 是否在线 */
  is_online: boolean
}

/** WebSocket 在线状态消息 */
export interface PresenceMessage {
  /** 消息类型：presence / join / leave */
  type: 'presence' | 'join' | 'leave'
  /** 单个用户（join / leave 时） */
  data?: { name: string; role: string }
  /** 在线用户列表（presence 时） */
  list?: { name: string; role: string }[]
}
