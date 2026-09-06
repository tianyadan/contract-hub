import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Button, Card, Empty, Form, Input, Modal, Pagination, Space, Spin, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DeleteOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { createCustomer, deleteCustomer, getCustomerList } from '../../api/customerApi'
import type { Customer } from '../../types/customer'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { normalizePhoneDigits, phoneFormRules } from '../../utils/phone'
import '../../styles/mobile-list.css'
import './customer-list.css'

/**
 * 客户列表页：搜索、新建客户、进入客户详情。
 * 手机端用卡片列表，桌面端保留 Table。
 */
export default function CustomerListPage() {
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [form] = Form.useForm()

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getCustomerList({ page, page_size: pageSize, keyword: keyword || undefined })
      setData(res.list)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword])

  useEffect(() => {
    loadList()
  }, [loadList])

  /** 新建客户并跳转详情（手机号归一化为 11 位数字） */
  const handleCreate = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      const customer = await createCustomer({
        ...values,
        phone: normalizePhoneDigits(values.phone),
      })
      message.success('客户创建成功')
      setCreateOpen(false)
      form.resetFields()
      navigate(`/customers/${customer.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  /** 删除客户：确认后级联删除名下全部合同 */
  const handleDelete = (record: Customer) => {
    modal.confirm({
      title: `确认删除客户「${record.customer_name}」？`,
      content:
        '将同时删除该客户下的全部合同（含协作记录与归档文件），此操作不可恢复。若客户下暂无合同，则仅删除客户档案。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setDeletingId(record.id)
        try {
          const result = await deleteCustomer(record.id)
          message.success(
            result.deleted_contract_count > 0
              ? `客户已删除，并删除了 ${result.deleted_contract_count} 份合同`
              : '客户已删除',
          )
          await loadList()
        } finally {
          setDeletingId(null)
        }
      },
    })
  }

  const columns: ColumnsType<Customer> = [
    {
      title: '客户名称',
      dataIndex: 'customer_name',
      key: 'customer_name',
      render: (name: string, record) => (
        <Space>
          <TeamOutlined />
          <a onClick={() => navigate(`/customers/${record.id}`)}>{name}</a>
        </Space>
      ),
    },
    { title: '联系电话', dataIndex: 'phone', key: 'phone', width: 140 },
    { title: '联系地址', dataIndex: 'address', key: 'address', ellipsis: true },
    { title: '业务类型', dataIndex: 'business_type', key: 'business_type', width: 140 },
    {
      title: '创建时间',
      dataIndex: 'create_time',
      key: 'create_time',
      width: 170,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          danger
          size="small"
          icon={<DeleteOutlined />}
          loading={deletingId === record.id}
          onClick={() => handleDelete(record)}
        >
          删除
        </Button>
      ),
    },
  ]

  /** 手机端客户卡片 */
  const renderMobileList = () => (
    <Spin spinning={loading}>
      {data.length === 0 && !loading ? (
        <div className="mobile-card-list__empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无客户" />
        </div>
      ) : (
        <div className="mobile-card-list">
          {data.map((item) => (
            <div key={item.id} className="mobile-card-list__item">
              <div className="mobile-card-list__head">
                <TeamOutlined style={{ color: '#00a36a', fontSize: 18, marginTop: 2 }} />
                <Button
                  type="link"
                  className="mobile-card-list__title"
                  onClick={() => navigate(`/customers/${item.id}`)}
                >
                  {item.customer_name}
                </Button>
              </div>
              <div className="mobile-card-list__meta">
                <div className="mobile-card-list__meta-row">
                  <span className="mobile-card-list__label">电话</span>
                  <span className="mobile-card-list__value">{item.phone || '-'}</span>
                </div>
                {item.business_type ? (
                  <div className="mobile-card-list__meta-row">
                    <span className="mobile-card-list__label">业务</span>
                    <span className="mobile-card-list__value">{item.business_type}</span>
                  </div>
                ) : null}
                {item.address ? (
                  <div className="mobile-card-list__meta-row">
                    <span className="mobile-card-list__label">地址</span>
                    <span className="mobile-card-list__value">{item.address}</span>
                  </div>
                ) : null}
                <div className="mobile-card-list__meta-row">
                  <span className="mobile-card-list__label">创建</span>
                  <span className="mobile-card-list__value">
                    {dayjs(item.create_time).format('YYYY-MM-DD HH:mm')}
                  </span>
                </div>
              </div>
              <div className="mobile-card-list__actions">
                <Button type="link" size="small" onClick={() => navigate(`/customers/${item.id}`)}>
                  查看
                </Button>
                <Button
                  type="link"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  loading={deletingId === item.id}
                  onClick={() => handleDelete(item)}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {total > 0 ? (
        <div className="mobile-card-list__pagination">
          <Pagination
            size="small"
            current={page}
            pageSize={pageSize}
            total={total}
            simple
            onChange={(p, ps) => {
              setPage(p)
              setPageSize(ps)
            }}
          />
        </div>
      ) : null}
    </Spin>
  )

  return (
    <div className={`customer-list${isMobile ? ' customer-list--mobile' : ''}`}>
      <Card
        title="客户管理"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {isMobile ? '新建' : '新建客户'}
          </Button>
        }
      >
        <Input.Search
          className="customer-list__search"
          placeholder="搜索客户名称或电话"
          allowClear
          onSearch={(v) => {
            setKeyword(v)
            setPage(1)
          }}
        />
        {isMobile ? (
          renderMobileList()
        ) : (
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={{
              current: page,
              pageSize,
              total,
              onChange: (p, ps) => {
                setPage(p)
                setPageSize(ps)
              },
            }}
          />
        )}
      </Card>

      <Modal
        title="新建客户"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={submitting}
        destroyOnHidden
        width={isMobile ? '100%' : undefined}
        style={isMobile ? { top: 16, maxWidth: 'calc(100vw - 24px)' } : undefined}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="customer_name"
            label="客户名称"
            rules={[{ required: true, message: '请输入客户名称' }]}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item
            name="phone"
            label="联系电话"
            rules={phoneFormRules}
            extra="须为 11 位大陆手机号，用于合同分享身份校验"
          >
            <Input placeholder="例如 13800138000" maxLength={20} inputMode="numeric" />
          </Form.Item>
          <Form.Item name="address" label="联系地址">
            <Input maxLength={500} />
          </Form.Item>
          <Form.Item name="business_type" label="业务类型">
            <Input placeholder="前期文本输入，后期改为枚举" maxLength={128} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
