import { Button, Popconfirm, Space, Typography } from 'antd'
import { EyeOutlined, RollbackOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { FidelitySnapshot } from '../../types/fidelity'
import './fidelity-snapshot-list.css'

interface FidelitySnapshotListProps {
  snapshots: FidelitySnapshot[]
  loading?: boolean
  rollbackDisabled?: boolean
  onPreview: (snapshot: FidelitySnapshot) => void
  onRollback?: (snapshot: FidelitySnapshot) => void
}

/**
 * 高保真快照列表：预览与回退操作。
 */
export default function FidelitySnapshotList({
  snapshots,
  loading,
  rollbackDisabled,
  onPreview,
  onRollback,
}: FidelitySnapshotListProps) {
  if (!loading && snapshots.length === 0) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        暂无高保真快照，点击上方按钮手动生成
      </Typography.Text>
    )
  }

  return (
    <div className="fidelity-snapshot-list">
      {snapshots.map((item) => (
        <div key={item.snapshot_id} className="fidelity-snapshot-list__item">
          <div className="fidelity-snapshot-list__main">
            <Space orientation="vertical" size={0}>
              <Typography.Text strong>
                #{item.snapshot_no} · V{item.source_version_no}
              </Typography.Text>
              <Typography.Text type="secondary" className="fidelity-snapshot-list__meta">
                {item.page_count} 页 · {item.created_by_name} ·{' '}
                {dayjs(item.create_time).format('MM-DD HH:mm')}
              </Typography.Text>
            </Space>
            <Space size={4}>
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => onPreview(item)}
              >
                预览
              </Button>
              {onRollback ? (
                <Popconfirm
                  title={`回退到快照 #${item.snapshot_no}？`}
                  description="将基于快照内容生成新的文档版本"
                  okText="确认回退"
                  cancelText="取消"
                  disabled={rollbackDisabled}
                  onConfirm={() => onRollback(item)}
                >
                  <Button
                    type="link"
                    size="small"
                    icon={<RollbackOutlined />}
                    disabled={rollbackDisabled}
                  >
                    回退
                  </Button>
                </Popconfirm>
              ) : null}
            </Space>
          </div>
        </div>
      ))}
    </div>
  )
}
