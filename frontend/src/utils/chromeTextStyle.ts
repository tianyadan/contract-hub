import type { CSSProperties } from 'react'
import type { BlockStyle } from '../types/contract'
import { highlightNameToHex } from './contract'

/**
 * 将页眉/页脚 BlockStyle 转为纸面渲染用 CSS。
 * 兼容旧数据（无 style 字段）。
 */
export function chromeTextStyle(style?: BlockStyle | null): CSSProperties {
  if (!style) return {}
  const css: CSSProperties = {}
  if (style.font_size != null) css.fontSize = `${style.font_size}pt`
  const font =
    style.east_asia_font || style.font_name
      ? [style.east_asia_font || style.font_name, 'SimSun', '宋体', 'sans-serif'].filter(Boolean).join(', ')
      : undefined
  if (font) css.fontFamily = font
  if (style.bold) css.fontWeight = 700
  if (style.italic) css.fontStyle = 'italic'
  const decorations: string[] = []
  if (style.underline) decorations.push('underline')
  if (style.strike) decorations.push('line-through')
  if (decorations.length) css.textDecoration = decorations.join(' ')
  if (style.color) css.color = style.color.startsWith('#') ? style.color : `#${style.color}`
  const highlight = highlightNameToHex(style.highlight)
  if (highlight) css.backgroundColor = highlight
  else if (style.shading) {
    css.backgroundColor = style.shading.startsWith('#') ? style.shading : `#${style.shading}`
  }
  if (style.shadow) css.textShadow = '1px 1px 2px rgba(0,0,0,0.25)'
  if (style.alignment === 'left' || style.alignment === 'right' || style.alignment === 'center' || style.alignment === 'justify') {
    css.textAlign = style.alignment
  }
  return css
}
