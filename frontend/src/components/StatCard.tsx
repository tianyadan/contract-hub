import type { CSSProperties, ReactNode } from 'react'
import './stat-card.css'

/** 统计卡片属性 */
interface StatCardProps {
  /** 卡片标题，如“已导入” */
  title: string
  /** 数量 */
  value: number
  /** 主题色（图标与文字用） */
  color: string
  /** 浅色背景 */
  softColor: string
  /** 图标（SVG 组件） */
  icon: ReactNode
  /** 是否为品牌渐变主卡片（合同总数） */
  featured?: boolean
  /** 点击回调（如跳转筛选列表） */
  onClick?: () => void
}

/**
 * 统计卡片：图标 + 数量 + 标题。
 * 首页各状态合同数量使用，可复用到其他统计场景。
 */
export default function StatCard({
  title,
  value,
  color,
  softColor,
  icon,
  featured = false,
  onClick,
}: StatCardProps) {
  // 品牌渐变卡片的样式
  const featuredStyle: CSSProperties = featured
    ? {
        background: 'linear-gradient(135deg, #14c98f 0%, #00b96b 60%, #00915a 100%)',
        color: '#ffffff',
      }
    : { background: '#ffffff' }

  // 普通卡片内图标底色
  const iconStyle: CSSProperties = featured
    ? { background: 'rgba(255,255,255,0.22)', color: '#ffffff' }
    : { background: softColor, color }

  // 普通卡片内数量文字颜色
  const valueStyle: CSSProperties = featured
    ? { color: '#ffffff' }
    : { color }

  return (
    <div
      className={`stat-card${onClick ? ' stat-card--clickable' : ''}`}
      style={featuredStyle}
      onClick={onClick}
    >
      <div className="stat-card__icon" style={iconStyle} aria-hidden="true">
        {icon}
      </div>
      <div className="stat-card__body">
        <div className="stat-card__value" style={valueStyle}>
          {value}
        </div>
        <div className="stat-card__title">{title}</div>
      </div>
    </div>
  )
}
