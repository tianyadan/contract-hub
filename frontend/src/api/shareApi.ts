import { requestTyped } from './request'
import type {
  Collaborator,
  ConfirmOutcome,
  ConfirmProgress,
  ContractChange,
  ContractConfirmation,
  ContractVersionDetail,
  ContractVersionItem,
  DocumentContent,
  ShareContract,
  SharePublicInfo,
} from '../types/contract'

/**
 * 外部分享相关 API（免登录，通过 URL token + 协作者姓名访问）。
 * 后端通过 collaborator_name（query 或 X-Collaborator-Name 头）识别协作者。
 */

/** 拼接协作者姓名查询参数 */
function withName(name: string, params: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...params, collaborator_name: name }
}

/**
 * 获取分享入口信息（加入前不返回合同名称/编号）。
 */
export function getShareInfo(token: string): Promise<SharePublicInfo> {
  return requestTyped<SharePublicInfo>({ url: `/share/${token}`, method: 'get' })
}

/**
 * 外部协作者加入（输入姓名后调用）。
 * @param token 分享令牌
 * @param name 协作者姓名
 * @returns 协作者信息
 */
export function joinShare(token: string, name: string, phone: string): Promise<Collaborator> {
  return requestTyped<Collaborator>({
    url: `/share/${token}/join`,
    method: 'post',
    data: { name, phone },
  })
}

/**
 * 获取分享合同的当前版本内容。
 * @param token 分享令牌
 * @param name 协作者姓名
 * @returns 合同内容（含当前版本文档与权限）
 */
export function getShareContract(token: string, name: string): Promise<ShareContract> {
  return requestTyped<ShareContract>({
    url: `/share/${token}/contract`,
    method: 'get',
    params: withName(name),
  })
}

/**
 * 外部协作者分页查看版本列表。
 * @param token 分享令牌
 * @param name 协作者姓名
 * @param params 分页参数
 */
export function getShareVersions(
  token: string,
  name: string,
  params: { page?: number; page_size?: number } = {},
): Promise<{ list: ContractVersionItem[]; total: number }> {
  return requestTyped<{ list: ContractVersionItem[]; total: number }>({
    url: `/share/${token}/versions`,
    method: 'get',
    params: withName(name, params),
  })
}

/**
 * 外部协作者查看指定版本详情。
 * @param token 分享令牌
 * @param name 协作者姓名
 * @param versionId 版本 ID
 */
export function getShareVersionDetail(
  token: string,
  name: string,
  versionId: number,
): Promise<ContractVersionDetail> {
  return requestTyped<ContractVersionDetail>({
    url: `/share/${token}/versions/${versionId}`,
    method: 'get',
    params: withName(name),
  })
}

/**
 * 外部协作者提交修改（保存新版本）。
 * @param token 分享令牌
 * @param name 协作者姓名
 * @param data 新版本内容 + 修改说明
 */
export function saveShareVersion(
  token: string,
  name: string,
  data: { document_content: DocumentContent; change_summary: string },
): Promise<{ version_id: number; version_no: number; change_count: number }> {
  return requestTyped<{ version_id: number; version_no: number; change_count: number }>({
    url: `/share/${token}/versions`,
    method: 'post',
    params: withName(name),
    data,
  })
}

/**
 * 获取分享合同的变更记录。
 * @param token 分享令牌
 * @param name 协作者姓名
 * @param params 分页参数
 */
export function getShareChanges(
  token: string,
  name: string,
  params: { page?: number; page_size?: number } = {},
): Promise<{ list: ContractChange[]; total: number }> {
  return requestTyped<{ list: ContractChange[]; total: number }>({
    url: `/share/${token}/changes`,
    method: 'get',
    params: withName(name, params),
  })
}

/**
 * 外部分享页预分配验真码。
 */
export function prepareShareFinalExport(
  token: string,
  name: string,
): Promise<{ verify_code: string; public_web_origin: string }> {
  return requestTyped({
    url: `/share/${token}/prepare-final-export`,
    method: 'post',
    params: withName(name),
  })
}

/**
 * 外部协作者仅提交确认意向（无需 PDF）。
 */
export function confirmShareAck(token: string, name: string): Promise<ConfirmOutcome> {
  const formData = new FormData()
  return requestTyped<ConfirmOutcome>({
    url: `/share/${token}/confirm`,
    method: 'post',
    params: withName(name),
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  })
}

/**
 * 外部协作者确认并上传终稿 PDF。
 */
export function confirmShareWithPdf(
  token: string,
  name: string,
  params: {
    file: Blob
    hash: string
    page_count: number
    verify_code: string
  },
): Promise<ConfirmOutcome> {
  const formData = new FormData()
  formData.append('file', params.file, 'final.pdf')
  formData.append('hash', params.hash)
  formData.append('page_count', String(params.page_count))
  formData.append('verify_code', params.verify_code)
  return requestTyped<ConfirmOutcome>({
    url: `/share/${token}/confirm`,
    method: 'post',
    params: withName(name),
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
}

/**
 * 外部分享页上传 PDF 草稿归档。
 */
export function uploadShareExportPdf(
  token: string,
  name: string,
  file: Blob,
  hash: string,
  pageCount: number,
  draft = true,
): Promise<import('./contractApi').ContractExportPdfInfo> {
  const formData = new FormData()
  formData.append('file', file, draft ? 'draft.pdf' : 'final.pdf')
  formData.append('hash', hash)
  formData.append('page_count', String(pageCount))
  if (draft) formData.append('draft', '1')
  return requestTyped({
    url: `/share/${token}/export-pdf`,
    method: 'post',
    params: withName(name),
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
}

/** 外部协作者查询双方确认进度 */
export function getShareConfirmProgress(token: string, name: string): Promise<ConfirmProgress> {
  return requestTyped<ConfirmProgress>({
    url: `/share/${token}/confirm-progress`,
    method: 'get',
    params: withName(name),
  })
}

/**
 * @deprecated 请使用 confirmShareAck / confirmShareWithPdf
 */
export function confirmShare(token: string, name: string): Promise<Record<string, unknown>> {
  return requestTyped<Record<string, unknown>>({
    url: `/share/${token}/confirm`,
    method: 'post',
    params: withName(name),
  })
}

/**
 * 外部协作者查看确认记录。
 * @param token 分享令牌
 * @param name 协作者姓名
 */
export function getShareConfirmations(
  token: string,
  name: string,
): Promise<ContractConfirmation[]> {
  return requestTyped<ContractConfirmation[]>({
    url: `/share/${token}/confirmations`,
    method: 'get',
    params: withName(name),
  })
}
