import type { DocumentContent, ContractChange } from '../types/contract'
import type { ChangeHighlightState } from '../components/contract/changeHighlightTypes'
import { inferChangeHighlightKind } from './textDiff'

/** 文档中是否包含指定块 */
export function documentHasBlock(
  content: DocumentContent | null | undefined,
  blockId: string,
): boolean {
  if (!content?.blocks?.length || !blockId) return false
  return content.blocks.some((b) => b.id === blockId)
}

/** 将变更记录转为编辑器高亮状态 */
export function buildChangeHighlightState(change: ContractChange): ChangeHighlightState {
  const changeType = (change.change_type === 0 || change.change_type === 1 || change.change_type === 2
    ? change.change_type
    : 2) as 0 | 1 | 2
  return {
    blockId: change.block_id,
    changeType,
    oldText: change.old_content ?? '',
    newText: change.new_content ?? '',
    kind: inferChangeHighlightKind(change.change_reason, change.change_type),
  }
}

/**
 * 决定定位时应加载的版本：
 * - 删除：from_version
 * - 新增/修改：to_version
 */
export function resolveLocateVersionId(change: ContractChange): number {
  return change.change_type === 1 ? change.from_version_id : change.to_version_id
}
