import { requestTyped } from './request'

/** 用户导出水印设置（含视觉参数） */
export interface WatermarkSetting {
  enabled: boolean
  content: string
  /** 密度 1-10 */
  density: number
  /** 字号 px 12-48 */
  font_size: number
  /** 倾斜角度 -60~0 */
  rotate: number
  /** 透明度百分比 5-40 */
  opacity: number
}

/** 用户电子章资产 */
export interface SealAsset {
  id: number
  name: string
  file_url: string
  mime_type: string
  file_size: number
  width_px: number
  height_px: number
  is_default: boolean
  create_time: string
}

/** 水印视觉样式默认值 */
export const DEFAULT_WATERMARK_SETTING: WatermarkSetting = {
  enabled: false,
  content: '',
  density: 5,
  font_size: 22,
  rotate: -28,
  opacity: 18,
}

/** 获取当前用户导出水印设置 */
export function getWatermarkSetting(): Promise<WatermarkSetting> {
  return requestTyped<WatermarkSetting>({ url: '/settings/watermark', method: 'get' })
}

/** 保存当前用户导出水印设置 */
export function saveWatermarkSetting(data: WatermarkSetting): Promise<WatermarkSetting> {
  return requestTyped<WatermarkSetting>({
    url: '/settings/watermark',
    method: 'put',
    data,
  })
}

/** 列出当前用户电子章库 */
export function listSealAssets(): Promise<SealAsset[]> {
  return requestTyped<SealAsset[]>({ url: '/settings/seals', method: 'get' }).then(
    (list) => list ?? [],
  )
}

/** 上传电子章 */
export function uploadSealAsset(file: File, name?: string, isDefault?: boolean): Promise<SealAsset> {
  const form = new FormData()
  form.append('file', file)
  if (name) form.append('name', name)
  if (isDefault) form.append('is_default', '1')
  return requestTyped<SealAsset>({
    url: '/settings/seals',
    method: 'post',
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/** 更新电子章元数据 */
export function updateSealAsset(
  id: number,
  data: { name?: string; is_default?: boolean },
): Promise<SealAsset> {
  return requestTyped<SealAsset>({
    url: `/settings/seals/${id}`,
    method: 'put',
    data,
  })
}

/** 删除电子章 */
export function deleteSealAsset(id: number): Promise<void> {
  return requestTyped<void>({
    url: `/settings/seals/${id}`,
    method: 'delete',
  })
}
