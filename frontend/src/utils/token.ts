import type { UserVO } from '../types/auth'

// 本地存储 Key 统一管理，避免散落各处
const TOKEN_KEY = 'lshc_token'
const USER_KEY = 'lshc_user'
const REMEMBER_USERNAME_KEY = 'lshc_remember_username'

/**
 * 获取本地保存的 JWT 令牌。
 * @returns 令牌字符串，未登录时返回 null
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

/**
 * 保存 JWT 令牌到本地。
 * @param token 后端返回的令牌
 */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

/**
 * 判断当前是否已登录（存在令牌即视为已登录）。
 * @returns 是否已登录
 */
export function isLoggedIn(): boolean {
  return Boolean(getToken())
}

/**
 * 获取本地保存的用户信息。
 * @returns 用户信息，不存在时返回 null
 */
export function getStoredUser(): UserVO | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserVO
  } catch {
    return null
  }
}

/**
 * 保存用户信息到本地。
 * @param user 用户信息
 */
export function setStoredUser(user: UserVO): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

/**
 * 清除本地登录态（登出时调用）。
 */
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

/**
 * 获取“记住我”保存的账号名。
 * @returns 账号名，未保存时返回空字符串
 */
export function getRememberedUsername(): string {
  return localStorage.getItem(REMEMBER_USERNAME_KEY) ?? ''
}

/**
 * 保存 / 清除“记住我”的账号名。
 * @param username 账号名，传空字符串表示清除
 */
export function setRememberedUsername(username: string): void {
  if (username) {
    localStorage.setItem(REMEMBER_USERNAME_KEY, username)
  } else {
    localStorage.removeItem(REMEMBER_USERNAME_KEY)
  }
}
