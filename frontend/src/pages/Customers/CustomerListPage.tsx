import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Button, Card, Form, Input, Modal, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, TeamOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { createCustomer, getCustomerList } from '../../api/customerApi'
import type { Customer } from '../../types/customer'
import './customer-list.css'

/**
 * 客户列表页：搜索、新建客户、进入客户详情。
 */
export default function CustomerListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
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

  /** 新建客户并跳转详情 */
  const handleCreate = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      const customer = await createCustomer(values)
      message.success('客户创建成功')
      setCreateOpen(false)
      form.resetFields()
      navigate(`/customers/${customer.id}`)
    } finally {
      setSubmitting(false)
    }
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
  ]

  return (
    <div className="customer-list">
      <Card
        title="客户管理"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建客户
          </Button>
        }
      >
        <Input.Search
          placeholder="搜索客户名称或电话"
          allowClear
          style={{ width: 280, marginBottom: 16 }}
          onSearch={(v) => {
            setKeyword(v)
            setPage(1)
          }}
        />
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
      </Card>

      <Modal
        title="新建客户"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={submitting}
        destroyOnHidden
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
            rules={[{ required: true, message: '请输入联系电话' }]}
          >
            <Input maxLength={32} />
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
