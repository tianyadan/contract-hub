import type { DocumentContent } from '../types/contract'

/** V3：将文档快照规范为网页画布模式 */
export function normalizeDocumentContent(raw: unknown): DocumentContent | null {
  if (!raw) return null
  const parse = (content: DocumentContent): DocumentContent => ({
    ...content,
    schema_version: 3,
    render_mode: 'web_canvas',
    blocks: content.blocks ?? [],
  })
  if (typeof raw === 'string') {
    try {
      return parse(JSON.parse(raw) as DocumentContent)
    } catch {
      return null
    }
  }
  return parse(raw as DocumentContent)
}

/** 合同是否已锁定（已确认 / 已完成不可再编辑） */
export function isContractLocked(status: number): boolean {
  return status >= 3 && status !== 5
}
