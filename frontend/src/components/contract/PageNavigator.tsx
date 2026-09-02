import { Button, Space, Typography } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'

/** 翻页条属性 */
interface PageNavigatorProps {
  /** 当前页（从 0 开始） */
  current: number
  /** 总页数 */
  total: number
  /** 翻页回调 */
  onChange: (pageIndex: number) => void
  /** 禁用（如分页计算中） */
  disabled?: boolean
}

/**
 * 纸面下方翻页条：左右箭头 + 页码。
 * 放在 .doc-page 外，避免进入 PNG 截图。
 */
export default function PageNavigator({
  current,
  total,
  onChange,
  disabled = false,
}: PageNavigatorProps) {
  const safeTotal = Math.max(1, total)
  const safeCurrent = Math.min(Math.max(0, current), safeTotal - 1)

  return (
    <div className="doc-editor__page-nav" role="navigation" aria-label="文档翻页">
      <Space size="middle" align="center">
        <Button
          type="text"
          size="large"
          icon={<LeftOutlined />}
          disabled={disabled || safeCurrent <= 0}
          aria-label="上一页"
          onClick={() => onChange(safeCurrent - 1)}
        />
        <Typography.Text className="doc-editor__page-nav-text">
          {safeCurrent + 1} / {safeTotal}
        </Typography.Text>
        <Button
          type="text"
          size="large"
          icon={<RightOutlined />}
          disabled={disabled || safeCurrent >= safeTotal - 1}
          aria-label="下一页"
          onClick={() => onChange(safeCurrent + 1)}
        />
      </Space>
    </div>
  )
}
