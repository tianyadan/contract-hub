import { Button, Space, Typography } from 'antd'
import dayjs from 'dayjs'
import type { ContractVersionItem } from '../../types/contract'
import './version-history-list.css'

interface VersionHistoryListProps {
  versions: ContractVersionItem[]
  /** 点击查看历史版本 */
  onView?: (version: ContractVersionItem) => void
}

/**
 * 历史版本列表（纯展示，滚动由外层 CollapsibleScrollSection 控制）。
 */
export default function VersionHistoryList({ versions, onView }: VersionHistoryListProps) {
  if (versions.length === 0) {
    return <Typography.Text type="secondary">暂无版本记录</Typography.Text>
  }

  return (
    <div className="version-history-list">
      {versions.map((v) => (
        <div key={v.version_id} className="version-history-list__item">
          <div className="version-history-list__main">
            <Space orientation="vertical" size={0}>
              <Typography.Text strong>V{v.version_no}</Typography.Text>
              <Typography.Text type="secondary" className="version-history-list__meta">
                {v.created_by_name} · {dayjs(v.create_time).format('MM-DD HH:mm')}
              </Typography.Text>
            </Space>
            {onView ? (
              <Button type="link" size="small" onClick={() => onView(v)}>
                查看
              </Button>
            ) : null}
          </div>
          {v.change_summary ? (
            <Typography.Text type="secondary" className="version-history-list__summary">
              {v.change_summary}
            </Typography.Text>
          ) : null}
        </div>
      ))}
    </div>
  )
}
