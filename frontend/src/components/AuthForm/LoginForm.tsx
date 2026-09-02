import { useEffect, useState } from 'react'
import { App, Button, Checkbox, Form, Input } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { login } from '../../api/authApi'
import {
  getRememberedUsername,
  setRememberedUsername,
  setStoredUser,
  setToken,
} from '../../utils/token'
import './auth-form.css'

/** 登录表单字段 */
interface LoginFormValues {
  /** 账号 / 手机号 */
  username: string
  /** 密码 */
  password: string
  /** 是否记住账号 */
  remember: boolean
}

/** 登录表单组件属性 */
interface LoginFormProps {
  /** 初始账号（注册成功后回填） */
  initialUsername?: string
}

/**
 * 登录表单组件。
 * 负责账号密码校验、调用后端登录接口并保存登录态。
 */
export default function LoginForm({ initialUsername }: LoginFormProps) {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<LoginFormValues>()
  // 登录请求 loading 状态
  const [loading, setLoading] = useState(false)

  // 注册成功后回填账号名
  useEffect(() => {
    if (initialUsername) {
      form.setFieldsValue({ username: initialUsername })
    }
  }, [initialUsername, form])

  /** 处理登录提交：调用后端接口并保存登录态 */
  const handleFinish = async (values: LoginFormValues) => {
    setLoading(true)
    try {
      const result = await login({
        username: values.username,
        password: values.password,
      })
      // 保存令牌与用户信息到本地
      setToken(result.token)
      setStoredUser(result.user)
      // 按“记住我”状态保存 / 清除账号名
      setRememberedUsername(values.remember ? values.username : '')
      message.success('登录成功')
      // 登录成功进入系统首页
      navigate('/')
    } catch {
      // 错误提示已在请求拦截器统一处理
    } finally {
      setLoading(false)
    }
  }

  /** 忘记密码：暂无找回接口，提示联系管理员 */
  const handleForgotPassword = () => {
    message.info('请联系系统管理员重置密码')
  }

  return (
    <Form
      form={form}
      layout="vertical"
      size="large"
      onFinish={handleFinish}
      initialValues={{
        remember: true,
        username: initialUsername ?? getRememberedUsername(),
      }}
      className="auth-form"
    >
      {/* 账号 / 手机号 */}
      <Form.Item
        name="username"
        label="账号 / 手机号"
        rules={[
          { required: true, message: '请输入账号 / 手机号' },
          { min: 3, max: 64, message: '账号长度为 3-64 个字符' },
        ]}
      >
        <Input
          prefix={<UserOutlined />}
          placeholder="请输入账号 / 手机号"
          autoComplete="username"
          allowClear
        />
      </Form.Item>

      {/* 密码 */}
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
          autoComplete="current-password"
        />
      </Form.Item>

      {/* 记住我 + 忘记密码 */}
      <div className="auth-form__options">
        <Form.Item name="remember" valuePropName="checked" noStyle>
          <Checkbox>记住我</Checkbox>
        </Form.Item>
        <Button type="link" size="small" onClick={handleForgotPassword}>
          忘记密码?
        </Button>
      </div>

      {/* 登录按钮 */}
      <Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          block
          loading={loading}
          className="auth-form__submit"
        >
          登 录
        </Button>
      </Form.Item>
    </Form>
  )
}
