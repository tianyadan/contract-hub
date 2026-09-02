import { Avatar, Tooltip } from 'antd'
import type { PresenceUser } from '../../types/contract'
import './presence-avatar.css'

/** 在线状态头像属性 */
interface PresenceAvatarProps {
  /** 在线用户 */
  user: PresenceUser
  /** 头像尺寸 */
  size?: number
}

/**
 * 在线状态头像。
 * 在线用户：彩色头像 + 绿色圆点；离线用户：灰色头像 + 灰色圆点。
 * 合同详情页、外部协作页顶部展示在线用户列表时复用。
 */
export default function PresenceAvatar({ user, size = 32 }: PresenceAvatarProps) {
  // 在线：绿色圆点；离线：灰色圆点
  const dotClass = user.is_online ? 'presence-avatar__dot--online' : 'presence-avatar__dot--offline'

  return (
    <Tooltip title={`${user.name}（${user.is_online ? '在线' : '离线'}）`}>
      <div className="presence-avatar" style={{ width: size + 8, height: size + 8 }}>
        <Avatar
          size={size}
          style={{
            backgroundColor: user.is_online ? '#00b96b' : '#bfbfbf',
            fontSize: size * 0.4,
          }}
        >
          {user.name.slice(0, 1)}
        </Avatar>
        {/* 在线状态圆点 */}
        <span className={`presence-avatar__dot ${dotClass}`} />
      </div>
    </Tooltip>
  )
}
