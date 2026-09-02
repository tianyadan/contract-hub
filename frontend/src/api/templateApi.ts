import { requestBlob, requestTyped } from './request'
import type {
  TemplateDetail,
  TemplateListParams,
  TemplateListResult,
  UploadTemplateResult,
} from '../types/template'
import type { DocumentContent } from '../types/contract'

/** 上传模板 DOCX */
export async function uploadTemplate(
  file: File,
  templateName?: string,
  description?: string,
): Promise<UploadTemplateResult> {
  const formData = new FormData()
  formData.append('file', file)
  if (templateName) formData.append('template_name', templateName)
  if (description) formData.append('description', description)
  return requestTyped({
    url: '/templates/upload',
    method: 'POST',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/** 模板列表 */
export async function getTemplateList(params?: TemplateListParams): Promise<TemplateListResult> {
  return requestTyped({ url: '/templates', method: 'GET', params })
}

/** 模板详情（解析 document_content，与合同详情一致） */
export async function getTemplateDetail(id: number): Promise<TemplateDetail> {
  const detail = await requestTyped<TemplateDetail>({ url: `/templates/${id}`, method: 'GET' })
  const raw = detail.version?.document_content
  if (raw && typeof raw === 'string') {
    try {
      detail.version!.document_content = JSON.parse(raw) as DocumentContent
    } catch {
      detail.version!.document_content = ''
    }
  }
  return detail
}

/** 更新模板名称与说明 */
export async function updateTemplateMeta(
  id: number,
  data: { template_name: string; description?: string },
): Promise<void> {
  return requestTyped({ url: `/templates/${id}`, method: 'PUT', data })
}

/** 删除模板 */
export async function deleteTemplate(id: number): Promise<void> {
  return requestTyped({ url: `/templates/${id}`, method: 'DELETE' })
}

/** 获取模板 DOCX 预览二进制 */
export async function fetchTemplatePreview(id: number): Promise<ArrayBuffer> {
  const res = await requestBlob({ url: `/templates/${id}/preview`, method: 'GET' })
  return res.data.arrayBuffer()
}

/** 保存模板结构化内容 */
export async function saveTemplateContent(
  id: number,
  documentContent: DocumentContent,
  changeSummary: string,
): Promise<void> {
  return requestTyped({
    url: `/templates/${id}/content`,
    method: 'PUT',
    data: { document_content: documentContent, change_summary: changeSummary },
  })
}
