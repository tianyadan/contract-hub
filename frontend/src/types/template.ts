/** 合同模板相关类型 */

import type { DocumentContent } from './contract'

export interface TemplateListItem {
  id: number
  template_name: string
  original_file_name: string
  current_version_no: number
  description: string
  create_time: string
  update_time: string
}

export interface TemplateVersionVO {
  id: number
  version_no: number
  oss_url: string
  file_name: string
  file_size: number
  document_content: string | DocumentContent
  change_summary: string
  create_time: string
}

export interface TemplateDetail {
  id: number
  template_name: string
  original_file_name: string
  current_version_id: number
  current_version_no: number
  description: string
  create_time: string
  update_time: string
  version?: TemplateVersionVO
}

export interface TemplateListParams {
  page?: number
  page_size?: number
  keyword?: string
}

export interface TemplateListResult {
  list: TemplateListItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface UploadTemplateResult {
  template_id: number
  template_name: string
  original_file_name: string
  current_version_id: number
  current_version_no: number
}
