import { ColorPicker, Divider, Popover, Select, Tooltip } from 'antd'
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  BgColorsOutlined,
  BoldOutlined,
  ClearOutlined,
  HighlightOutlined,
  ItalicOutlined,
  MoreOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
  FontColorsOutlined,
} from '@ant-design/icons'
import type { BlockStyle } from '../../types/contract'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { DOC_HIGHLIGHT_COLORS, highlightHexToName, highlightNameToHex } from '../../utils/contract'
import './format-toolbar.css'

/** 格式工具栏属性 */
interface FormatToolbarProps {
  /** 当前选中块的样式 */
  style: BlockStyle | undefined
  /** 样式变更回调（合并到当前块样式） */
  onChange: (patch: Partial<BlockStyle>) => void
  /** 只读（历史版本 / 外部只读）时禁用 */
  disabled?: boolean
}

/** 可选字体 */
const FONT_OPTIONS = [
  { label: '宋体', value: '宋体', kind: 'cjk' },
  { label: '黑体', value: '黑体', kind: 'cjk' },
  { label: '楷体', value: '楷体', kind: 'cjk' },
  { label: '仿宋', value: '仿宋', kind: 'cjk' },
  { label: '微软雅黑', value: '微软雅黑', kind: 'cjk' },
  { label: 'Times New Roman', value: 'Times New Roman', kind: 'latin' },
  { label: 'Arial', value: 'Arial', kind: 'latin' },
  { label: 'Calibri', value: 'Calibri', kind: 'latin' },
]

/** 可选字号（pt） */
const FONT_SIZE_OPTIONS = [9, 10.5, 12, 14, 16, 18, 22, 28].map((v) => ({
  label: `${v} pt`,
  value: v,
}))

/** 可选行距 */
const LINE_SPACING_OPTIONS = [
  { label: '单倍行距', value: 1 },
  { label: '1.5 倍行距', value: 1.5 },
  { label: '2 倍行距', value: 2 },
]

/** 字体颜色预设 */
const FONT_COLOR_PRESETS = [
  '#000000',
  '#595959',
  '#8C8C8C',
  '#FFFFFF',
  '#C00000',
  '#FF0000',
  '#FF7A00',
  '#FFC000',
  '#00B050',
  '#00B0F0',
  '#0070C0',
  '#0000FF',
  '#7030A0',
  '#E36C0A',
]

/** 底纹预设 */
const SHADING_PRESETS = [
  '#FFFFFF',
  '#F2F2F2',
  '#E7F3FF',
  '#FFF2CC',
  '#E2EFDA',
  '#FCE4EC',
  '#FFEBEE',
  '#DEEBF7',
]

/** 色板点击项 */
interface PaletteColor {
  hex: string
  name?: string
}

/** 内联色板：点击色块立即应用 */
function ColorPalette({
  colors,
  value,
  onPick,
  onClear,
  renderCustom,
}: {
  colors: PaletteColor[]
  value?: string
  onPick: (color: PaletteColor) => void
  onClear?: () => void
  renderCustom?: React.ReactNode
}) {
  return (
    <div className="format-toolbar__palette">
      <div className="format-toolbar__palette-grid">
        {colors.map((c) => (
          <button
            key={c.hex}
            type="button"
            className={`format-toolbar__dot${value === c.hex ? ' is-active' : ''}`}
            style={{ background: c.hex }}
            title={c.name || c.hex}
            onClick={() => onPick(c)}
          />
        ))}
        {renderCustom}
      </div>
      {onClear && (
        <button type="button" className="format-toolbar__palette-clear" onClick={onClear}>
          <ClearOutlined /> 清除
        </button>
      )}
    </div>
  )
}

/**
 * 文档格式工具栏（Word 风格）。
 * 支持字体、字号、加粗/斜体/下划线/删除线、字体颜色、高亮、文字阴影、
 * 段落底纹、对齐方式、行距，作用于当前选中的段落块。
 */
