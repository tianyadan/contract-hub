import axios from 'axios'
import type { ApiResponse } from '../types/auth'

/** 公开验真接口返回 */
export interface PublicVerifyResult {
  valid: boolean
  reason?: string
  contract_no?: string
  contract_name?: string
  version_no?: number
  status?: number
  status_text?: string
  confirmed_at?: string
  confirmers?: string[]
  page_count?: number
  scanned_page?: number
  pdf_url?: string
  pdf_hash?: string
  exported_at?: string
}

/**
 * 公开验真查询（无需登录）。
 * @param code 验真码
 * @param page 扫码页码（可选）
 */
export async function getPublicVerify(
  code: string,
  page?: number,
): Promise<PublicVerifyResult> {
  const response = await axios.get<ApiResponse<PublicVerifyResult>>(
    `/api/public/verify/${encodeURIComponent(code)}`,
    { params: page ? { page } : undefined },
  )
  const body = response.data
  if (body.code !== 0 || !body.data) {
    throw new Error(body.message || '验真失败')
  }
  return body.data
}
