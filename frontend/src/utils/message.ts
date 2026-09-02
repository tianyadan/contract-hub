import type { MessageInstance } from 'antd/es/message/interface'
import { message as staticMessage } from 'antd'

/**
 * antd message 实例桥接器。
 * antd v5+ 的静态 message 方法无法消费 App 上下文（主题等），
 * 这里让 MessageBridge 组件在应用启动后把 App.useApp() 的实例注入进来，
 * 供 axios 拦截器等非组件模块统一使用。
 */
let messageApi: MessageInstance | null = null

/** 注入 message 实例（由 MessageBridge 组件调用） */
export function setMessageApi(api: MessageInstance): void {
  messageApi = api
}

/** 获取 message 实例；未注入时退回静态方法（兜底） */
export function getMessageApi(): MessageInstance {
  return messageApi ?? staticMessage
}
