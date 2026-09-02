import { requestBlob, requestTyped } from './request'
import type {
  ContractConfirmation,
  ContractDetail,
  ContractListParams,
  ContractListResult,
  ContractVersionDetail,
  ContractVersionItem,
  ContractChange,
  CreateShareParams,
  SaveVersionParams,
  SaveVersionResult,
  ShareInfo,
  ConfirmOutcome,
  ConfirmProgress,
} from '../types/contract'
import { getMessageApi } from '../utils/message'

/**
 * 创建合同（上传 DOCX，multipart/form-data）。
 * @param formData 表单：contract_name 必填，file 必填，其余选填
 * @returns 创建结果
 */
export function createContract(formData: FormData): Promise<Record<string, unknown>> {
  return requestTyped<Record<string, unknown>>({
    url: '/contracts',
    method: 'post',
    data: formData,
    // 上传文件不设置 Content-Type，由浏览器自动带上 boundary
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/**
 * 分页查询当前用户的合同列表。
 * @param params 查询参数（分页、关键字、状态、客户名称）
 * @returns 分页合同列表
 */
export function getContractList(params: ContractListParams): Promise<ContractListResult> {
  return requestTyped<ContractListResult>({ url: '/contracts', method: 'get', params })
}

/**
 * 获取合同详情。
 * 返回时自动把版本里的 document_content 字符串解析为结构化对象。
 * @param id 合同 ID
 * @returns 合同详情
 */
export async function getContractDetail(id: number): Promise<ContractDetail> {
  const detail = await requestTyped<ContractDetail>({
    url: `/contracts/${id}`,
    method: 'get',
  })
  // 把 document_content JSON 字符串解析为对象，方便编辑器直接使用
  if (detail.version?.document_content) {
    try {
      detail.version.document_content = JSON.parse(detail.version.document_content)
    } catch {
      detail.version.document_content = ''
    }
  }
  return detail
}

/**
 * 删除单个合同。
 * @param id 合同 ID
 */
export function deleteContract(id: number): Promise<void> {
  return requestTyped<void>({
    url: `/contracts/${id}`,
    method: 'delete',
  })
}

/**
 * 批量删除合同。
 * @param ids 合同 ID 列表
 */
export function batchDeleteContracts(ids: number[]): Promise<void> {
  return requestTyped<void>({
    url: '/contracts',
    method: 'delete',
    data: { ids },
  })
}

/**
 * 保存新版本：提交编辑后的网页文档快照。
 * @param id 合同 ID
 * @param data 新版本内容 + 修改说明
 * @returns 保存结果（新版本号）
 */
export function saveContractVersion(
  id: number,
  data: SaveVersionParams,
): Promise<SaveVersionResult> {
  return requestTyped<SaveVersionResult>({
    url: `/contracts/${id}/versions`,
    method: 'post',
    data,
  })
}

/**
 * 分页查询合同版本列表。
 * @param id 合同 ID
 * @param params 分页参数
 * @returns 分页版本列表
 */
export function getContractVersions(
  id: number,
  params: { page?: number; page_size?: number } = {},
): Promise<ContractListResult & { list: ContractVersionItem[] }> {
  return requestTyped<ContractListResult & { list: ContractVersionItem[] }>({
    url: `/contracts/${id}/versions`,
    method: 'get',
    params,
  })
}

/**
 * 获取指定历史版本的完整结构化内容。
 * @param id 合同 ID
 * @param versionId 版本 ID
 * @returns 版本详情
 */
export function getContractVersionDetail(
  id: number,
  versionId: number,
): Promise<ContractVersionDetail> {
  return requestTyped<ContractVersionDetail>({
    url: `/contracts/${id}/versions/${versionId}`,
    method: 'get',
  })
}

/**
 * 分页查询合同变更记录。
 * @param id 合同 ID
 * @param params 分页参数
 * @returns 分页变更记录
 */
export function getContractChanges(
  id: number,
  params: { page?: number; page_size?: number } = {},
): Promise<ContractListResult & { list: ContractChange[] }> {
  return requestTyped<ContractListResult & { list: ContractChange[] }>({
    url: `/contracts/${id}/changes`,
    method: 'get',
    params,
  })
}

/**
 * 为合同生成外部协作者分享链接。
 * @param id 合同 ID
 * @param params 分享参数（权限 + 过期小时数）
 * @returns 分享信息
 */
export function createContractShare(
  id: number,
  params: CreateShareParams,
): Promise<ShareInfo> {
  return requestTyped<ShareInfo>({ url: `/contracts/${id}/share`, method: 'post', data: params })
}

/**
 * 使分享链接失效。
 * @param id 合同 ID
 * @param shareId 分享记录 ID
 */
export function disableContractShare(
  id: number,
  shareId: number,
): Promise<Record<string, unknown>> {
  return requestTyped<Record<string, unknown>>({
    url: `/contracts/${id}/share/${shareId}/disable`,
    method: 'post',
  })
}

/**
 * 确认前预分配验真码（用于生成二维码）。
 */
export function prepareFinalExport(id: number): Promise<{
  verify_code: string
  public_web_origin: string
}> {
  return requestTyped({
    url: `/contracts/${id}/prepare-final-export`,
    method: 'post',
  })
}

/** PDF 导出归档信息 */
export interface ContractExportPdfInfo {
  version_id: number
  version_no: number
  page_count: number
  hash: string
  verify_code?: string
  exported_at: string
  pdf_url: string
  object_key: string
}

/**
 * 仅提交确认意向（双方确认的第一方，无需 PDF）。
 */
export function confirmContractAck(id: number): Promise<ConfirmOutcome> {
  const formData = new FormData()
  return requestTyped<ConfirmOutcome>({
    url: `/contracts/${id}/confirm`,
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  })
}

/**
 * 确认合同并上传终稿 PDF（双方确认的最后一方）。
 */
export function confirmContractWithPdf(
  id: number,
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
    url: `/contracts/${id}/confirm`,
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
}

/** 查询当前版本双方确认进度 */
export function getConfirmProgress(id: number): Promise<ConfirmProgress> {
  return requestTyped<ConfirmProgress>({
    url: `/contracts/${id}/confirm-progress`,
    method: 'get',
  })
}

/**
 * 上传 PDF 草稿或终稿到 OSS 归档。
 */
export function uploadContractExportPdf(
  id: number,
  file: Blob,
  hash: string,
  pageCount: number,
  options: { verify_code?: string; draft?: boolean } = {},
): Promise<ContractExportPdfInfo> {
  const formData = new FormData()
  formData.append('file', file, options.draft ? 'draft.pdf' : 'final.pdf')
  formData.append('hash', hash)
  formData.append('page_count', String(pageCount))
  if (options.verify_code) formData.append('verify_code', options.verify_code)
  if (options.draft) formData.append('draft', '1')
  return requestTyped<ContractExportPdfInfo>({
    url: `/contracts/${id}/export-pdf`,
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
}

/** 获取当前版本已归档 PDF 信息 */
export function getContractExportPdf(id: number): Promise<ContractExportPdfInfo> {
  return requestTyped<ContractExportPdfInfo>({
    url: `/contracts/${id}/export-pdf`,
    method: 'get',
  })
}

/**
 * 确认合同（内部用户）— 已改为 confirmContractWithPdf，保留类型兼容。
 * @deprecated 请使用 confirmContractWithPdf
 */
export function confirmContract(id: number): Promise<Record<string, unknown>> {
  return requestTyped<Record<string, unknown>>({
    url: `/contracts/${id}/confirm`,
    method: 'post',
  })
}

/**
 * 查看合同的确认记录。
 * @param id 合同 ID
 * @returns 确认记录列表
 */
export function getContractConfirmations(id: number): Promise<ContractConfirmation[]> {
  return requestTyped<ContractConfirmation[]>({
    url: `/contracts/${id}/confirmations`,
    method: 'get',
  })
}

/** 获取合同当前版本 DOCX 二进制（仅作导入原文件参考，可选；失败时返回 null） */
export async function fetchContractPreview(id: number): Promise<ArrayBuffer | null> {
  try {
    const response = await requestBlob({
      url: `/contracts/${id}/preview`,
      method: 'get',
      skipErrorToast: true,
    })
    return response.data.arrayBuffer()
  } catch {
    return null
  }
}

/** PNG 导出归档信息 */
export interface ContractExportPngInfo {
  version_id: number
  version_no: number
  page_count: number
  hash: string
  exported_at: string
  pages: { page_no: number; url: string; object_key: string }[]
}

/**
 * 上传 PNG 终稿到 OSS 归档（浏览器导出后可选调用）。
 */
export function uploadContractExportPng(
  id: number,
  files: Blob[],
  hash: string,
): Promise<ContractExportPngInfo> {
  const formData = new FormData()
  files.forEach((file, index) => {
    formData.append('files', file, `page-${String(index + 1).padStart(3, '0')}.png`)
  })
  formData.append('hash', hash)
  return requestTyped<ContractExportPngInfo>({
    url: `/contracts/${id}/export-png`,
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/** 获取当前版本已归档的 PNG 列表 */
export function getContractExportPng(id: number): Promise<ContractExportPngInfo> {
  return requestTyped<ContractExportPngInfo>({
    url: `/contracts/${id}/export-png`,
    method: 'get',
  })
}

/**
 * 触发浏览器下载 Blob 文件。
 * @param blob 文件内容
 * @param fileName 文件名
 */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  // 创建临时对象 URL 并模拟点击下载
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  getMessageApi().success('文件下载中')
}
