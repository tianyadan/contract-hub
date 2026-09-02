import { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  App,
  Avatar,
  Dropdown,
  Layout,
  Menu,
  Space,
  Typography,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  BarChartOutlined,
  DownOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  LogoutOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import BrandLogo from '../components/BrandLogo'
import { clearAuth, getStoredUser } from '../utils/token'
import './main-layout.css'

const { Header, Sider, Content } = Layout

/** 左侧菜单配置 */
const MENU_ITEMS: MenuProps['items'] = [
  { key: '/', label: '首页', icon: <HomeOutlined /> },
  { key: '/customers', label: '客户管理', icon: <TeamOutlined /> },
  { key: '/templates', label: '模板池', icon: <FolderOpenOutlined /> },
  { key: '/contracts', label: '合同管理', icon: <FileTextOutlined /> },
  { key: '/settings', label: '系统设置', icon: <SettingOutlined /> },
  { key: '/statistics', label: '数据统计', icon: <BarChartOutlined /> },
]

/**
 * 管理系统主布局。
 * 左侧为可折叠菜单，顶部展示系统名称与当前用户登录状态，右侧为内容区。
 */
export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = App.useApp()
  // 侧边栏折叠状态
  const [collapsed, setCollapsed] = useState(false)
  // 当前登录用户信息（本地保存）
  const user = getStoredUser()
  const displayName = user?.nickname || user?.username || '用户'

  // 根据当前路径计算选中的菜单项
  const selectedKey = useMemo(() => {
    const path = location.pathname
    if (path === '/') return '/'
    const matched = MENU_ITEMS?.find((item) => {
      const key = item?.key as string
      return key !== '/' && path.startsWith(key)
    })
    return (matched?.key as string) ?? '/'
  }, [location.pathname])

  /** 菜单点击：跳转到对应路由 */
  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key)
  }

  /** 退出登录：清除登录态并跳回登录页 */
  const handleLogout = () => {
    clearAuth()
    message.success('已退出登录')
    navigate('/login', { replace: true })
  }

  /** 用户下拉菜单项 */
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'logout',
      label: '退出登录',
      icon: <LogoutOutlined />,
      onClick: handleLogout,
    },
  ]

  return (
    <Layout className="main-layout">
      {/* 左侧菜单栏 */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        className="main-layout__sider"
      >
        {/* 顶部品牌区 */}
        <div className="main-layout__brand">
          <BrandLogo size={34} />
          {!collapsed && (
            <div className="main-layout__brand-text">
              <div className="main-layout__brand-name">心智协同</div>
              <div className="main-layout__brand-sub">合同协作系统</div>
            </div>
          )}
        </div>

        {/* 菜单 */}
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={MENU_ITEMS}
          onClick={handleMenuClick}
          className="main-layout__menu"
        />
      </Sider>

      {/* 右侧区域 */}
      <Layout>
        {/* 顶部：系统名称 + 用户登录状态 */}
        <Header className="main-layout__header">
          <Typography.Text className="main-layout__header-title">
            心智协同合同协作与业务管理系统
          </Typography.Text>

          <Space size="small">
            <Avatar
              size={32}
              icon={<UserOutlined />}
              style={{ backgroundColor: '#00b96b' }}
            />
            <span className="main-layout__header-user">{displayName}</span>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <DownOutlined className="main-layout__header-caret" />
            </Dropdown>
          </Space>
        </Header>

        {/* 内容区 */}
        <Content className="main-layout__content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
