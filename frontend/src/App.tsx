import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/Login/LoginPage'
import HomePage from './pages/Home/HomePage'
import ContractListPage from './pages/ContractList/ContractListPage'
import ContractDetailPage from './pages/ContractDetail/ContractDetailPage'
import TemplateListPage from './pages/Templates/TemplateListPage'
import TemplateDetailPage from './pages/Templates/TemplateDetailPage'
import CustomerListPage from './pages/Customers/CustomerListPage'
import CustomerDetailPage from './pages/Customers/CustomerDetailPage'
import SharePage from './pages/Share/SharePage'
import VerifyPage from './pages/Verify/VerifyPage'
import PlaceholderPage from './pages/Placeholder/PlaceholderPage'
import MainLayout from './layouts/MainLayout'
import { isLoggedIn } from './utils/token'

/** 需要登录的路由守卫：未登录时重定向到登录页 */
function RequireAuth({ children }: { children: ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  return children
}

/**
 * 应用路由配置。
 * - /login          登录页（公开）
 * - /               首页（需登录，主布局内）
 * - /contracts      合同管理列表页（需登录，主布局内）
 * - /contracts/:id  合同详情 / 在线编辑页（需登录，主布局内）
 * - /share/:token   外部协作者访问页（公开，免登录，不套主布局）
 * - /customers /settings /statistics 其他菜单（暂为占位页）
 */
export default function App() {
  return (
    <Routes>
      {/* 公开页面 */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/share/:token" element={<SharePage />} />
      <Route path="/verify/:code" element={<VerifyPage />} />

      {/* 需登录的主布局 */}
      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/templates" element={<TemplateListPage />} />
        <Route path="/templates/:id" element={<TemplateDetailPage />} />
        <Route path="/customers" element={<CustomerListPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/contracts" element={<ContractListPage />} />
        <Route path="/contracts/:id" element={<ContractDetailPage />} />
        <Route
          path="/settings"
          element={
            <PlaceholderPage title="系统设置" description="账号与系统参数配置" />
          }
        />
        <Route
          path="/statistics"
          element={
            <PlaceholderPage title="数据统计" description="合同数量与业务数据汇总" />
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
