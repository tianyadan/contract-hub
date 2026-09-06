import type { DocumentBlock, DocumentContent } from '../types/contract'

/** 块级冲突项（与后端 BlockConflict 对齐） */
export interface BlockConflictItem {
  block_id: string
  summary: string
  ours_preview: string
  theirs_preview: string
  ours_present: boolean
  theirs_present: boolean
  ours_block?: DocumentBlock
  theirs_block?: DocumentBlock
}

/** 保存版本冲突载荷（HTTP 409 / code 40901） */
export interface VersionConflictPayload {
  current_version_id: number
  current_version_no: number
  base_version_id: number
  merged_document: DocumentContent
  conflicts: BlockConflictItem[]
}

/** 单块冲突选择：保留我的 / 保留对方的 */
export type ConflictChoice = 'ours' | 'theirs'

/**
 * 将用户对冲突块的选择应用到合并稿，得到可再次保存的文档。
 */
export function applyConflictResolutions(
  merged: DocumentContent,
  conflicts: BlockConflictItem[],
  choices: Record<string, ConflictChoice>,
): DocumentContent {
  const blockMap = new Map<string, DocumentBlock>()
  for (const b of merged.blocks ?? []) {
    if (b?.id) blockMap.set(b.id, b)
  }

  for (const c of conflicts) {
    const side: ConflictChoice = choices[c.block_id] ?? 'ours'
    if (side === 'theirs') {
      if (!c.theirs_present || !c.theirs_block) {
        blockMap.delete(c.block_id)
      } else {
        blockMap.set(c.block_id, c.theirs_block)
      }
    } else if (!c.ours_present || !c.ours_block) {
      blockMap.delete(c.block_id)
    } else {
      blockMap.set(c.block_id, c.ours_block)
    }
  }

  const ordered: DocumentBlock[] = []
  const seen = new Set<string>()
  for (const b of merged.blocks ?? []) {
    const next = blockMap.get(b.id)
    if (!next || seen.has(b.id)) continue
    ordered.push(next)
    seen.add(b.id)
  }
  for (const [id, b] of blockMap) {
    if (seen.has(id)) continue
    ordered.push(b)
  }

  return {
    ...merged,
    blocks: ordered.map((b, i) => ({ ...b, order: i + 1 })),
  }
}
