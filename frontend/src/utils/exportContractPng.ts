import { toPng } from 'html-to-image'
import JSZip from 'jszip'

export interface ExportPngOptions {
  /** 像素密度，默认 2 */
  pixelRatio?: number
  /** 是否为草稿（叠加水印） */
  draft?: boolean
}

/** 收集可导出的页面节点：优先离屏全页宿主，其次可见 .doc-page */
export function collectExportPageElements(root: HTMLElement): HTMLElement[] {
  const exportHost = root.querySelector('.doc-editor__export-host')
  if (exportHost) {
    const pages = Array.from(exportHost.querySelectorAll<HTMLElement>('.doc-page'))
    if (pages.length > 0) return pages
  }
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.doc-page'))
  if (pages.length > 0) {
    // 排除测量区，只取可见/导出页
    return pages.filter((el) => !el.closest('.doc-editor__measure'))
  }
  const unified = root.querySelector<HTMLElement>('.doc-editor__unified')
  if (unified) return [unified]
  const editor = root.querySelector<HTMLElement>('.doc-editor')
  return editor ? [editor] : []
}

/** 在导出目标上临时叠加水印 */
function withDraftWatermark(pages: HTMLElement[], draft: boolean): () => void {
  if (!draft) return () => undefined
  const marks: HTMLElement[] = []
  pages.forEach((page) => {
    const mark = document.createElement('div')
    mark.className = 'contract-export-watermark'
    mark.textContent = '草稿'
    page.appendChild(mark)
    marks.push(mark)
  })
  return () => marks.forEach((mark) => mark.remove())
}

/** 将页面节点列表渲染为 PNG Blob */
export async function exportPagesAsPng(
  pageElements: HTMLElement[],
  options: ExportPngOptions = {},
): Promise<Blob[]> {
  const pixelRatio = options.pixelRatio ?? 2
  const cleanup = withDraftWatermark(pageElements, Boolean(options.draft))
  const blobs: Blob[] = []
  try {
    for (const el of pageElements) {
      const dataUrl = await toPng(el, {
        cacheBust: true,
        pixelRatio,
        backgroundColor: '#ffffff',
      })
      blobs.push(await (await fetch(dataUrl)).blob())
    }
  } finally {
    cleanup()
  }
  return blobs
}

/** 触发浏览器下载单个 Blob */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

/** 将多页 PNG 打包为 ZIP 并下载 */
export async function downloadPngZip(blobs: Blob[], baseName: string): Promise<void> {
  if (blobs.length === 1) {
    downloadBlob(blobs[0], `${baseName}-001.png`)
    return
  }
  const zip = new JSZip()
  blobs.forEach((blob, index) => {
    zip.file(`${baseName}-${String(index + 1).padStart(3, '0')}.png`, blob)
  })
  const content = await zip.generateAsync({ type: 'blob' })
  downloadBlob(content, `${baseName}-终稿.zip`)
}

/**
 * 从编辑器准备好的页节点导出并下载。
 * 优先使用 preparePagesForExport 返回的全量页，避免只截当前可见页。
 */
export async function exportContractPngFromPages(
  pages: HTMLElement[],
  baseName: string,
  options: ExportPngOptions = {},
): Promise<{ blobs: Blob[]; pageCount: number }> {
  if (pages.length === 0) throw new Error('文档为空，无法导出')
  const blobs = await exportPagesAsPng(pages, options)
  await downloadPngZip(blobs, baseName)
  return { blobs, pageCount: blobs.length }
}

/** 从编辑区根节点导出并下载 PNG / ZIP（兼容旧调用） */
export async function exportContractPngFromRoot(
  root: HTMLElement | null,
  baseName: string,
  options: ExportPngOptions = {},
): Promise<number> {
  if (!root) throw new Error('未找到可导出的文档区域')
  const pages = collectExportPageElements(root)
  if (pages.length === 0) throw new Error('文档为空，无法导出')
  const { pageCount } = await exportContractPngFromPages(pages, baseName, options)
  return pageCount
}
