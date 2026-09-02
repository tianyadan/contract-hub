import { Alert, Space, Tag } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import type { ConfirmProgress } from '../../types/contract'
import './confirm-status-banner.css'

interface ConfirmStatusBannerProps {
  progress: ConfirmProgress | null
  /** 当前视角：0 内部 1 外部 */
  viewerType: 0 | 1
  contractStatus: number
  currentVersionNo: number
  /** 当前用户是否已确认当前版本 */
  selfConfirmed: boolean
}

/**
 * 双方确认状态条：展示「我已确认」与「对方已确认」。
 */
export default function ConfirmStatusBanner({
  progress,
  viewerType,
  contractStatus,
  currentVersionNo,
  selfConfirmed,
}: ConfirmStatusBannerProps) {
  if (contractStatus === 3 || contractStatus === 4) {
    return (
      <Alert
        className="confirm-status-banner"
        type="success"
        showIcon
        message="双方已确认，合同已锁定"
      />
    )
  }

  if (!progress) return null

  const requiresDual = progress.requires_dual_confirm
  const otherConfirmed =
    viewerType === 0 ? progress.has_external_confirm : progress.has_internal_confirm
  const otherLabel = viewerType === 0 ? '外部协作者' : '内部用户（合同发起方）'

  if (!requiresDual) {
    return (
      <Alert
        className="confirm-status-banner"
        type={selfConfirmed ? 'success' : 'info'}
        showIcon
        message={
          selfConfirmed
            ? `您已确认当前版本（V${currentVersionNo}）`
            : `当前版本 V${currentVersionNo} 尚未确认`
        }
      />
    )
  }

  return (
    <div className="confirm-status-banner confirm-status-banner--dual">
      <Space size="middle" wrap>
        <Tag
          icon={selfConfirmed ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
          color={selfConfirmed ? 'success' : 'default'}
        >
          {selfConfirmed ? `您已确认（V${currentVersionNo}）` : `您尚未确认（V${currentVersionNo}）`}
        </Tag>
        <Tag
          icon={otherConfirmed ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
          color={otherConfirmed ? 'success' : 'warning'}
        >
          {otherConfirmed ? `${otherLabel}已确认` : `等待${otherLabel}确认`}
        </Tag>
      </Space>
    </div>
  )
}
