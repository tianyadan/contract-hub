import { requestTyped } from './request'
import type { FidelitySnapshot, FidelitySnapshotDetail } from '../types/fidelity'
import type { DocumentContent } from '../types/contract'

/** 获取合同高保真快照列表 */
export function getContractFidelitySnapshots(contractId: number): Promise<FidelitySnapshot[]> {
  return requestTyped<FidelitySnapshot[]>({
    url: `/contracts/${contractId}/fidelity-snapshots`,
    method: 'get',
  })
}

/** 获取合同高保真快照详情（含 PDF 签名 URL） */
export function getContractFidelitySnapshot(
  contractId: number,
  snapshotId: number,
): Promise<FidelitySnapshotDetail> {
  return requestTyped<FidelitySnapshotDetail>({
    url: `/contracts/${contractId}/fidelity-snapshots/${snapshotId}`,
    method: 'get',
  })
}

/** 上传合同高保真快照 */
export async function createContractFidelitySnapshot(
  contractId: number,
  payload: {
    file: Blob
    hash: string
    page_count: number
    source_version_no: number
    document_content: DocumentContent
  },
): Promise<FidelitySnapshotDetail> {
  const formData = new FormData()
  formData.append('file', payload.file, 'preview.pdf')
  formData.append('hash', payload.hash)
  formData.append('page_count', String(payload.page_count))
  formData.append('source_version_no', String(payload.source_version_no))
  formData.append('document_content', JSON.stringify(payload.document_content))
  return requestTyped<FidelitySnapshotDetail>({
    url: `/contracts/${contractId}/fidelity-snapshots`,
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
}

/** 回退合同至高保真快照 */
export function rollbackContractFidelitySnapshot(
  contractId: number,
  snapshotId: number,
): Promise<unknown> {
  return requestTyped({
    url: `/contracts/${contractId}/fidelity-snapshots/${snapshotId}/rollback`,
    method: 'post',
  })
}

/** 获取模板高保真快照列表 */
export function getTemplateFidelitySnapshots(templateId: number): Promise<FidelitySnapshot[]> {
  return requestTyped<FidelitySnapshot[]>({
    url: `/templates/${templateId}/fidelity-snapshots`,
    method: 'get',
  })
}

/** 获取模板高保真快照详情 */
export function getTemplateFidelitySnapshot(
  templateId: number,
  snapshotId: number,
): Promise<FidelitySnapshotDetail> {
  return requestTyped<FidelitySnapshotDetail>({
    url: `/templates/${templateId}/fidelity-snapshots/${snapshotId}`,
    method: 'get',
  })
}

/** 上传模板高保真快照 */
export async function createTemplateFidelitySnapshot(
  templateId: number,
  payload: {
    file: Blob
    hash: string
    page_count: number
    source_version_no: number
    document_content: DocumentContent
  },
): Promise<FidelitySnapshotDetail> {
  const formData = new FormData()
  formData.append('file', payload.file, 'preview.pdf')
  formData.append('hash', payload.hash)
  formData.append('page_count', String(payload.page_count))
  formData.append('source_version_no', String(payload.source_version_no))
  formData.append('document_content', JSON.stringify(payload.document_content))
  return requestTyped<FidelitySnapshotDetail>({
    url: `/templates/${templateId}/fidelity-snapshots`,
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
}

/** 回退模板至高保真快照 */
export function rollbackTemplateFidelitySnapshot(
  templateId: number,
  snapshotId: number,
): Promise<unknown> {
  return requestTyped({
    url: `/templates/${templateId}/fidelity-snapshots/${snapshotId}/rollback`,
    method: 'post',
  })
}
