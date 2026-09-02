import { Space, Tag, Typography } from 'antd'
import { TeamOutlined } from '@ant-design/icons'
import type { PresenceUser } from '../../types/contract'
import PresenceAvatar from './PresenceAvatar'
import './online-presence-bar.css'

interface OnlinePresenceBarProps {
  users: PresenceUser[]
  isConnected: boolean
}

/**
 * 在线协作状态条：置于编辑区上方，醒目展示当前在线用户。
 */
export default function OnlinePresenceBar({ users, isConnected }: OnlinePresenceBarProps) {
  const count = users.length

  return (
    <div className={`online-presence-bar ${isConnected ? 'online-presence-bar--live' : ''}`}>
      <Space size="middle" wrap className="online-presence-bar__inner">
        <Space size={6}>
          <TeamOutlined className="online-presence-bar__icon" />
          <Typography.Text strong className="online-presence-bar__title">
            在线协作
          </Typography.Text>
          <Tag color={isConnected ? 'success' : 'default'} className="online-presence-bar__tag">
            {isConnected ? `${count} 人在线` : '连接中…'}
          </Tag>
        </Space>
        <Space size={8} wrap className="online-presence-bar__users">
          {users.length === 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              暂无其他协作者在线
            </Typography.Text>
          ) : (
            users.map((user) => (
              <Space key={user.id} size={6} className="online-presence-bar__user">
                <PresenceAvatar user={user} size={36} />
                <Typography.Text style={{ fontSize: 13 }}>
                  {user.name}
                  <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                    {user.role === 'owner' ? '（内部）' : '（外部）'}
                  </Typography.Text>
                </Typography.Text>
              </Space>
            ))
          )}
        </Space>
      </Space>
    </div>
  )
}
