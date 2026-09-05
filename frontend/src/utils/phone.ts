/**
 * 大陆手机号：11 位，1 开头，第二位 3–9。
 * 提交前会去掉空格、横线等非数字字符再校验。
 */
export const CN_MOBILE_PATTERN = /^1[3-9]\d{9}$/

/** 仅保留数字 */
export function normalizePhoneDigits(phone: string): string {
  return String(phone ?? '').replace(/\D/g, '')
}

/** 是否为合法大陆手机号 */
export function isValidCnMobile(phone: string): boolean {
  return CN_MOBILE_PATTERN.test(normalizePhoneDigits(phone))
}

/**
 * Ant Design Form 手机号校验规则（必填 + 格式）。
 * 用于客户新建 / 编辑、合同导入等入口，保证后续分享门禁可用。
 */
export const phoneFormRules = [
  { required: true, message: '请输入联系电话' },
  {
    validator: async (_: unknown, value: string) => {
      if (!value || !String(value).trim()) {
        return Promise.reject(new Error('请输入联系电话'))
      }
      if (!isValidCnMobile(value)) {
        return Promise.reject(new Error('请输入正确的 11 位手机号（如 13800138000）'))
      }
      return Promise.resolve()
    },
  },
]
