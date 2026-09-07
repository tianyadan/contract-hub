/**
 * 会话被挤下线时的全局回调（由 SessionKickBridge 注入）。
 * axios 拦截器检测到 40105 时调用，避免循环依赖。
 */
type KickHandler = (message: string) => void

let kickHandler: KickHandler | null = null

/** 注册踢下线处理器 */
export function setSessionKickHandler(handler: KickHandler | null): void {
  kickHandler = handler
}

/** 触发踢下线弹窗 */
export function notifySessionKicked(message: string): void {
  kickHandler?.(message || '账号已在其他设备登录')
}
