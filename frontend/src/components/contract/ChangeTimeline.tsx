import { Empty, Timeline, Typography } from 'antd'
import { EditOutlined, HistoryOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useMemo } from 'react'
import type { ContractChange, ContractVersionItem } from '../../types/contract'
import './change-timeline.css'

/** 变更记录时间线属性 */
interface ChangeTimelineProps {
  /** 版本间结构化变更记录 */
  changes?: ContractChange[]
  /** 版本列表 */
  versions?: ContractVersionItem[]
  /** 加载状态 */
  loading?: boolean
}

/** 按 to_version_id 将变更归组到对应版本 */
function groupChangesByVersion(changes: ContractChange[]): Map<number, ContractChange[]> {
  const map = new Map<number, ContractChange[]>()
  for (const change of changes) {
    const list = map.get(change.to_version_id) ?? []
    list.push(change)
    map.set(change.to_version_id, list)
  }
  return map
}

/** 渲染单条变更明细 */
function renderChangeDetail(change: ContractChange) {
  const typeClass =
    change.change_type === 0
      ? 'change-timeline__add'
      : change.change_type === 1
        ? 'change-timeline__del'
        : 'change-timeline__modify'

  const label = change.change_reason || change.change_type_text

  if (change.change_type === 0) {
    return (
      <div className={`change-timeline__change ${typeClass}`}>
        <Typography.Text className={typeClass}>[{change.change_type_text}]</Typography.Text>{' '}
        {label}
        {change.new_content ? (
          <div className="change-timeline__diff">{change.new_content}</div>
        ) : null}
      </div>
    )
  }

  if (change.change_type === 1) {
    return (
      <div className={`change-timeline__change ${typeClass}`}>
        <Typography.Text className={typeClass}>[{change.change_type_text}]</Typography.Text>{' '}
        {label}
        {change.old_content ? (
          <div className="change-timeline__diff change-timeline__del">{change.old_content}</div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`change-timeline__change ${typeClass}`}>
      <Typography.Text className={typeClass}>[{change.change_type_text}]</Typography.Text>{' '}
      {label}
      {change.old_content && change.new_content && !change.change_reason?.includes('样式') ? (
        <div className="change-timeline__diff">
          <span className="change-timeline__del">{change.old_content}</span>
          <span className="change-timeline__arrow">→</span>
          <span className="change-timeline__add">{change.new_content}</span>
        </div>
      ) : null}
    </div>
  )
}

/**
 * 版本变更时间线：每个版本下展示修改说明与结构化 diff 明细。
 */
export default function ChangeTimeline({
  changes = [],
  versions = [],
  loading = false,
}: ChangeTimelineProps) {
  const changesByVersion = useMemo(() => groupChangesByVersion(changes), [changes])

  const hasVersions = versions.length > 0
  const hasLegacyOnly = !hasVersions && changes.length > 0

  if (!loading && !hasVersions && !hasLegacyOnly) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无版本记录，保存版本后这里会展示每次修改说明与变更明细"
      />
    )
  }

  if (hasVersions) {
    return (
      <Timeline
        className="change-timeline"
        items={versions.map((version) => {
          const versionChanges = changesByVersion.get(version.version_id) ?? []
          return {
            color: '#1677ff',
            icon: <HistoryOutlined />,
            content: (
              <div className="change-timeline__item">
                <div className="change-timeline__header">
                  <Typography.Text strong>V{version.version_no}</Typography.Text>
                  <Typography.Text type="secondary" className="change-timeline__time">
                    {dayjs(version.create_time).format('MM-DD HH:mm')}
                  </Typography.Text>
                </div>
                <div className="change-timeline__body">
                  <Typography.Text>{version.created_by_name}</Typography.Text>
                  {version.change_summary ? (
                    <div className="change-timeline__summary">
                      <Typography.Text type="secondary">{version.change_summary}</Typography.Text>
                    </div>
                  ) : (
                    <div className="change-timeline__summary">
                      <Typography.Text type="secondary">（无修改说明）</Typography.Text>
                    </div>
                  )}
                  {versionChanges.length > 0 ? (
                    <div className="change-timeline__changes">
                      {versionChanges.map((change) => (
                        <div key={change.id}>{renderChangeDetail(change)}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="change-timeline__changes change-timeline__changes--empty">
                      <Typography.Text type="secondary">（本版本无结构化变更记录）</Typography.Text>
                    </div>
                  )}
                </div>
              </div>
            ),
          }
        })}
      />
    )
  }

  // 兼容仅有旧块级 diff、无版本列表数据
  return (
    <Timeline
      className="change-timeline"
      items={changes.map((change) => ({
        color: '#8c8c8c',
        icon: <EditOutlined />,
        content: (
          <div className="change-timeline__item">
            <div className="change-timeline__header">
              <Typography.Text strong>{change.operator_name}</Typography.Text>
              <Typography.Text type="secondary" className="change-timeline__time">
                {dayjs(change.create_time).format('MM-DD HH:mm')}
              </Typography.Text>
            </div>
            <div className="change-timeline__body">{renderChangeDetail(change)}</div>
          </div>
        ),
      }))}
    />
  )
}
