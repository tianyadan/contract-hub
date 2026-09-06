import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  App,
  Avatar,
  Button,
  Drawer,
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
  MenuOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import BrandLogo from '../components/BrandLogo'
import { useIsMobile } from '../hooks/useMediaQuery'
import { clearAuth, getStoredUser } from '../utils/token'
import './main-layout.css'

const { Header, Sider, Content } = Layout

/** 左侧菜单配置 */
const MENU_ITEMS: MenuProps['items'] = [
  { key: '/', label: '首页', icon: <HomeOutlined /> },
  { key: '/customers', label: '客户管理', icon: <TeamOutlined /> },
  { key: '/templates', label: '模板池', icon: <FolderOpenOutlined /> },
  { key: '/contracts', label: '合同管理', icon: <FileTextOutlined /> },
  {
    key: '/settings',
    label: '合同设置',
    icon: <SettingOutlined />,
    children: [
      { key: '/settings/watermark', label: '导出水印' },
      { key: '/settings/seal', label: '电子章' },
    ],
  },
  { key: '/statistics', label: '数据统计', icon: <BarChartOutlined /> },
]

/**
 * 管理系统主布局。
 * 桌面：左侧可折叠菜单；手机：汉堡菜单 + Drawer，内容区全宽。
 */
export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = App.useApp()
  const isMobile = useIsMobile()
  // 桌面侧边栏折叠
  const [collapsed, setCollapsed] = useState(false)
  // 手机抽屉导航
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 子菜单展开 keys
  const [openKeys, setOpenKeys] = useState<string[]>(() =>
    location.pathname.startsWith('/settings') ? ['/settings'] : [],
  )
  const user = getStoredUser()
  const displayName = user?.nickname || user?.username || '用户'

  /** 合同/模板详情：内容区收窄边距，给编辑器更多宽度 */
  const isEditorRoute =
    /^\/contracts\/\d+/.test(location.pathname) || /^\/templates\/\d+/.test(location.pathname)

  const selectedKey = useMemo(() => {
    const path = location.pathname
    if (path === '/') return '/'
    if (path.startsWith('/settings')) {
      return path === '/settings' ? '/settings/watermark' : path
    }
    const matched = MENU_ITEMS?.find((item) => {
      const key = item?.key as string
      return key !== '/' && path.startsWith(key)
    })
    return (matched?.key as string) ?? '/'
  }, [location.pathname])

  useEffect(() => {
    if (location.pathname.startsWith('/settings')) {
      setOpenKeys((prev) => (prev.includes('/settings') ? prev : [...prev, '/settings']))
    }
  }, [location.pathname])

  // 切到桌面时关闭抽屉
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false)
  }, [isMobile])

  /** 菜单点击：跳转并在手机上关闭抽屉 */
  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === '/settings') return
    navigate(key)
    if (isMobile) setDrawerOpen(false)
  }

  const handleLogout = () => {
    clearAuth()
    message.success('已退出登录')
    navigate('/login', { replace: true })
  }

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'logout',
      label: '退出登录',
      icon: <LogoutOutlined />,
      onClick: handleLogout,
    },
  ]

  /** 侧栏/抽屉内的品牌 + 菜单 */
  const navBody = (
    <>
      <div className="main-layout__brand">
        <BrandLogo size={34} />
        {(isMobile || !collapsed) && (
          <div className="main-layout__brand-text">
            <div className="main-layout__brand-name">心智协同</div>
            <div className="main-layout__brand-sub">合同协作系统</div>
          </div>
        )}
      </div>
      <Menu
        theme="light"
        mode="inline"
        selectedKeys={[selectedKey]}
        openKeys={openKeys}
        onOpenChange={setOpenKeys}
        items={MENU_ITEMS}
        onClick={handleMenuClick}
        className="main-layout__menu"
      />
    </>
  )

  return (
    <Layout
      className={[
        'main-layout',
        isMobile ? 'main-layout--mobile' : '',
        isEditorRoute ? 'main-layout--editor' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!isMobile ? (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={220}
          className="main-layout__sider"
        >
          {navBody}
        </Sider>
      ) : (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={280}
          styles={{ body: { padding: 0 } }}
          className="main-layout__drawer"
          title={null}
          closable={false}
        >
          {navBody}
        </Drawer>
      )}

      <Layout>
        <Header className="main-layout__header">
          <div className="main-layout__header-left">
            {isMobile ? (
              <Button
                type="text"
                className="main-layout__menu-btn"
                icon={<MenuOutlined />}
                aria-label="打开菜单"
                onClick={() => setDrawerOpen(true)}
              />
            ) : null}
            {isMobile ? <BrandLogo size={28} /> : null}
            <Typography.Text className="main-layout__header-title" ellipsis>
              {isMobile ? '合同协作' : '心智协同合同协作与业务管理系统'}
            </Typography.Text>
          </div>

          <Space size="small">
            <Avatar size={32} icon={<UserOutlined />} style={{ backgroundColor: '#00b96b' }} />
            {!isMobile ? <span className="main-layout__header-user">{displayName}</span> : null}
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <DownOutlined className="main-layout__header-caret" />
            </Dropdown>
          </Space>
        </Header>

        <Content className="main-layout__content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
