import { useState } from 'react'
import { Tabs, Typography } from 'antd'
import BrandPanel from '../../components/BrandPanel'
import LoginForm from '../../components/AuthForm/LoginForm'
import RegisterForm from '../../components/AuthForm/RegisterForm'
import './login.css'

/**
 * 登录页面。
 * 左侧为品牌宣传面板，右侧为登录 / 注册表单卡片。
 */
export default function LoginPage() {
  // 当前激活页签：login 登录 / register 注册
  const [activeKey, setActiveKey] = useState('login')
  // 注册成功后回填到登录表单的账号名
  const [registeredUsername, setRegisteredUsername] = useState('')

  /** 切换页签 */
  const handleTabChange = (key: string) => {
    setActiveKey(key)
  }

  /** 注册成功回调：记录账号名并切回登录页签 */
  const handleRegistered = (username: string) => {
    setRegisteredUsername(username)
    setActiveKey('login')
  }

  return (
    <div className="login-page">
      {/* 左侧品牌宣传面板 */}
      <BrandPanel />

      {/* 右侧表单区 */}
      <main className="login-page__main">
        <div className="login-card">
          {/* 欢迎标题 */}
          <div className="login-card__header">
            <Typography.Title level={2} className="login-card__title">
              欢迎登录心智协同
            </Typography.Title>
            <Typography.Text type="secondary">
              合同协作与业务管理系统
            </Typography.Text>
          </div>

          {/* 登录 / 注册页签 */}
          <Tabs
            activeKey={activeKey}
            onChange={handleTabChange}
            centered
            items={[
              {
                key: 'login',
                label: '账号登录',
                children: <LoginForm initialUsername={registeredUsername} />,
              },
              {
                key: 'register',
                label: '注册账号',
                children: <RegisterForm onRegistered={handleRegistered} />,
              },
            ]}
          />

          {/* 底部协议提示 */}
          <div className="login-card__agreement">
            登录即代表您已阅读并同意
            <Typography.Link>《用户协议》</Typography.Link>
            与
            <Typography.Link>《隐私政策》</Typography.Link>
          </div>
        </div>
      </main>
    </div>
  )
}
