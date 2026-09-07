import { useState } from 'react'
import { App, Button, Form, Input } from 'antd'
import {
  KeyOutlined,
  LockOutlined,
  MailOutlined,
  MobileOutlined,
  SmileOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { register } from '../../api/authApi'
import './auth-form.css'

/** 注册表单字段 */
interface RegisterFormValues {
  username: string
  nickname?: string
  phone?: string
  email?: string
  password: string
  confirmPassword: string
  invite_code: string
}

/** 注册表单组件属性 */
interface RegisterFormProps {
  /** 注册成功回调，返回注册的账号名 */
  onRegistered?: (username: string) => void
}

/**
 * 注册表单组件。
 * 负责注册参数校验、调用后端注册接口，成功后交回登录页签。
 */
export default function RegisterForm({ onRegistered }: RegisterFormProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm<RegisterFormValues>()
  // 注册请求 loading 状态
  const [loading, setLoading] = useState(false)

  /** 处理注册提交：调用后端接口，成功后切换回登录 */
  const handleFinish = async (values: RegisterFormValues) => {
    setLoading(true)
    try {
      const user = await register({
        username: values.username,
        password: values.password,
        nickname: values.nickname,
        phone: values.phone,
        email: values.email,
        invite_code: values.invite_code.trim().toUpperCase(),
      })
      message.success(`注册成功，请使用账号 ${user.username} 登录`)
      onRegistered?.(user.username)
    } catch {
      // 错误提示已在请求拦截器统一处理
    } finally {
      setLoading(false)
    }
  }

  return (
    <Form
      form={form}
      layout="vertical"
      size="large"
      onFinish={handleFinish}
      className="auth-form"
    >
      {/* 邀请码（必填） */}
      <Form.Item
        name="invite_code"
        label="邀请码"
        rules={[{ required: true, message: '请输入管理员提供的邀请码' }]}
      >
        <Input
          prefix={<KeyOutlined />}
          placeholder="请输入邀请码"
          autoComplete="off"
          allowClear
        />
      </Form.Item>

      {/* 登录账号（必填） */}
      <Form.Item
        name="username"
        label="登录账号"
        rules={[
          { required: true, message: '请输入登录账号' },
          { min: 3, max: 64, message: '账号长度为 3-64 个字符' },
        ]}
      >
        <Input
          prefix={<UserOutlined />}
          placeholder="请输入登录账号"
          autoComplete="username"
          allowClear
        />
      </Form.Item>

      {/* 姓名 / 昵称（选填） */}
      <Form.Item
        name="nickname"
        label="姓名 / 昵称"
        rules={[{ max: 64, message: '昵称长度不能超过 64 个字符' }]}
      >
        <Input
          prefix={<SmileOutlined />}
          placeholder="请输入姓名或昵称（选填）"
          allowClear
        />
      </Form.Item>

      {/* 手机号（选填） */}
      <Form.Item
        name="phone"
        label="手机号"
        rules={[{ max: 32, message: '手机号长度不能超过 32 个字符' }]}
      >
        <Input
          prefix={<MobileOutlined />}
          placeholder="请输入手机号（选填）"
          autoComplete="tel"
          allowClear
        />
      </Form.Item>

      {/* 邮箱（选填） */}
      <Form.Item
        name="email"
        label="邮箱"
        rules={[{ type: 'email', message: '邮箱格式不正确' }]}
      >
        <Input
          prefix={<MailOutlined />}
          placeholder="请输入邮箱（选填）"
          autoComplete="email"
          allowClear
        />
      </Form.Item>

      {/* 密码（必填） */}
      <Form.Item
        name="password"
        label="密码"
        rules={[
          { required: true, message: '请输入密码' },
          { min: 6, max: 72, message: '密码长度为 6-72 个字符' },
        ]}
      >
        <Input.Password
          prefix={<LockOutlined />}
          placeholder="请输入密码"
          autoComplete="new-password"
        />
      </Form.Item>

      {/* 确认密码（必填，与密码一致） */}
      <Form.Item
        name="confirmPassword"
        label="确认密码"
        dependencies={['password']}
        rules={[
          { required: true, message: '请再次输入密码' },
          // 自定义校验：两次密码必须一致
          ({ getFieldValue }) => ({
            validator(_, value: string) {
              if (!value || getFieldValue('password') === value) {
                return Promise.resolve()
              }
              return Promise.reject(new Error('两次输入的密码不一致'))
            },
          }),
        ]}
      >
        <Input.Password
          prefix={<LockOutlined />}
          placeholder="请再次输入密码"
          autoComplete="new-password"
        />
      </Form.Item>

      {/* 注册按钮 */}
      <Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          block
          loading={loading}
          className="auth-form__submit"
        >
          注 册
        </Button>
      </Form.Item>
    </Form>
  )
}
