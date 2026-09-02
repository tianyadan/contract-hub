import type { ReactNode } from 'react'

/** 品牌能力条目属性 */
interface FeatureItemProps {
  /** 能力图标（SVG 组件） */
  icon: ReactNode
  /** 能力名称，如“安全可靠” */
  title: string
  /** 能力说明，如“数据加密守护” */
  description: string
}

/**
 * 能力介绍条目：图标 + 标题 + 说明。
 * 左侧品牌面板使用，可在其他品牌展示场景复用。
 */
export default function FeatureItem({ icon, title, description }: FeatureItemProps) {
  return (
    <div className="feature-item">
      {/* 图标容器：白色圆底 */}
      <div className="feature-item__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="feature-item__text">
        <div className="feature-item__title">{title}</div>
        <div className="feature-item__desc">{description}</div>
      </div>
    </div>
  )
}
