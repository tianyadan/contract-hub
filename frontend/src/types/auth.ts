/**
 * 认证相关类型定义。
 * 字段与 Go 后端 `response.Body` / `LoginResult` / `UserVO` 保持一致。
 */

/** 用户信息 VO（后端不返回密码字段） */
export interface UserVO {
  /** 用户 ID */
  id: number
  /** 登录账号 */
  username: string
  /** 昵称 / 姓名 */
  nickname?: string
  /** 手机号 */
  phone?: string
  /** 邮箱 */
  email?: string
  /** 头像地址 */
  avatar_url?: string
  /** 账号状态：1 正常 */
  status: number
  /** 创建时间 */
  create_time: string
}

/** 登录请求参数 */
export interface LoginParams {
  /** 登录账号 */
  username: string
  /** 登录密码 */
  password: string
}

/** 注册请求参数 */
export interface RegisterParams {
  /** 登录账号（3-64 位） */
  username: string
  /** 登录密码（6-72 位） */
  password: string
  /** 昵称 / 姓名 */
  nickname?: string
  /** 手机号 */
  phone?: string
  /** 邮箱 */
  email?: string
}

/** 登录成功返回结果 */
export interface LoginResult {
  /** JWT 令牌 */
  token: string
  /** 令牌过期时间 */
  expires_at: string
  /** 当前登录用户信息 */
  user: UserVO
}

/** 后端统一响应结构 */
export interface ApiResponse<T> {
  /** 业务状态码：0 表示成功 */
  code: number
  /** 提示信息 */
  message: string
  /** 业务数据 */
  data?: T
}
