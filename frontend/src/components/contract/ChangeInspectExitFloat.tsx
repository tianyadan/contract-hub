import { Button, Typography } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import './change-inspect-exit-float.css'

interface ChangeInspectExitFloatProps {
  /** 是否处于查看变更/历史版本态 */
  visible: boolean
  /** 当前是否可进入编辑（权限 + 未锁定） */
  canEdit: boolean
  /** 是否正在看历史版本正文 */
  viewingHistory?: boolean
  /** 历史版本号（展示提示用） */
  versionNo?: number
  /** 退出查看，回到可编辑/当前正文（保持页码） */
  onExit: () => void
}

/**
 * 变更定位 / 历史版本查看时的固定悬浮出口。
 * 避免顶部 Alert 随文档滚动后找不到「返回编辑」。
 */
export default function ChangeInspectExitFloat({
  visible,
  canEdit,
  viewingHistory = false,
  versionNo,
  onExit,
}: ChangeInspectExitFloatProps) {
  if (!visible) return null

  const title = canEdit ? '返回编辑' : '退出查看'
  const hint = viewingHistory
    ? `正在查看历史版本${versionNo != null ? ` V${versionNo}` : ''}（只读）`
    : '正在查看变更详情'

  return (
    <div className="change-inspect-exit-float" role="status">
      <div className="change-inspect-exit-float__card">
        <div className="change-inspect-exit-float__text">
          <Typography.Text strong className="change-inspect-exit-float__title">
            {hint}
          </Typography.Text>
          <Typography.Text type="secondary" className="change-inspect-exit-float__desc">
            {canEdit
              ? '点击后留在当前页，即可继续编辑'
              : '点击后返回当前合同正文（保持当前页）'}
          </Typography.Text>
        </div>
        <Button type="primary" icon={<EditOutlined />} onClick={onExit}>
          {title}
        </Button>
      </div>
    </div>
  )
}
