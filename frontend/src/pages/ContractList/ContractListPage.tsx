import { useCallback, useEffect, useState } from 'react'
import type { Key } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Form, Input, Modal, Select, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  DeleteOutlined,
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShareAltOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  batchDeleteContracts,
  deleteContract,
  getContractList,
} from '../../api/contractApi'
import type { ContractListItem } from '../../types/contract'
import { CONTRACT_STATUS_CONFIG, CONTRACT_STATUS_ORDER } from '../../utils/contract'
import ContractStatusTag from '../../components/ContractStatusTag'
import DocxIcon from '../../components/DocxIcon'
import ContractImportModal from '../../components/contract/ContractImportModal'
import ContractShareModal from '../../components/contract/ContractShareModal'
import { getMessageApi } from '../../utils/message'
import './contract-list.css'

/** 列表查询表单字段 */
interface ListQueryValues {
  keyword?: string
  status?: number
  customer_name?: string
}

/**
 * 合同管理列表页。
 * 顶部搜索区 + 导入合同入口，中部为分页合同表格，操作列支持查看 / 分享。
 */
export default function ContractListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm<ListQueryValues>()

  // 列表数据
  const [list, setList] = useState<ContractListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  // 查询条件
  const [query, setQuery] = useState<{ page: number; page_size: number } & ListQueryValues>({
    page: 1,
    page_size: 10,
  })
  // 弹窗状态
  const [importOpen, setImportOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<ContractListItem | null>(null)

  // 首页统计卡片跳转带 status 参数时，初始化状态筛选
  useEffect(() => {
    const statusStr = searchParams.get('status')
    if (statusStr !== null && statusStr !== '') {
      const status = Number(statusStr)
      form.setFieldsValue({ status })
      setQuery((q) => ({ ...q, page: 1, status }))
    }
  }, [searchParams, form])

  /** 拉取合同列表 */
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getContractList(query)
      setList(result.list)
      setTotal(result.total)
      setSelectedRowKeys((keys) => {
        const currentPageIDs = new Set(result.list.map((item) => item.id))
        return keys.filter((key) => currentPageIDs.has(Number(key)))
      })
    } catch {
      // 错误提示已在请求拦截器统一处理
    } finally {
      setLoading(false)
    }
  }, [query])

  // 查询条件变化时重新拉取
  useEffect(() => {
    fetchList()
  }, [fetchList])

  /** 点击查询：重置到第一页并应用筛选 */
  const handleSearch = () => {
    const values = form.getFieldsValue()
    setQuery((q) => ({ ...q, page: 1, ...values }))
  }

  /** 点击重置：清空筛选条件 */
  const handleReset = () => {
    form.resetFields()
    setQuery({ page: 1, page_size: 10 })
  }

  /** 表格分页变化 */
  const handlePageChange = (page: number, pageSize: number) => {
    setQuery((q) => ({ ...q, page, page_size: pageSize }))
  }

  /** 删除成功后刷新当前页；当当前页清空时回退到上一页，避免出现空白页。 */
  const refreshAfterDelete = (deletedCount: number) => {
    setSelectedRowKeys([])
    setQuery((q) => {
      const shouldBackPrevPage = q.page > 1 && list.length <= deletedCount
      return { ...q, page: shouldBackPrevPage ? q.page - 1 : q.page }
    })
  }

  /** 单个删除合同。 */
  const handleDelete = (record: ContractListItem) => {
    Modal.confirm({
      title: '确认删除合同？',
      content: `删除后将移除「${record.contract_name}」及其版本、变更、分享等关联数据，此操作不可恢复。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        setDeleting(true)
        try {
          await deleteContract(record.id)
          getMessageApi().success('合同删除成功')
          refreshAfterDelete(1)
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  /** 批量删除选中的合同。 */
  const handleBatchDelete = () => {
    const selectedIDs = selectedRowKeys.map((key) => Number(key)).filter((id) => id > 0)
    if (selectedIDs.length === 0) {
      getMessageApi().warning('请先选择要删除的合同')
      return
    }

    Modal.confirm({
      title: `确认删除 ${selectedIDs.length} 份合同？`,
      content: '批量删除会同时移除所选合同的版本、变更、分享等关联数据，此操作不可恢复。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        setDeleting(true)
        try {
          await batchDeleteContracts(selectedIDs)
          getMessageApi().success('合同批量删除成功')
          refreshAfterDelete(selectedIDs.length)
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  /** 表格列配置 */
  const columns: ColumnsType<ContractListItem> = [
    {
      title: '合同名称',
      dataIndex: 'contract_name',
      key: 'contract_name',
      ellipsis: true,
      render: (name: string, record) => (
        <div className="contract-list__name">
          <DocxIcon size={20} />
          <a onClick={() => navigate(`/contracts/${record.id}`)}>{name}</a>
        </div>
      ),
    },
    {
      title: '合同编号',
      dataIndex: 'contract_no',
      key: 'contract_no',
      width: 180,
      ellipsis: true,
      render: (no: string) => <span className="contract-list__no">{no}</span>,
    },
    {
      title: '客户名称',
      dataIndex: 'customer_name',
      key: 'customer_name',
      width: 170,
      ellipsis: true,
      render: (name: string) => name || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: number) => <ContractStatusTag status={status} />,
    },
    {
      title: '版本号',
      dataIndex: 'current_version_no',
      key: 'current_version_no',
      width: 90,
      align: 'center' as const,
      render: (no: number) => `V${no}`,
    },
    {
      title: '最近编辑时间',
      dataIndex: 'update_time',
      key: 'update_time',
      width: 170,
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/contracts/${record.id}`)}
          >
            查看
          </Button>
          <Button
            type="link"
            size="small"
            icon={<ShareAltOutlined />}
            onClick={() => setShareTarget(record)}
          >
            分享
          </Button>
          <Button
            danger
            type="link"
            size="small"
            icon={<DeleteOutlined />}
            disabled={deleting}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="contract-list">
      {/* 页面标题 */}
      <div className="contract-list__header">
        <div>
          <h3 className="contract-list__title">合同管理</h3>
          <span className="contract-list__subtitle">共 {total} 份合同</span>
        </div>
        <Button
          type="primary"
          icon={<UploadOutlined />}
          onClick={() => setImportOpen(true)}
        >
          导入合同
        </Button>
      </div>

      {/* 搜索区 */}
      <Card className="contract-list__search">
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item name="keyword">
            <Input
              placeholder="合同名称 / 编号"
              allowClear
              prefix={<SearchOutlined />}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item name="status">
            <Select
              placeholder="合同状态"
              allowClear
              style={{ width: 140 }}
              options={CONTRACT_STATUS_ORDER.map((s) => ({
                value: s,
                label: CONTRACT_STATUS_CONFIG[s].label,
              }))}
            />
          </Form.Item>
          <Form.Item name="customer_name">
            <Input placeholder="客户名称" allowClear style={{ width: 160 }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                查询
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* 合同表格 */}
      <Card className="contract-list__table">
        <div className="contract-list__table-toolbar">
          <span className="contract-list__selection-info">
            已选择 {selectedRowKeys.length} 份合同
          </span>
          <Button
            danger
            icon={<DeleteOutlined />}
            disabled={selectedRowKeys.length === 0}
            loading={deleting}
            onClick={handleBatchDelete}
          >
            批量删除
          </Button>
        </div>
        <Table<ContractListItem>
          rowKey="id"
          rowSelection={{
            selectedRowKeys,
            preserveSelectedRowKeys: false,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
          columns={columns}
          dataSource={list}
          loading={loading || deleting}
          pagination={{
            current: query.page,
            pageSize: query.page_size,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: handlePageChange,
          }}
          scroll={{ x: 1160 }}
        />
      </Card>

      {/* 导入合同弹窗 */}
      <ContractImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => {
          // 导入成功后刷新列表
          setQuery((q) => ({ ...q, page: 1 }))
        }}
      />

      {/* 分享弹窗 */}
      {shareTarget && (
        <ContractShareModal
          contractId={shareTarget.id}
          contractName={shareTarget.contract_name}
          open={Boolean(shareTarget)}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  )
}
