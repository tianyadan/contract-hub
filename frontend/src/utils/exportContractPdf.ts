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

/** 计算 Blob 的 SHA256 十六进制（兼容 HTTP 部署：无 crypto.subtle 时走纯 JS） */
export async function sha256Blob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const subtle = globalThis.crypto?.subtle
  if (subtle?.digest) {
    const digest = await subtle.digest('SHA-256', buffer)
    return bytesToHex(new Uint8Array(digest))
  }
  return sha256Fallback(new Uint8Array(buffer))
}

/** 字节数组转十六进制 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 纯 JS SHA-256（仅作 Web Crypto 不可用时的回退，如 http://服务器IP 部署）。
 * 算法实现与 RFC 6234 一致，供 PDF 完整性校验。
 */
function sha256Fallback(data: Uint8Array): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ])

  const bitLen = data.length * 8
  const withPadLen = ((data.length + 9 + 63) & ~63)
  const padded = new Uint8Array(withPadLen)
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  // 大端写入 64-bit 长度（高 32 位为 0，PDF 体积远小于 2^32 字节）
  view.setUint32(withPadLen - 4, bitLen >>> 0, false)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  const w = new Uint32Array(64)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

  for (let i = 0; i < withPadLen; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false)
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3)
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10)
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7

    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[j] + w[j]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, h0, false)
  outView.setUint32(4, h1, false)
  outView.setUint32(8, h2, false)
  outView.setUint32(12, h3, false)
  outView.setUint32(16, h4, false)
  outView.setUint32(20, h5, false)
  outView.setUint32(24, h6, false)
  outView.setUint32(28, h7, false)
  return bytesToHex(out)
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
