import { requestTyped } from './request'
import type { InviteCodeVO, UserVO } from '../types/auth'

/** 分页用户列表结果 */
export interface AdminUserListResult {
  list: UserVO[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

/** 管理员分页查询用户。 */
export function getAdminUsers(params: {
  page?: number
  page_size?: number
  keyword?: string
  status?: number
}): Promise<AdminUserListResult> {
  return requestTyped<AdminUserListResult>({ url: '/admin/users', method: 'get', params })
}

/** 封禁用户。 */
export function banUser(id: number): Promise<void> {
  return requestTyped<void>({ url: `/admin/users/${id}/ban`, method: 'post' })
}

/** 启用用户。 */
export function enableUser(id: number): Promise<void> {
  return requestTyped<void>({ url: `/admin/users/${id}/enable`, method: 'post' })
}

/** 软删除用户。 */
export function deleteUser(id: number): Promise<void> {
  return requestTyped<void>({ url: `/admin/users/${id}`, method: 'delete' })
}

/** 重置密码为默认 12345678。 */
export function resetUserPassword(id: number): Promise<{ default_password: string }> {
  return requestTyped<{ default_password: string }>({
    url: `/admin/users/${id}/reset-password`,
    method: 'post',
  })
}

/** 生成邀请码。 */
export function createInviteCode(): Promise<InviteCodeVO> {
  return requestTyped<InviteCodeVO>({ url: '/admin/invite-codes', method: 'post' })
}

/** 邀请码列表。 */
export function listInviteCodes(limit = 20): Promise<InviteCodeVO[]> {
  return requestTyped<InviteCodeVO[]>({
    url: '/admin/invite-codes',
    method: 'get',
    params: { limit },
  })
}
