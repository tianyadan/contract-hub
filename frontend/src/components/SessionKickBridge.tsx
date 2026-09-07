import { useEffect, useRef, useState } from 'react'
import { Modal } from 'antd'
import { clearAuth } from '../utils/token'
import { setSessionKickHandler } from '../utils/sessionKick'

/**
 * 挂载全局「被挤下线」弹窗：仅允许退出登录。
 */
export default function SessionKickBridge() {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('账号已在其他设备登录')
  const shownRef = useRef(false)

  useEffect(() => {
    setSessionKickHandler((message) => {
      if (shownRef.current) return
      shownRef.current = true
      setMsg(message)
      setOpen(true)
    })
    return () => setSessionKickHandler(null)
  }, [])

  return (
    <Modal
      open={open}
      title="账号已在其他设备登录"
      closable={false}
      maskClosable={false}
      keyboard={false}
      cancelButtonProps={{ style: { display: 'none' } }}
      okText="退出登录"
      onOk={() => {
        clearAuth()
        window.location.href = '/login'
      }}
    >
      <p>{msg}</p>
      <p style={{ color: 'rgba(0,0,0,0.45)', marginBottom: 0 }}>
        若非本人操作，请重新登录并尽快修改密码。
      </p>
    </Modal>
  )
}
