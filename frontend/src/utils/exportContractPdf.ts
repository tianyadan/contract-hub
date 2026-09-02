import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { downloadBlob } from './exportContractPng'

/** PDF 归档目标体积上限（10MB） */
export const PDF_TARGET_MAX_BYTES = 10 * 1024 * 1024

/** PDF 导出截图像素密度（较 PNG 导出略低以控制体积） */
export const PDF_EXPORT_PIXEL_RATIO = 1.5

export interface ExportPdfOptions {
  /** 目标最大体积，默认 10MB */
  targetMaxBytes?: number
  /** 初始 JPEG 质量 0~1 */
  imageQuality?: number
}

/** 计算 Blob 的 SHA256 十六进制 */
export async function sha256Blob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 加载图片资源 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * 将图片 Blob 转为 JPEG Data URL，可按最大宽度等比缩放。
 */
async function blobToJpegDataUrl(
  blob: Blob,
  quality: number,
  maxWidth?: number,
): Promise<string> {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const img = await loadImage(objectUrl)
    let width = img.width
    let height = img.height
    if (maxWidth && width > maxWidth) {
      height = Math.round((height * maxWidth) / width)
      width = maxWidth
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * 在页面截图右下角叠加验真二维码（不修改可编辑 DOM）。
 */
export async function overlayQrWatermark(
  pngBlob: Blob,
  verifyCode: string,
  pageNo: number,
  publicOrigin: string,
): Promise<Blob> {
  const origin = publicOrigin.replace(/\/$/, '')
  const verifyUrl = `${origin}/verify/${verifyCode}?page=${pageNo}`
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 120 })

  const objectUrl = URL.createObjectURL(pngBlob)
  try {
    const pageImg = await loadImage(objectUrl)
    const canvas = document.createElement('canvas')
    canvas.width = pageImg.width
    canvas.height = pageImg.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')

    ctx.drawImage(pageImg, 0, 0)
    const qrImg = await loadImage(qrDataUrl)
    const qrSize = Math.round(Math.min(pageImg.width, pageImg.height) * 0.12)
    const margin = Math.round(qrSize * 0.35)
    const qrX = pageImg.width - qrSize - margin
    const qrY = pageImg.height - qrSize - margin - Math.round(qrSize * 0.35)

    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)
    ctx.fillStyle = '#595959'
    ctx.font = `${Math.max(12, Math.round(qrSize * 0.18))}px sans-serif`
    ctx.textAlign = 'right'
    ctx.fillText('扫码验真', pageImg.width - margin, pageImg.height - margin)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('二维码合成失败'))
            return
          }
          resolve(blob)
        },
        'image/jpeg',
        0.9,
      )
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** 按 JPEG 质量与可选缩放生成 PDF Blob */
async function buildPdfBlob(
  pageBlobs: Blob[],
  quality: number,
  maxWidth?: number,
): Promise<Blob> {
  const pdf = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
    compress: true,
  })
  for (let i = 0; i < pageBlobs.length; i++) {
    if (i > 0) pdf.addPage()
    const dataUrl = await blobToJpegDataUrl(pageBlobs[i], quality, maxWidth)
    pdf.addImage(dataUrl, 'JPEG', 0, 0, 210, 297, undefined, 'FAST')
  }
  return pdf.output('blob')
}

/**
 * 将多页图片合成为 A4 纵向 PDF，自动压缩至目标体积以内。
 */
export async function exportPagesAsPdf(
  pageBlobs: Blob[],
  options: ExportPdfOptions = {},
): Promise<Blob> {
  if (pageBlobs.length === 0) {
    throw new Error('文档为空，无法导出 PDF')
  }

  const targetMaxBytes = options.targetMaxBytes ?? PDF_TARGET_MAX_BYTES
  const qualitySteps = [options.imageQuality ?? 0.85, 0.78, 0.7, 0.62, 0.55]
  const widthSteps: Array<number | undefined> = [undefined, undefined, 1600, 1400, 1200]

  for (let i = 0; i < qualitySteps.length; i++) {
    const blob = await buildPdfBlob(pageBlobs, qualitySteps[i], widthSteps[i])
    if (blob.size <= targetMaxBytes) {
      return blob
    }
  }

  const lastBlob = await buildPdfBlob(pageBlobs, 0.5, 1100)
  if (lastBlob.size <= targetMaxBytes) {
    return lastBlob
  }

  const sizeMb = (lastBlob.size / (1024 * 1024)).toFixed(1)
  const limitMb = Math.round(targetMaxBytes / (1024 * 1024))
  throw new Error(
    `PDF 体积约 ${sizeMb}MB，超过 ${limitMb}MB 上限。请减少页数或精简内容后重试`,
  )
}

/** 触发浏览器下载 PDF */
export function downloadPdf(blob: Blob, fileName: string): void {
  downloadBlob(blob, fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`)
}
