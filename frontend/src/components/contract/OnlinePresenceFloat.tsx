import { Badge, Popover, Space, Typography } from 'antd'
import { TeamOutlined } from '@ant-design/icons'
import type { PresenceUser } from '../../types/contract'
import PresenceAvatar from './PresenceAvatar'
import './online-presence-float.css'

interface OnlinePresenceFloatProps {
  users: PresenceUser[]
  isConnected: boolean
}

/**
 * 轻量在线协作浮层：叠放头像 + 悬浮详情，不占用编辑区纵向空间。
 */
export default function OnlinePresenceFloat({ users, isConnected }: OnlinePresenceFloatProps) {
  const onlineUsers = users.filter((u) => u.is_online !== false)
  const display = onlineUsers.slice(0, 4)
  const extra = Math.max(0, onlineUsers.length - display.length)
  const count = onlineUsers.length

  const panel = (
    <div className="online-presence-float__panel">
      <div className="online-presence-float__panel-head">
        <TeamOutlined />
        <Typography.Text strong>
          {isConnected ? `在线协作 · ${count} 人` : '正在连接协作…'}
        </Typography.Text>
      </div>
      {count === 0 ? (
        <Typography.Text type="secondary" className="online-presence-float__empty">
          暂无其他协作者在线
        </Typography.Text>
      ) : (
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          {onlineUsers.map((user) => (
            <div key={user.id} className="online-presence-float__row">
              <PresenceAvatar user={user} size={28} />
              <div className="online-presence-float__meta">
                <Typography.Text>{user.name}</Typography.Text>
                <Typography.Text type="secondary" className="online-presence-float__role">
                  {user.role === 'owner' ? '内部用户' : '外部协作者'}
                </Typography.Text>
              </div>
            </div>
          ))}
        </Space>
      )}
    </div>
  )

  return (
    <Popover
      content={panel}
      trigger="click"
      placement="topRight"
      overlayClassName="online-presence-float__popover"
    >
      <button
        type="button"
        className={`online-presence-float ${isConnected ? 'online-presence-float--live' : ''}`}
        aria-label={`在线协作，${count} 人在线`}
      >
        <Badge
          count={count > 0 ? count : 0}
          size="small"
          offset={[-2, 2]}
          color={isConnected ? '#52c41a' : '#bfbfbf'}
        >
          <div className="online-presence-float__stack">
            {display.length === 0 ? (
              <span className="online-presence-float__fallback">
                <TeamOutlined />
              </span>
            ) : (
              display.map((user, index) => (
                <span
                  key={user.id}
                  className="online-presence-float__avatar"
                  style={{ zIndex: display.length - index, marginLeft: index === 0 ? 0 : -10 }}
                >
                  <PresenceAvatar user={user} size={30} />
                </span>
              ))
            )}
            {extra > 0 ? (
              <span className="online-presence-float__more" style={{ zIndex: 0 }}>
                +{extra}
              </span>
            ) : null}
          </div>
        </Badge>
      </button>
    </Popover>
  )
}
