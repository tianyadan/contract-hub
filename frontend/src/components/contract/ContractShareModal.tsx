import { useEffect, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { CopyOutlined, LinkOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { createContractShare, disableContractShare } from '../../api/contractApi'
import type { ShareInfo } from '../../types/contract'

/** 分享弹窗属性 */
interface ContractShareModalProps {
  /** 合同 ID */
  contractId: number
  /** 合同名称（展示用） */
  contractName: string
  /** 是否打开 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
}

/** 过期时间选项 */
const EXPIRE_OPTIONS = [
  { label: '24 小时', value: 24 },
  { label: '3 天', value: 72 },
  { label: '7 天', value: 168 },
  { label: '永久', value: 0 },
]

/**
 * 分享链接弹窗。
 * 选择权限（可编辑 / 只读）与过期时间，调用 POST /api/contracts/{id}/share 生成链接，
 * 支持一键复制与失效链接（POST /api/contracts/{id}/share/{shareId}/disable）。
 */
export default function ContractShareModal({
  contractId,
  contractName,
  open,
  onClose,
}: ContractShareModalProps) {
  const { message } = App.useApp()
  // 分享信息（生成成功后展示）
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null)
  // 权限：0 只读 1 可编辑
  const [permission, setPermission] = useState<0 | 1>(1)
  // 过期小时数：0 表示永久
  const [expireHours, setExpireHours] = useState(24)
  // 生成中 loading
  const [loading, setLoading] = useState(false)
  // 失效中 loading
  const [disabling, setDisabling] = useState(false)

  /** 生成分享链接 */
  const handleGenerate = async () => {
    setLoading(true)
    try {
      const info = await createContractShare(contractId, {
        permission,
        expire_hours: expireHours,
      })
      setShareInfo(info)
      message.success('分享链接生成成功')
    } catch {
      // 错误提示已在请求拦截器统一处理
    } finally {
      setLoading(false)
    }
  }

  // 弹窗打开时重置并自动生成
  useEffect(() => {
    if (open) {
      setShareInfo(null)
      handleGenerate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /** 分享链接（前端地址 + token） */
  const shareUrl = shareInfo
    ? `${window.location.origin}/share/${shareInfo.token}`
    : ''

  /** 复制分享链接到剪贴板 */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      message.success('分享链接已复制')
    } catch {
      message.error('复制失败，请手动选择复制')
    }
  }

  /** 失效分享链接 */
  const handleDisable = async () => {
    if (!shareInfo) return
    setDisabling(true)
    try {
      await disableContractShare(contractId, shareInfo.share_id)
      message.success('分享链接已失效')
      // 失效后展示已失效状态
      setShareInfo({ ...shareInfo, status: 0 })
    } catch {
      // 错误提示已在请求拦截器统一处理
    } finally {
      setDisabling(false)
    }
  }

  /** 关闭弹窗并重置状态 */
  const handleClose = () => {
    setShareInfo(null)
    onClose()
  }

  return (
    <Modal
      title={`分享合同：${contractName}`}
      open={open}
      onCancel={handleClose}
      footer={
        shareInfo?.status === 0 ? (
          <Button onClick={handleClose}>关闭</Button>
        ) : (
          <>
            <Button onClick={handleClose}>关闭</Button>
            <Button onClick={handleDisable} danger loading={disabling}>
              失效链接
            </Button>
          </>
        )
      }
      width={520}
    >
      {/* 已失效提示 */}
      {shareInfo?.status === 0 && (
        <Alert type="warning" showIcon message="该分享链接已失效，外部用户无法再访问" />
      )}

      {/* 生成中 */}
      {loading && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(0,0,0,0.45)' }}>
          正在生成分享链接，请稍候…
        </div>
      )}

      {/* 已生成：展示链接与参数 */}
      {!loading && shareInfo && shareInfo.status === 1 && (
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          {/* 分享链接 */}
          <div>
            <Typography.Text type="secondary">分享链接（外部协作者可直接访问）：</Typography.Text>
            <Space.Compact style={{ width: '100%', marginTop: 4 }}>
              <Input readOnly value={shareUrl} prefix={<LinkOutlined />} />
              <Button icon={<CopyOutlined />} onClick={handleCopy}>
                复制
              </Button>
            </Space.Compact>
          </div>

          {/* 权限与过期时间 */}
          <Space size="middle" wrap>
            <span>
              权限：
              <Tag color={shareInfo.permission === 1 ? 'green' : 'default'}>
                {shareInfo.permission_text}
              </Tag>
            </span>
            <Typography.Text type="secondary">
              过期时间：
              {shareInfo.expire_time
                ? dayjs(shareInfo.expire_time).format('YYYY-MM-DD HH:mm')
                : '永久有效'}
            </Typography.Text>
          </Space>
        </Space>
      )}

      {/* 未生成（手动重新生成时）：展示参数选择 */}
      {!loading && !shareInfo && (
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Typography.Text strong>协作权限</Typography.Text>
            <Radio.Group
              value={permission}
              onChange={(e) => setPermission(e.target.value as 0 | 1)}
              style={{ marginTop: 8, display: 'block' }}
              options={[
                { label: '可编辑（协作者可修改并保存新版本）', value: 1 },
                { label: '只读（协作者仅可查看与下载）', value: 0 },
              ]}
            />
          </div>
          <div>
            <Typography.Text strong>链接有效期</Typography.Text>
            <Select
              value={expireHours}
              onChange={setExpireHours}
              options={EXPIRE_OPTIONS}
              style={{ width: 160, marginTop: 8, display: 'block' }}
            />
          </div>
          <Button type="primary" icon={<LinkOutlined />} loading={loading} onClick={handleGenerate}>
            生成分享链接
          </Button>
        </Space>
      )}
    </Modal>
  )
}
