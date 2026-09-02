import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  App,
  Card,
  Empty,
  Skeleton,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckCircleOutlined,
  CheckSquareOutlined,
  InboxOutlined,
  ShareAltOutlined,
  StopOutlined,
  SyncOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { getContractList } from '../../api/contractApi'
import { getCustomerList } from '../../api/customerApi'
import { getTemplateList } from '../../api/templateApi'
import type { ContractListItem } from '../../types/contract'
import { CONTRACT_STATUS_CONFIG, CONTRACT_STATUS_ORDER } from '../../utils/contract'
import ContractStatusTag from '../../components/ContractStatusTag'
import DocxIcon from '../../components/DocxIcon'
import StatCard from '../../components/StatCard'
import { getStoredUser } from '../../utils/token'
import './home.css'

/** 各状态对应的统计图标 */
const STATUS_ICONS: Record<number, React.ReactNode> = {
  0: <InboxOutlined />,
  1: <ShareAltOutlined />,
  2: <SyncOutlined />,
  3: <CheckCircleOutlined />,
  4: <CheckSquareOutlined />,
  5: <StopOutlined />,
}

/**
 * 首页（工作台）。
 * 顶部展示各状态合同数量统计卡片，下方展示最近编辑的合同列表。
 */
export default function HomePage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  // 合同列表数据（一次拉取最多 100 条，前端统计与排序）
  const [contracts, setContracts] = useState<ContractListItem[]>([])
  const [customerTotal, setCustomerTotal] = useState(0)
  const [templateTotal, setTemplateTotal] = useState(0)
  // 数据加载状态
  const [loading, setLoading] = useState(true)
  const user = getStoredUser()
  const displayName = user?.nickname || user?.username || '用户'

  /** 最近合同表格列配置（点击合同名进入详情） */
  const recentColumns: ColumnsType<ContractListItem> = [
    {
      title: '合同名称',
      dataIndex: 'contract_name',
      key: 'contract_name',
      ellipsis: true,
      // 合同名称前加 DOCX 图标，点击进入详情页
      render: (name: string, record) => (
        <div className="home-recent__name">
          <DocxIcon size={20} />
          <a onClick={() => navigate(`/contracts/${record.id}`)}>{name}</a>
          <span className="home-recent__no">{record.contract_no}</span>
        </div>
      ),
    },
    {
      title: '客户名称',
      dataIndex: 'customer_name',
      key: 'customer_name',
      width: 180,
      ellipsis: true,
      render: (name: string) => name || '-',
    },
    {
      title: '最近编辑时间',
      dataIndex: 'update_time',
      key: 'update_time',
      width: 180,
      // 时间格式化为 YYYY-MM-DD HH:mm
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: number) => <ContractStatusTag status={status} />,
    },
  ]

  /** 跳转到合同列表并筛选指定状态 */
  const goContractListByStatus = (status?: number) => {
    if (status === undefined) {
      navigate('/contracts')
    } else {
      navigate(`/contracts?status=${status}`)
    }
  }

  // 拉取合同列表，统计各状态数量
  useEffect(() => {
    let cancelled = false
    Promise.all([
      getContractList({ page: 1, page_size: 100 }),
      getCustomerList({ page: 1, page_size: 1 }),
      getTemplateList({ page: 1, page_size: 1 }),
    ])
      .then(([contractRes, customerRes, templateRes]) => {
        if (!cancelled) {
          setContracts(contractRes.list)
          setCustomerTotal(customerRes.total)
          setTemplateTotal(templateRes.total)
        }
      })
      .catch(() => {
        // 错误提示已在请求拦截器统一处理
        if (!cancelled) message.error('合同数据加载失败，请稍后重试')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [message])

  /** 各状态合同数量统计 */
  const statusCounts = useMemo(() => {
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    contracts.forEach((c) => {
      if (counts[c.status] !== undefined) counts[c.status] += 1
    })
    return counts
  }, [contracts])

  /** 最近编辑的合同：按更新时间倒序取前 6 条 */
  const recentContracts = useMemo(() => {
    return [...contracts]
      .sort((a, b) => dayjs(b.update_time).valueOf() - dayjs(a.update_time).valueOf())
      .slice(0, 6)
  }, [contracts])

  return (
    <div className="home">
      {/* 页面标题 */}
      <div className="home__header">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            首页
          </Typography.Title>
          <Typography.Text type="secondary">
            你好，{displayName}，欢迎回到心智协同合同协作系统
          </Typography.Text>
        </div>
      </div>

      {/* 业务概览 */}
      <div className="home__stats home__stats--overview">
        <StatCard
          title="客户总数"
          value={customerTotal}
          color="#1677ff"
          softColor="rgba(22,119,255,0.12)"
          icon={<TeamOutlined />}
          onClick={() => navigate('/customers')}
        />
        <StatCard
          title="模板总数"
          value={templateTotal}
          color="#722ed1"
          softColor="rgba(114,46,209,0.12)"
          icon={<FolderOpenOutlined />}
          onClick={() => navigate('/templates')}
        />
      </div>

      {/* 合同数量统计卡片 */}
      <div className="home__stats">
        {/* 合同总数（品牌渐变卡片，点击进入合同列表） */}
        <StatCard
          featured
          title="合同总数"
          value={contracts.length}
          color="#ffffff"
          softColor="rgba(255,255,255,0.22)"
          icon={<FileTextOutlined />}
          onClick={() => goContractListByStatus()}
        />
        {/* 各状态数量卡片（点击按状态筛选合同列表） */}
        {CONTRACT_STATUS_ORDER.map((status) => {
          const config = CONTRACT_STATUS_CONFIG[status]
          return (
            <StatCard
              key={status}
              title={config.label}
              value={statusCounts[status] ?? 0}
              color={config.color}
              softColor={config.softColor}
              icon={STATUS_ICONS[status]}
              onClick={() => goContractListByStatus(status)}
            />
          )
        })}
      </div>

      {/* 最近合同区域 */}
      <Card
        className="home__recent"
        title={
          <span className="home__recent-title">
            <DocxIcon size={18} />
            最近合同
          </span>
        }
        extra={
          <Typography.Link onClick={() => navigate('/contracts')}>
            查看全部
          </Typography.Link>
        }
      >
        {loading ? (
          // 加载中骨架屏
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : recentContracts.length === 0 ? (
          // 空数据状态
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无合同，去合同管理页创建合同吧"
          />
        ) : (
          <Table<ContractListItem>
            rowKey="id"
            columns={recentColumns}
            dataSource={recentContracts}
            pagination={false}
            size="middle"
            scroll={{ x: 640 }}
          />
        )}
      </Card>
    </div>
  )
}
