import axios from 'axios'
import type { AxiosError, AxiosRequestConfig } from 'axios'
import { getToken, clearAuth } from '../utils/token'
import { getMessageApi } from '../utils/message'
import type { ApiResponse } from '../types/auth'
import type { VersionConflictPayload } from '../utils/conflictResolve'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** 为 true 时不弹出全局错误提示（用于可选接口如 DOCX 预览） */
    skipErrorToast?: boolean
  }
}

/**
 * 创建统一的 axios 实例。
 * - baseURL 为 /api，开发环境由 Vite 代理到 Go 后端，生产环境由 Nginx 反代。
 * - 统一在拦截器里处理 JWT 携带、业务错误码提示、401 跳转登录。
 */
const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

/**
 * 请求拦截器：为每个请求自动携带 JWT 令牌。
 */
request.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/**
 * 响应拦截器：统一处理后端 { code, message, data } 结构。
 * code 为 0 时直接返回 data；否则提示错误并拒绝。
 */
request.interceptors.response.use(
  (response) => {
    // 文件流请求：直接返回完整响应（含 headers，用于读取文件名）
    if (response.config.responseType === 'blob') {
      return response
    }
    const body = response.data as ApiResponse<unknown>
    // 非标准响应（例如文件流）直接返回
    if (body === null || typeof body !== 'object' || body.code === undefined) {
      return response.data
    }
    if (body.code !== 0) {
      // 展示后端返回的错误信息
      getMessageApi().error(body.message || '请求失败，请稍后重试')
      return Promise.reject(new Error(body.message))
    }
    return body.data
  },
  (error: AxiosError<ApiResponse<unknown>>) => {
    const status = error.response?.status
    const bodyMessage = error.response?.data?.message

    // 401 且不在登录页：视为令牌过期，清除登录态并跳回登录页
    // （登录接口失败同样是 401，但此时在登录页，直接展示后端提示即可）
    if (status === 401 && !window.location.pathname.startsWith('/login')) {
      clearAuth()
      getMessageApi().warning('登录已过期，请重新登录')
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // 其他情况：优先展示后端返回的 message，其次给出网络层提示
    let msg =
      bodyMessage ||
      (error.code === 'ECONNABORTED'
        ? '请求超时，请检查网络后重试'
        : '网络异常，请稍后重试')
    // 404：gin 返回纯文本，无法解析 message，统一提示（多为暂未开放的接口）
    if (status === 404) {
      msg = '请求的资源不存在或功能暂未开放'
    }
    if (!error.config?.skipErrorToast) {
      getMessageApi().error(msg)
    }
    return Promise.reject(error)
  },
)

/**
 * 带类型的请求方法封装，返回值即后端 data 字段。
 * @param config axios 请求配置
 * @returns 后端返回的业务数据
 */
export function requestTyped<T>(config: AxiosRequestConfig): Promise<T> {
  return request.request<T>(config) as Promise<T>
}

/**
 * 下载类请求封装：以 Blob 方式接收文件流，返回完整响应（含 headers）。
 * @param config axios 请求配置（需带 responseType: 'blob'）
 * @returns 完整 AxiosResponse，data 为文件 Blob
 */
export function requestBlob(config: AxiosRequestConfig): Promise<import('axios').AxiosResponse<Blob>> {
  return request.request({ ...config, responseType: 'blob' }) as Promise<import('axios').AxiosResponse<Blob>>
}

/**
 * 从 Content-Disposition 响应头解析下载文件名。
 * @param headers axios 响应头
 * @param fallbackName 解析失败时的默认文件名
 * @returns 下载文件名
 */
export function parseDownloadFileName(
  headers: Record<string, string>,
  fallbackName: string,
): string {
  const disposition = headers['content-disposition'] ?? ''
  // 支持 filename*=UTF-8''xxx 与 filename=xxx 两种格式
  const starMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (starMatch?.[1]) {
    try {
      return decodeURIComponent(starMatch[1])
    } catch {
      // 解码失败时继续尝试普通格式
    }
  }
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i)
  if (plainMatch?.[1]) {
    return plainMatch[1].trim()
  }
  return fallbackName
}

/**
 * 从保存版本失败响应中提取块级冲突载荷（HTTP 409 / code 40901）。
 */
export function getVersionConflictPayload(error: unknown): VersionConflictPayload | null {
  const ax = error as AxiosError<ApiResponse<VersionConflictPayload>>
  const body = ax?.response?.data
  if (ax?.response?.status === 409 && body?.code === 40901 && body.data) {
    return body.data
  }
  return null
}

/** 读取接口错误文案（供 skipErrorToast 的调用方自行提示） */
export function getApiErrorMessage(error: unknown, fallback = '请求失败，请稍后重试'): string {
  const ax = error as AxiosError<ApiResponse<unknown>>
  return ax?.response?.data?.message || (error instanceof Error ? error.message : fallback)
}

export default request
