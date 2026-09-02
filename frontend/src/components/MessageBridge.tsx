import { useEffect } from 'react'
import { App } from 'antd'
import { setMessageApi } from '../utils/message'

/**
 * message 桥接组件。
 * 挂在 AntApp 内部，把带上下文的 message 实例注入全局，
 * 使 axios 拦截器等非组件代码也能正常弹出提示。
 */
export default function MessageBridge() {
  const { message } = App.useApp()

  useEffect(() => {
    setMessageApi(message)
  }, [message])

  return null
}
