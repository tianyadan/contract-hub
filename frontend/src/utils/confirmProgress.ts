import type { ConfirmProgress, ContractConfirmation } from '../types/contract'

/** 判断当前用户是否已确认指定版本 */
export function hasUserConfirmedVersion(
  confirmations: ContractConfirmation[],
  versionId: number,
  myType: 0 | 1,
  myUserId?: number,
  myCollaboratorId?: number,
): boolean {
  return confirmations.some((c) => {
    if (c.version_id !== versionId || c.confirm_status !== 1) return false
    if (myType === 0) {
      return c.confirmer_type === 0 && myUserId != null && c.user_id === myUserId
    }
    return (
      c.confirmer_type === 1 &&
      myCollaboratorId != null &&
      c.collaborator_id === myCollaboratorId
    )
  })
}

/** 本次确认后是否需要生成终稿 PDF */
export function willFinalizeAfterConfirm(
  progress: ConfirmProgress,
  myType: 0 | 1,
): boolean {
  if (!progress.requires_dual_confirm) return true
  if (myType === 0) return progress.has_external_confirm
  return progress.has_internal_confirm
}
