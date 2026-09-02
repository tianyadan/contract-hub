import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import MessageBridge from './components/MessageBridge'
import { themeConfig } from './theme'
import './index.css'

/**
 * 应用入口。
 * 挂载全局主题（清新绿）、中文语言包、路由与 antd 上下文。
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      {/* AntApp 提供 message / notification 等上下文能力 */}
      <AntApp>
        {/* 桥接 message 实例给 axios 拦截器等非组件模块 */}
        <MessageBridge />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
)
