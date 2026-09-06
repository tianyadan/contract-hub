import { getToken } from '../utils/token'

/**
 * 用户章库图片代理（仅本人 JWT，外部协作者不可见）。
 */
export function sealProxyImageUrl(assetId: number): string {
  const token = getToken() || ''
  return `/api/settings/seals/${assetId}/image?token=${encodeURIComponent(token)}`
}

/**
 * 合同级电子章图片代理（内部 JWT）。
 */
export function contractSealImageUrl(contractId: number, ossKey: string): string {
  const token = getToken() || ''
  return `/api/contracts/${contractId}/seals/image?key=${encodeURIComponent(ossKey)}&token=${encodeURIComponent(token)}`
}

/**
 * 合同级电子章图片代理（外部分享 token）。
 */
export function shareSealImageUrl(shareToken: string, ossKey: string): string {
  return `/api/share/${encodeURIComponent(shareToken)}/seals/image?key=${encodeURIComponent(ossKey)}`
}

/** 印章展示上下文：合同编辑页 / 分享页 */
export type SealDisplayContext =
  | { mode: 'contract'; contractId: number }
  | { mode: 'share'; shareToken: string }
  | null
  | undefined

/** 解析印章 <img> src：优先合同级 oss_key，兼容旧 asset_id / blob */
export function resolveSealDisplaySrc(
  seal: { oss_key?: string; asset_id?: number; image_url?: string },
  ctx?: SealDisplayContext,
): string {
  if (seal.oss_key) {
    if (ctx?.mode === 'share') {
      return shareSealImageUrl(ctx.shareToken, seal.oss_key)
    }
    if (ctx?.mode === 'contract') {
      return contractSealImageUrl(ctx.contractId, seal.oss_key)
    }
  }
  if (seal.asset_id && seal.asset_id > 0) {
    return sealProxyImageUrl(seal.asset_id)
  }
  return seal.image_url || ''
}
