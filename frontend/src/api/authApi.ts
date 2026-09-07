import axios from 'axios'
import { requestTyped } from './request'
import type {
  CaptchaPayload,
  LoginFailInfo,
  LoginParams,
  LoginResult,
  RegisterParams,
  UserVO,
} from '../types/auth'
import type { ApiResponse } from '../types/auth'

/**
 * 用户登录。
 * @param data 登录参数（账号 + 密码 + 可选验证码）
 */
export function login(data: LoginParams): Promise<LoginResult> {
  return requestTyped<LoginResult>({ url: '/auth/login', method: 'post', data })
}

/**
 * 用户注册（必须邀请码）。
 */
export function register(data: RegisterParams): Promise<UserVO> {
  return requestTyped<UserVO>({ url: '/auth/register', method: 'post', data })
}

/** 获取当前登录用户信息。 */
export function getMe(): Promise<UserVO> {
  return requestTyped<UserVO>({ url: '/auth/me', method: 'get' })
}

/** 退出登录（注销服务端会话）。 */
export function logout(): Promise<void> {
  return requestTyped<void>({ url: '/auth/logout', method: 'post', skipErrorToast: true })
}

/** 获取图形验证码。 */
export function getCaptcha(): Promise<CaptchaPayload> {
  return requestTyped<CaptchaPayload>({ url: '/auth/captcha', method: 'get' })
}

/**
 * 从登录失败响应中提取失败计数信息。
 */
export function getLoginFailInfo(error: unknown): LoginFailInfo | null {
  const ax = error as { response?: { data?: ApiResponse<LoginFailInfo> } }
  const data = ax?.response?.data?.data
  if (data && typeof data.fail_count === 'number') {
    return data
  }
  return null
}

/** 判断是否为登录相关错误（供表单自行处理提示时复用 axios）。 */
export function isAxiosError(error: unknown): boolean {
  return axios.isAxiosError(error)
}
