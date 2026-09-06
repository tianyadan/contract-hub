import { Button, Space } from 'antd'
import {
  CheckCircleOutlined,
  DownloadOutlined,
  SaveOutlined,
} from '@ant-design/icons'

/** 操作栏属性 */
interface ConfirmActionBarProps {
  /** 保存版本回调 */
  onSave: () => void
  /** 确认合同回调 */
  onConfirm: () => void
  /** 打开导出 PDF 回调 */
  onDownload: () => void
  /** 保存 loading */
  saving?: boolean
  /** 确认 loading */
  confirming?: boolean
  /** 下载 loading */
  downloading?: boolean
  /** 是否禁用编辑类操作（保存 / 确认） */
  editReadOnly?: boolean
  /** 是否禁用导出 PDF */
  exportDisabled?: boolean
  /** 布局：水平（默认）或纵向铺满（分享页侧栏） */
  layout?: 'horizontal' | 'vertical'
  /** 手机 Dock：短文案 + 更大触控 */
  compact?: boolean
}

/**
 * 合同操作栏（保存版本 / 确认 / 导出 PDF）。
 * 合同详情页与外部协作页复用。
 */
export default function ConfirmActionBar({
  onSave,
  onConfirm,
  onDownload,
  saving = false,
  confirming = false,
  downloading = false,
  editReadOnly = false,
  exportDisabled = false,
  layout = 'horizontal',
  compact = false,
}: ConfirmActionBarProps) {
  const vertical = layout === 'vertical'
  const btnSize = vertical || compact ? 'large' : 'middle'

  return (
    <Space
      className={compact ? 'confirm-action-bar confirm-action-bar--compact' : 'confirm-action-bar'}
      orientation={vertical ? 'vertical' : 'horizontal'}
      wrap={!vertical && !compact}
      style={vertical || compact ? { width: '100%' } : undefined}
      size={vertical ? 10 : compact ? 8 : undefined}
    >
      <Button
        type="primary"
        icon={<SaveOutlined />}
        loading={saving}
        disabled={editReadOnly}
        onClick={onSave}
        block={vertical || compact}
        size={btnSize}
      >
        {compact ? '保存' : '保存版本'}
      </Button>
      <Button
        icon={<CheckCircleOutlined />}
        loading={confirming}
        disabled={editReadOnly}
        onClick={onConfirm}
        block={vertical || compact}
        size={btnSize}
      >
        {compact ? '确认' : '确认合同'}
      </Button>
      <Button
        icon={<DownloadOutlined />}
        loading={downloading}
        disabled={exportDisabled}
        onClick={onDownload}
        block={vertical || compact}
        size={btnSize}
      >
        {compact ? '导出' : '导出 PDF'}
      </Button>
    </Space>
  )
}
