import { requestTyped } from './request'
import type { LoginParams, LoginResult, RegisterParams, UserVO } from '../types/auth'

/**
 * 用户登录。
 * @param data 登录参数（账号 + 密码）
 * @returns 登录结果（令牌 + 用户信息）
 */
export function login(data: LoginParams): Promise<LoginResult> {
  return requestTyped<LoginResult>({ url: '/auth/login', method: 'post', data })
}

/**
 * 用户注册。
 * @param data 注册参数
 * @returns 注册成功的用户信息
 */
export function register(data: RegisterParams): Promise<UserVO> {
  return requestTyped<UserVO>({ url: '/auth/register', method: 'post', data })
}

/**
 * 获取当前登录用户信息（携带 JWT 调用）。
 * @returns 当前用户信息
 */
export function getMe(): Promise<UserVO> {
  return requestTyped<UserVO>({ url: '/auth/me', method: 'get' })
}
