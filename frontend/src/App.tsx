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
import WatermarkSettingsPage from './pages/Settings/WatermarkSettingsPage'
import SealSettingsPage from './pages/Settings/SealSettingsPage'
import AdminUsersPage from './pages/Admin/AdminUsersPage'
import InviteCodesPage from './pages/Admin/InviteCodesPage'
import MainLayout from './layouts/MainLayout'
import { getStoredUser, isLoggedIn } from './utils/token'

/** 需要登录的路由守卫：未登录时重定向到登录页 */
function RequireAuth({ children }: { children: ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  return children
}

/** 仅管理员可访问 */
function RequireAdmin({ children }: { children: ReactNode }) {
  const user = getStoredUser()
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  if (user?.role !== 1) {
    return <Navigate to="/" replace />
  }
  return children
}

/**
 * 应用路由配置。
 * - /login          登录页（公开）
 * - /               首页（需登录，主布局内）
 * - /contracts/:id  合同详情（需登录；列表入口已隐藏，深链保留）
 * - /share/:token   外部协作者访问页（公开，免登录，不套主布局）
 * - /customers /settings 客户与合同设置
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
        <Route path="/settings" element={<Navigate to="/settings/watermark" replace />} />
        <Route path="/settings/watermark" element={<WatermarkSettingsPage />} />
        <Route path="/settings/seal" element={<SealSettingsPage />} />
        <Route path="/statistics" element={<Navigate to="/" replace />} />
        <Route
          path="/admin/users"
          element={
            <RequireAdmin>
              <AdminUsersPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/invite-codes"
          element={
            <RequireAdmin>
              <InviteCodesPage />
            </RequireAdmin>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
