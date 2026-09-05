import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, EditOutlined, FileAddOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  createContractFromTemplate,
  getCustomerContracts,
  getCustomerDetail,
  updateCustomer,
} from '../../api/customerApi'
import { getTemplateList } from '../../api/templateApi'
import type { Customer } from '../../types/customer'
import type { ContractListItem } from '../../types/contract'
import type { TemplateListItem } from '../../types/template'
import ContractStatusTag from '../../components/ContractStatusTag'
import { isValidCnMobile, normalizePhoneDigits, phoneFormRules } from '../../utils/phone'
import './customer-detail.css'

/**
 * 客户详情页：客户档案 + 合同列表 + 从模板添加合同。
 */
export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const customerId = Number(id)
  const navigate = useNavigate()
  const { message } = App.useApp()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [contracts, setContracts] = useState<ContractListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [addContractOpen, setAddContractOpen] = useState(false)
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [form] = Form.useForm()
  const [contractForm] = Form.useForm<{ template_id: number; contract_name?: string }>()

  const loadData = useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    try {
      const [cust, contractRes] = await Promise.all([
        getCustomerDetail(customerId),
        getCustomerContracts(customerId, { page: 1, page_size: 100 }),
      ])
      setCustomer(cust)
      setContracts(contractRes.list)
      form.setFieldsValue(cust)
    } catch {
      message.error('客户加载失败')
    } finally {
      setLoading(false)
    }
  }, [customerId, form, message])

  useEffect(() => {
    loadData()
  }, [loadData])

  /** 打开添加合同弹窗时加载模板列表，并校验客户手机号可用于分享 */
  const openAddContract = async () => {
    if (!customer?.phone || !isValidCnMobile(customer.phone)) {
      message.warning('当前客户手机号不是 11 位大陆手机号，请先编辑客户资料后再创建合同，否则无法分享')
      return
    }
    const res = await getTemplateList({ page: 1, page_size: 100 })
    if (res.list.length === 0) {
      message.warning('请先在模板池上传合同模板')
      return
    }
    setTemplates(res.list)
    contractForm.resetFields()
    setAddContractOpen(true)
  }

  /** 从模板创建合同 */
  const handleCreateContract = async () => {
    const values = await contractForm.validateFields()
    const result = await createContractFromTemplate(customerId, values)
    message.success('合同创建成功')
    setAddContractOpen(false)
    navigate(`/contracts/${result.contract_id}`)
  }

  /** 保存客户信息（手机号归一化为 11 位数字） */
  const handleUpdateCustomer = async () => {
    const values = await form.validateFields()
    const updated = await updateCustomer(customerId, {
      ...values,
      phone: normalizePhoneDigits(values.phone),
    })
    setCustomer(updated)
    setEditOpen(false)
    message.success('客户信息已更新')
  }

  const contractColumns: ColumnsType<ContractListItem> = [
    {
      title: '合同名称',
      dataIndex: 'contract_name',
      key: 'contract_name',
      render: (name: string, record) => (
        <a onClick={() => navigate(`/contracts/${record.id}`)}>{name}</a>
      ),
    },
    { title: '合同编号', dataIndex: 'contract_no', key: 'contract_no', width: 160 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: number) => <ContractStatusTag status={status} />,
    },
    {
      title: '版本',
      dataIndex: 'current_version_no',
      key: 'current_version_no',
      width: 80,
      render: (v: number) => `V${v}`,
    },
    {
      title: '创建时间',
      dataIndex: 'create_time',
      key: 'create_time',
      width: 170,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
  ]

  if (!customer && loading) {
    return <Card loading style={{ maxWidth: 1200, margin: '0 auto' }} />
  }

  return (
    <div className="customer-detail">
      <div className="customer-detail__header">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')}>
          返回客户列表
        </Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {customer?.customer_name}
        </Typography.Title>
        <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
          编辑客户
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="客户信息">
            <Descriptions column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="客户名称">{customer?.customer_name}</Descriptions.Item>
              <Descriptions.Item label="联系电话">{customer?.phone}</Descriptions.Item>
              <Descriptions.Item label="联系地址">{customer?.address || '-'}</Descriptions.Item>
              <Descriptions.Item label="业务类型">{customer?.business_type || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col span={24}>
          <Card
            title="客户合同"
            extra={
              <Button type="primary" icon={<FileAddOutlined />} onClick={openAddContract}>
                添加合同
              </Button>
            }
          >
            <Table
              rowKey="id"
              loading={loading}
              columns={contractColumns}
              dataSource={contracts}
              pagination={false}
              locale={{ emptyText: '暂无合同，请从模板池添加' }}
            />
          </Card>
        </Col>
      </Row>

      <Modal title="编辑客户" open={editOpen} onCancel={() => setEditOpen(false)} onOk={handleUpdateCustomer}>
        <Form form={form} layout="vertical">
          <Form.Item name="customer_name" label="客户名称" rules={[{ required: true }]}>
            <Input />
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
            <Input />
          </Form.Item>
          <Form.Item name="business_type" label="业务类型">
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="从模板添加合同"
        open={addContractOpen}
        onCancel={() => setAddContractOpen(false)}
        onOk={handleCreateContract}
        destroyOnHidden
      >
        <Form form={contractForm} layout="vertical">
          <Form.Item
            name="template_id"
            label="选择模板"
            rules={[{ required: true, message: '请选择合同模板' }]}
          >
            <Select
              placeholder="从模板池选择"
              options={templates.map((t) => ({
                value: t.id,
                label: `${t.template_name} (V${t.current_version_no})`,
              }))}
            />
          </Form.Item>
          <Form.Item name="contract_name" label="合同名称（选填）">
            <Input placeholder={`默认：模板名 - ${customer?.customer_name}`} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
