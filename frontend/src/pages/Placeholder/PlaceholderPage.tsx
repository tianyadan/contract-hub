import { Card, Result } from 'antd'
import { ToolOutlined } from '@ant-design/icons'

/** 占位页属性 */
interface PlaceholderPageProps {
  /** 页面标题（对应菜单名） */
  title: string
  /** 功能说明 */
  description: string
}

/**
 * 功能占位页。
 * 尚未开发的菜单模块统一使用，展示“建设中”提示。
 */
export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <Card>
      <Result
        icon={<ToolOutlined style={{ color: '#00b96b' }} />}
        title={`${title} · 功能建设中`}
        subTitle={`${description}，该模块将在后续版本上线，敬请期待。`}
      />
    </Card>
  )
}
