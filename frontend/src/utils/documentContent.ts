import type { DocumentBlock, DocumentContent } from '../types/contract'
import { DEFAULT_A4_PAGE } from './paginateDocument'

/** 规范化单个文档块（兼容旧模板导入数据） */
function normalizeBlock(block: DocumentBlock, index: number): DocumentBlock {
  return {
    ...block,
    id: block.id || `block-${index}`,
    order: block.order ?? index,
    type: block.type || 'paragraph',
    level: block.level ?? 0,
    formulas: block.formulas ?? [],
    page_break_before: Boolean(block.page_break_before || block.export_page_break_before),
  }
}

/** V3：将文档快照规范为网页画布模式（合同 / 模板池统一入口） */
export function normalizeDocumentContent(raw: unknown): DocumentContent | null {
  if (!raw) return null

  const parse = (content: DocumentContent): DocumentContent => {
    const blocks = (content.blocks ?? []).map((block, index) => normalizeBlock(block, index))
    const page =
      content.page && content.page.width > 0 && content.page.height > 0
        ? content.page
        : DEFAULT_A4_PAGE

    return {
      ...content,
      schema_version: 3,
      render_mode: 'web_canvas',
      page,
      blocks,
    }
  }

  if (typeof raw === 'string') {
    try {
      return parse(JSON.parse(raw) as DocumentContent)
    } catch {
      return null
    }
  }
  return parse(raw as DocumentContent)
}

/** 保存前写入 V3 网页画布标记（与合同详情页一致） */
export function prepareSaveDocumentContent(content: DocumentContent): DocumentContent {
  const normalized = normalizeDocumentContent(content)
  if (!normalized) {
    return {
      ...content,
      schema_version: 3,
      render_mode: 'web_canvas',
      blocks: content.blocks ?? [],
    }
  }
  return normalized
}

/** 合同是否已锁定（已确认 / 已完成不可再编辑） */
export function isContractLocked(status: number): boolean {
  return status >= 3 && status !== 5
}
