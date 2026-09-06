import type { RefObject } from 'react'
import type { DocumentEditorHandle } from '../components/contract/DocumentEditor'
import type { DocumentContent } from '../types/contract'
import { collectExportPageElements, exportPagesAsPng } from './exportContractPng'
import { exportPagesAsPdf, PDF_EXPORT_PIXEL_RATIO, sha256Blob } from './exportContractPdf'

export interface GenerateFidelityPreviewInput {
  editorRef: RefObject<DocumentEditorHandle | null>
  documentContent: DocumentContent | null
}

export interface GenerateFidelityPreviewResult {
  pdfBlob: Blob
  hash: string
  pageCount: number
}

/**
 * 按导出管线生成高保真阅览 PDF（无二维码、无「草稿」字样）。
 */
export async function generateFidelityPreviewPdf(
  input: GenerateFidelityPreviewInput,
): Promise<GenerateFidelityPreviewResult> {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }
  const pages =
    (await input.editorRef.current?.preparePagesForExport()) ??
    collectExportPageElements(input.editorRef.current?.getExportRoot() ?? document.body)
  if (pages.length === 0) {
    throw new Error('文档为空，无法生成高保真阅览')
  }
  const pngBlobs = await exportPagesAsPng(pages, {
    pixelRatio: PDF_EXPORT_PIXEL_RATIO,
  })
  const pdfBlob = await exportPagesAsPdf(pngBlobs)
  const hash = await sha256Blob(pdfBlob)
  return { pdfBlob, hash, pageCount: pngBlobs.length }
}
