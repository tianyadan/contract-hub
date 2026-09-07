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
  /** 账号状态：0 封禁 / 1 正常 / 2 软删除 */
  status: number
  /** 角色：0 普通 / 1 管理员 */
  role: number
  /** 创建时间 */
  create_time: string
}

/** 登录请求参数 */
export interface LoginParams {
  username: string
  password: string
  captcha_id?: string
  captcha_code?: string
}

/** 注册请求参数 */
export interface RegisterParams {
  username: string
  password: string
  nickname?: string
  phone?: string
  email?: string
  /** 管理员生成的邀请码 */
  invite_code: string
}

/** 登录成功返回结果 */
export interface LoginResult {
  token: string
  expires_at: string
  user: UserVO
}

/** 图形验证码 */
export interface CaptchaPayload {
  captcha_id: string
  image_base64: string
}

/** 登录失败附加信息 */
export interface LoginFailInfo {
  fail_count: number
  captcha_required: boolean
}

/** 后端统一响应结构 */
export interface ApiResponse<T> {
  code: number
  message: string
  data?: T
}

/** 邀请码 */
export interface InviteCodeVO {
  id: number
  code: string
  expire_at: string
  used_at?: string
  used_by_user_id?: number
  create_time: string
  expired: boolean
  used: boolean
}