export default function FormatToolbar({ style, onChange, disabled = false }: FormatToolbarProps) {
  const isMobile = useIsMobile()
  /** 工具栏操作按钮（禁用时统一灰置） */
  const btnProps = { disabled, size: 'small' as const }

  /** 切换布尔样式（仅当有效值为 true 时视为开启，便于一次点击取消） */
  const toggle = (key: keyof BlockStyle) => {
    onChange({ [key]: !(style?.[key] === true) } as Partial<BlockStyle>)
  }

  /** 字体 / 字号 / 行距（手机收纳到「更多」） */
  const typographyControls = (
    <>
      <Select
        size="small"
        placeholder="字体"
        disabled={disabled}
        value={
          style?.east_asia_font || style?.font_name
            ? style.east_asia_font || style.font_name
            : undefined
        }
        options={FONT_OPTIONS}
        onChange={(value) => {
          const opt = FONT_OPTIONS.find((f) => f.value === value)
          onChange(opt?.kind === 'cjk' ? { east_asia_font: value } : { font_name: value })
        }}
        style={{ width: isMobile ? '100%' : 118 }}
      />
      <Select
        size="small"
        placeholder="字号"
        disabled={disabled}
        value={style?.font_size ?? undefined}
        options={FONT_SIZE_OPTIONS}
        onChange={(value) => onChange({ font_size: value })}
        style={{ width: isMobile ? '100%' : 88 }}
      />
      <Select
        size="small"
        placeholder="行距"
        disabled={disabled}
        value={style?.line_spacing_rule === 'multiple' ? style.line_spacing : undefined}
        options={LINE_SPACING_OPTIONS}
        onChange={(value) => onChange({ line_spacing: value, line_spacing_rule: 'multiple' })}
        style={{ width: isMobile ? '100%' : 110 }}
      />
    </>
  )

  /** 字体颜色 Popover 内容 */
  const fontColorPopover = (
    <ColorPalette
      colors={FONT_COLOR_PRESETS.map((hex) => ({ hex }))}
      value={style?.color ? `#${style.color}` : undefined}
      onPick={(c) => onChange({ color: c.hex.replace('#', '') })}
      onClear={() => onChange({ color: undefined })}
      renderCustom={
        <span className="format-toolbar__palette-custom">
          <ColorPicker
            size="small"
            value={style?.color ? `#${style.color}` : '#000000'}
            onChange={(color) => onChange({ color: color.toHexString().replace('#', '') })}
          />
        </span>
      }
    />
  )

  /** 高亮 Popover 内容 */
  const highlightPopover = (
    <ColorPalette
      colors={DOC_HIGHLIGHT_COLORS.map((h) => ({ hex: h.hex, name: h.name }))}
      value={highlightNameToHex(style?.highlight)}
      onPick={(c) => onChange({ highlight: highlightHexToName(c.hex) })}
      onClear={() => onChange({ highlight: undefined })}
    />
  )

  /** 底纹 Popover 内容 */
  const shadingPopover = (
    <ColorPalette
      colors={SHADING_PRESETS.map((hex) => ({ hex }))}
      value={style?.shading ? `#${style.shading}` : undefined}
      onPick={(c) => onChange({ shading: c.hex.replace('#', '') })}
      onClear={() => onChange({ shading: undefined })}
      renderCustom={
        <span className="format-toolbar__palette-custom">
          <ColorPicker
            size="small"
            value={style?.shading ? `#${style.shading}` : '#FFFFFF'}
            onChange={(color) => onChange({ shading: color.toHexString().replace('#', '') })}
          />
        </span>
      }
    />
  )

  return (
    <div className={`format-toolbar${isMobile ? ' format-toolbar--mobile' : ''}`}>
      {/* 桌面：字体/字号外露；手机：收纳到更多 */}
      {!isMobile ? (
        <>
          {typographyControls}
          <Divider type="vertical" />
        </>
      ) : (
        <Popover
          content={<div className="format-toolbar__more-panel">{typographyControls}</div>}
          trigger="click"
          placement="bottomLeft"
        >
          <button type="button" className="format-toolbar__btn" disabled={disabled} aria-label="更多格式">
            <MoreOutlined />
          </button>
        </Popover>
      )}

      {/* 加粗 / 斜体 / 下划线 / 删除线 */}
      <Tooltip title="加粗">
        <button
          type="button"
          className={`format-toolbar__btn${style?.bold ? ' is-active' : ''}`}
          {...btnProps}
          onClick={() => toggle('bold')}
        >
          <BoldOutlined />
        </button>
      </Tooltip>
      <Tooltip title="斜体">
        <button
          type="button"
          className={`format-toolbar__btn${style?.italic ? ' is-active' : ''}`}
          {...btnProps}
          onClick={() => toggle('italic')}
        >
          <ItalicOutlined />
        </button>
      </Tooltip>
      <Tooltip title="下划线">
        <button
          type="button"
          className={`format-toolbar__btn${style?.underline ? ' is-active' : ''}`}
          {...btnProps}
          onClick={() => toggle('underline')}
        >
          <UnderlineOutlined />
        </button>
      </Tooltip>
      <Tooltip title="删除线">
        <button
          type="button"
          className={`format-toolbar__btn${style?.strike ? ' is-active' : ''}`}
          {...btnProps}
          onClick={() => toggle('strike')}
        >
          <StrikethroughOutlined />
        </button>
      </Tooltip>

      <Divider type="vertical" />

      {/* 字体颜色 */}
      <Popover content={fontColorPopover} trigger="click" placement="bottom">
        <Tooltip title="字体颜色">
          <span className="format-toolbar__color-trigger">
            <FontColorsOutlined style={{ color: style?.color ? `#${style.color}` : '#000000' }} />
          </span>
        </Tooltip>
      </Popover>

      {/* 文本高亮 */}
      <Popover content={highlightPopover} trigger="click" placement="bottom">
        <Tooltip title="文本高亮">
          <span
            className="format-toolbar__color-trigger"
            style={{ background: highlightNameToHex(style?.highlight) }}
          >
            <HighlightOutlined />
          </span>
        </Tooltip>
      </Popover>

      {/* 段落底纹 */}
      <Popover content={shadingPopover} trigger="click" placement="bottom">
        <Tooltip title="段落底纹">
          <span
            className="format-toolbar__color-trigger"
            style={{ background: style?.shading ? `#${style.shading}` : undefined }}
          >
            <BgColorsOutlined />
          </span>
        </Tooltip>
      </Popover>

      {/* 文字阴影 */}
      {!isMobile ? (
        <Tooltip title="文字阴影">
          <button
            type="button"
            className={`format-toolbar__btn${style?.shadow ? ' is-active' : ''}`}
            {...btnProps}
            onClick={() => toggle('shadow')}
          >
            <span className="format-toolbar__text-icon">影</span>
          </button>
        </Tooltip>
      ) : null}

      <Divider type="vertical" />

      {/* 对齐方式 */}
      <Tooltip title="左对齐">
        <button
          type="button"
          className={`format-toolbar__btn${style?.alignment === 'left' || !style?.alignment ? ' is-active' : ''}`}
          {...btnProps}
          onClick={() => onChange({ alignment: 'left' })}
        >
          <AlignLeftOutlined />
        </button>
      </Tooltip>
      <Tooltip title="居中">
        <button
          type="button"
          className={`format-toolbar__btn${style?.alignment === 'center' ? ' is-active' : ''}`}
          {...btnProps}
          onClick={() => onChange({ alignment: 'center' })}
        >
          <AlignCenterOutlined />
        </button>
      </Tooltip>
      <Tooltip title="右对齐">
        <button
          type="button"
          className={`format-toolbar__btn${style?.alignment === 'right' ? ' is-active' : ''}`}
          {...btnProps}
          onClick={() => onChange({ alignment: 'right' })}
        >
          <AlignRightOutlined />
        </button>
      </Tooltip>
      <Tooltip title="两端对齐">
        <button
          type="button"
          className={`format-toolbar__btn${style?.alignment === 'justify' ? ' is-active' : ''}`}
          {...btnProps}
          onClick={() => onChange({ alignment: 'justify' })}
        >
          <AlignLeftOutlined className="format-toolbar__justify" />
        </button>
      </Tooltip>
    </div>
  )
}
