import type { DocumentBlock, DocumentContent, DocumentSeal } from '../types/contract'
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

/** 规范化电子章列表 */
function normalizeSeals(raw: DocumentSeal[] | undefined): DocumentSeal[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s) => s && (s.oss_key || s.image_url || (s.asset_id && s.asset_id > 0)))
    .map((s, index) => ({
      id: s.id || `seal-${index}`,
      oss_key: s.oss_key,
      asset_id: s.asset_id,
      image_url: s.image_url || '',
      page_index: Math.max(0, Number(s.page_index) || 0),
      x_ratio: clampRatio(Number(s.x_ratio)),
      y_ratio: clampRatio(Number(s.y_ratio)),
      scale: clampScale(Number(s.scale) || 1),
      rotate: s.rotate,
      placed_by: s.placed_by,
      placed_at: s.placed_at,
    }))
}

function clampRatio(v: number): number {
  if (!Number.isFinite(v)) return 0.5
  return Math.min(0.95, Math.max(0.05, v))
}

function clampScale(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1
  return Math.min(2.5, Math.max(0.4, v))
}

/** @deprecated 协作期已持久化 seals；保留空实现兼容旧调用 */
export function stripSealsForSave(content: DocumentContent): DocumentContent {
  return content
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
    const seals = normalizeSeals(content.seals)

    return {
      ...content,
      schema_version: 3,
      render_mode: 'web_canvas',
      page,
      blocks,
      seals: seals.length > 0 ? seals : undefined,
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
