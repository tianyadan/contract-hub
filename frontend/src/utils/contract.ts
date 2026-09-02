/**
 * 合同状态配置工具。
 * 状态码与后端保持一致：0已导入 1已分享 2协作中 3已确认 4已完成 5已取消。
 */

/** 单个状态的展示配置 */
export interface ContractStatusConfig {
  /** 状态中文名 */
  label: string
  /** 主色（卡片、标签使用） */
  color: string
  /** 浅色背景（卡片底色使用） */
  softColor: string
}

/** 状态码 -> 展示配置 */
export const CONTRACT_STATUS_CONFIG: Record<number, ContractStatusConfig> = {
  0: { label: '已导入', color: '#1677ff', softColor: 'rgba(22,119,255,0.10)' },
  1: { label: '已分享', color: '#722ed1', softColor: 'rgba(114,46,209,0.10)' },
  2: { label: '协作中', color: '#13c2c2', softColor: 'rgba(19,194,194,0.10)' },
  3: { label: '已确认', color: '#fa8c16', softColor: 'rgba(250,140,22,0.10)' },
  4: { label: '已完成', color: '#52c41a', softColor: 'rgba(82,196,26,0.10)' },
  5: { label: '已取消', color: '#8c8c8c', softColor: 'rgba(140,140,140,0.10)' },
}

/** 首页统计卡片展示顺序 */
export const CONTRACT_STATUS_ORDER = [0, 1, 2, 3, 4, 5]

/** 未知状态兜底 */
export const UNKNOWN_STATUS_CONFIG: ContractStatusConfig = {
  label: '未知',
  color: '#8c8c8c',
  softColor: 'rgba(140,140,140,0.10)',
}

/**
 * 获取状态展示配置，未知状态返回兜底配置。
 * @param status 状态码
 * @returns 展示配置
 */
export function getStatusConfig(status: number): ContractStatusConfig {
  return CONTRACT_STATUS_CONFIG[status] ?? UNKNOWN_STATUS_CONFIG
}

/** Word 文本高亮色（w:highlight 名称 -> 颜色） */
export const DOC_HIGHLIGHT_COLORS: { name: string; hex: string }[] = [
  { name: 'yellow', hex: '#FFFF00' },
  { name: 'green', hex: '#00FF00' },
  { name: 'cyan', hex: '#00FFFF' },
  { name: 'magenta', hex: '#FF00FF' },
  { name: 'blue', hex: '#0000FF' },
  { name: 'red', hex: '#FF0000' },
  { name: 'darkYellow', hex: '#808000' },
  { name: 'darkCyan', hex: '#008080' },
  { name: 'darkGreen', hex: '#008000' },
  { name: 'darkMagenta', hex: '#800080' },
  { name: 'darkRed', hex: '#800000' },
  { name: 'darkBlue', hex: '#000080' },
  { name: 'darkGray', hex: '#808080' },
  { name: 'lightGray', hex: '#C0C0C0' },
  { name: 'black', hex: '#000000' },
]

/**
 * 高亮名 -> 展示颜色。
 * @param name Word 高亮名
 * @returns 颜色 hex（找不到时返回白色）
 */
export function highlightNameToHex(name?: string): string {
  return DOC_HIGHLIGHT_COLORS.find((h) => h.name === name)?.hex ?? '#FFFFFF'
}

/**
 * 颜色 -> 最接近的 Word 高亮名。
 * @param hex 颜色 hex
 * @returns Word 高亮名（找不到时默认 yellow）
 */
export function highlightHexToName(hex: string): string {
  return (
    DOC_HIGHLIGHT_COLORS.find((h) => h.hex.toUpperCase() === hex.toUpperCase())?.name ??
    'yellow'
  )
}
