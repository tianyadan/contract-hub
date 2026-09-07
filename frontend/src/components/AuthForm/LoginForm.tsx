import { useEffect, useState } from 'react'
import { App, Button, Checkbox, Form, Input, Space } from 'antd'
import { LockOutlined, SafetyOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { getCaptcha, getLoginFailInfo, login } from '../../api/authApi'
import {
  getRememberedUsername,
  setRememberedUsername,
  setStoredUser,
  setToken,
} from '../../utils/token'
import './auth-form.css'

/** 登录表单字段 */
interface LoginFormValues {
  username: string
  password: string
  remember: boolean
  captcha_code?: string
}

interface LoginFormProps {
  initialUsername?: string
}

/**
 * 登录表单：失败满 3 次后展示图形验证码。
 */
export default function LoginForm({ initialUsername }: LoginFormProps) {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<LoginFormValues>()
  const [loading, setLoading] = useState(false)
  const [failCount, setFailCount] = useState(0)
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImg, setCaptchaImg] = useState('')

  const showCaptcha = failCount >= 3

  useEffect(() => {
    if (initialUsername) {
      form.setFieldsValue({ username: initialUsername })
    }
  }, [initialUsername, form])

  /** 刷新图形验证码 */
  const refreshCaptcha = async () => {
    try {
      const data = await getCaptcha()
      setCaptchaId(data.captcha_id)
      setCaptchaImg(data.image_base64)
      form.setFieldsValue({ captcha_code: '' })
    } catch {
      // 拦截器已提示
    }
  }

  useEffect(() => {
    if (showCaptcha) {
      void refreshCaptcha()
    }
  }, [showCaptcha])

  const handleFinish = async (values: LoginFormValues) => {
    setLoading(true)
    try {
      const result = await login({
        username: values.username,
        password: values.password,
        captcha_id: showCaptcha ? captchaId : undefined,
        captcha_code: showCaptcha ? values.captcha_code : undefined,
      })
      setToken(result.token)
      setStoredUser(result.user)
      setRememberedUsername(values.remember ? values.username : '')
      setFailCount(0)
      if (result.previous_login?.login_time) {
        const prev = result.previous_login
        const when = new Date(prev.login_time).toLocaleString()
        const bits = [when, prev.device, prev.login_ip].filter(Boolean)
        message.success(`登录成功。上次登录：${bits.join(' · ')}`)
      } else {
        message.success('登录成功')
      }
      navigate('/')
    } catch (error) {
      const info = getLoginFailInfo(error)
      if (info) {
        setFailCount(info.fail_count)
        if (info.captcha_required) {
          void refreshCaptcha()
        }
      } else {
        setFailCount((n) => n + 1)
      }
    } finally {
      setLoading(false)
    }
  }

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

      {showCaptcha && (
        <Form.Item
          name="captcha_code"
          label="验证码"
          rules={[{ required: true, message: '请输入验证码' }]}
        >
          <Space.Compact style={{ width: '100%' }}>
            <Input
              prefix={<SafetyOutlined />}
              placeholder="请输入图中字符"
              autoComplete="off"
            />
            {captchaImg ? (
              <img
                src={captchaImg}
                alt="验证码"
                title="点击刷新"
                onClick={() => void refreshCaptcha()}
                style={{ height: 40, cursor: 'pointer', border: '1px solid #d9d9d9' }}
              />
            ) : (
              <Button onClick={() => void refreshCaptcha()}>获取验证码</Button>
            )}
          </Space.Compact>
        </Form.Item>
      )}

      <div className="auth-form__options">
        <Form.Item name="remember" valuePropName="checked" noStyle>
          <Checkbox>记住我</Checkbox>
        </Form.Item>
        <Button type="link" size="small" onClick={handleForgotPassword}>
          忘记密码?
        </Button>
      </div>

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
