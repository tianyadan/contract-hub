import type { CSSProperties } from 'react'
import type { WatermarkSetting } from '../api/settingsApi'
import { DEFAULT_WATERMARK_SETTING } from '../api/settingsApi'

/** 水印视觉样式（编辑页 / 预览共用） */
export interface WatermarkVisualStyle {
  density: number
  fontSize: number
  rotate: number
  opacity: number
}

/** 从设置对象取出视觉样式，缺省回填默认值 */
export function pickWatermarkVisualStyle(
  setting?: Partial<WatermarkSetting> | null,
): WatermarkVisualStyle {
  return {
    density: setting?.density ?? DEFAULT_WATERMARK_SETTING.density,
    fontSize: setting?.font_size ?? DEFAULT_WATERMARK_SETTING.font_size,
    rotate: setting?.rotate ?? DEFAULT_WATERMARK_SETTING.rotate,
    opacity: setting?.opacity ?? DEFAULT_WATERMARK_SETTING.opacity,
  }
}

/**
 * 根据密度计算平铺网格：列数、行数、间距。
 * 密度越高，格子越多、间距越小。
 */
export function watermarkGridFromDensity(density: number): {
  cols: number
  rows: number
  gapX: number
  gapY: number
  tileCount: number
} {
  const d = Math.min(10, Math.max(1, Math.round(density)))
  const cols = d + 2 // 3~12
  const rows = d + 4 // 5~14
  const gapX = Math.max(12, 72 - d * 5)
  const gapY = Math.max(16, 80 - d * 5)
  return { cols, rows, gapX, gapY, tileCount: cols * rows }
}

/** 生成水印内层容器样式 */
export function buildWatermarkInnerStyle(style: WatermarkVisualStyle): CSSProperties {
  const { cols, gapX, gapY } = watermarkGridFromDensity(style.density)
  return {
    position: 'absolute',
    left: '-30%',
    top: '-30%',
    width: '160%',
    height: '160%',
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: `${gapY}px ${gapX}px`,
    transform: `rotate(${style.rotate}deg)`,
    padding: 24,
    pointerEvents: 'none',
    userSelect: 'none',
  }
}

/** 生成单块水印文字样式 */
export function buildWatermarkTileStyle(style: WatermarkVisualStyle): CSSProperties {
  const alpha = Math.min(0.4, Math.max(0.05, style.opacity / 100))
  return {
    fontSize: style.fontSize,
    fontWeight: 700,
    color: `rgba(0, 0, 0, ${alpha})`,
    whiteSpace: 'nowrap',
    letterSpacing: '0.08em',
    textAlign: 'center',
  }
}
