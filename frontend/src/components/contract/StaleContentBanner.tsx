import { Alert, Button } from 'antd'
import type { VersionSavedWsPayload } from '../../types/contract'

interface StaleContentBannerProps {
  payload: VersionSavedWsPayload | null
  onRefresh: () => void
  onDismiss: () => void
  disabled?: boolean
}

/**
 * 对方保存新版本后的刷新提醒（不自动替换正文，保留当前页码由父组件处理）。
 */
export default function StaleContentBanner({
  payload,
  onRefresh,
  onDismiss,
  disabled = false,
}: StaleContentBannerProps) {
  if (!payload || disabled) return null

  const roleLabel = payload.saved_by_role === 'owner' ? '内部用户' : '外部协作者'

  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 12 }}
      message={`${roleLabel} ${payload.saved_by} 已保存新版本 V${payload.version_no}，请刷新以查看最新内容`}
      action={
        <>
          <Button size="small" type="primary" onClick={onRefresh}>
            立即刷新
          </Button>
          <Button size="small" onClick={onDismiss} style={{ marginLeft: 8 }}>
            稍后
          </Button>
        </>
      }
    />
  )
}
