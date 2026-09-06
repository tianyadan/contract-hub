import { memo, useMemo } from 'react'
import {
  buildWatermarkInnerStyle,
  buildWatermarkTileStyle,
  pickWatermarkVisualStyle,
  watermarkGridFromDensity,
  type WatermarkVisualStyle,
} from '../../utils/watermarkStyle'

interface DocumentWatermarkProps {
  /** 水印文案；为空则不渲染 */
  text: string
  /** 视觉参数；缺省用默认值 */
  style?: Partial<WatermarkVisualStyle> | null
}

/**
 * 全页平铺斜向防伪水印层。
 * pointer-events: none，不阻挡编辑操作；样式由设置页滑动条控制。
 */
function DocumentWatermark({ text, style }: DocumentWatermarkProps) {
  const visual = useMemo(
    () =>
      pickWatermarkVisualStyle({
        density: style?.density,
        font_size: style?.fontSize,
        rotate: style?.rotate,
        opacity: style?.opacity,
      }),
    [style?.density, style?.fontSize, style?.rotate, style?.opacity],
  )

  const tiles = useMemo(() => {
    const { tileCount } = watermarkGridFromDensity(visual.density)
    const tileStyle = buildWatermarkTileStyle(visual)
    return Array.from({ length: tileCount }, (_, i) => (
      <span key={i} className="doc-page__security-watermark-tile" style={tileStyle}>
        {text}
      </span>
    ))
  }, [text, visual])

  return (
    <div className="doc-page__security-watermark" aria-hidden data-watermark={text}>
      <div className="doc-page__security-watermark-inner" style={buildWatermarkInnerStyle(visual)}>
        {tiles}
      </div>
    </div>
  )
}

export default memo(DocumentWatermark)
