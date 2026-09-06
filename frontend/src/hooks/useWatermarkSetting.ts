import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_WATERMARK_SETTING,
  getWatermarkSetting,
  type WatermarkSetting,
} from '../api/settingsApi'
import { pickWatermarkVisualStyle, type WatermarkVisualStyle } from '../utils/watermarkStyle'

/**
 * 加载当前登录用户的导出水印设置。
 * 用于合同编辑页展示与导出叠加。
 */
export function useWatermarkSetting() {
  const [setting, setSetting] = useState<WatermarkSetting>(DEFAULT_WATERMARK_SETTING)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getWatermarkSetting()
      setSetting({ ...DEFAULT_WATERMARK_SETTING, ...data })
    } catch {
      setSetting(DEFAULT_WATERMARK_SETTING)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /** 是否应展示/导出自定义水印 */
  const activeText =
    setting.enabled && setting.content.trim() ? setting.content.trim() : null

  /** 启用时的视觉样式 */
  const activeStyle: WatermarkVisualStyle | null = useMemo(() => {
    if (!activeText) return null
    return pickWatermarkVisualStyle(setting)
  }, [activeText, setting])

  return { setting, activeText, activeStyle, loading, reload }
}
