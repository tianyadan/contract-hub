import { Collapse, Typography } from 'antd'
import type { ReactNode } from 'react'
import './collapsible-scroll-section.css'

/** 可折叠 + 固定高度滚动的侧栏区块 */
interface CollapsibleScrollSectionProps {
  /** 折叠面板标题 */
  title: ReactNode
  /** 唯一 key（同一页多个面板时区分） */
  panelKey: string
  /** 列表总条数（展示在标题旁） */
  count?: number
  /** 默认是否展开 */
  defaultOpen?: boolean
  /** 可视区域最多展示的行数（超出滚动） */
  maxVisibleRows?: number
  /** 单行预估高度（px），用于计算 max-height */
  rowHeight?: number
  children: ReactNode
}

/**
 * 侧栏折叠区块：默认展开，内容区固定高度，超过 maxVisibleRows 行时内部滚动。
 */
export default function CollapsibleScrollSection({
  title,
  panelKey,
  count,
  defaultOpen = true,
  maxVisibleRows = 5,
  rowHeight = 72,
  children,
}: CollapsibleScrollSectionProps) {
  const label = (
    <span className="collapsible-scroll-section__label">
      {title}
      {count != null && count > 0 ? (
        <Typography.Text type="secondary" className="collapsible-scroll-section__count">
          （{count}）
        </Typography.Text>
      ) : null}
    </span>
  )

  return (
    <Collapse
      className="collapsible-scroll-section"
      defaultActiveKey={defaultOpen ? [panelKey] : []}
      items={[
        {
          key: panelKey,
          label,
          children: (
            <div
              className="collapsible-scroll-section__body"
              style={{ maxHeight: maxVisibleRows * rowHeight }}
            >
              {children}
            </div>
          ),
        },
      ]}
    />
  )
}
