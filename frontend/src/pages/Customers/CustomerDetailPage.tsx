import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, FileAddOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  createContractFromTemplate,
  deleteCustomer,
  getCustomerContracts,
  getCustomerDetail,
  updateCustomer,
} from '../../api/customerApi'
import { getTemplateList } from '../../api/templateApi'
import type { Customer } from '../../types/customer'
import type { ContractListItem } from '../../types/contract'
import type { TemplateListItem } from '../../types/template'
import ContractStatusTag from '../../components/ContractStatusTag'
import DocxIcon from '../../components/DocxIcon'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { isValidCnMobile, normalizePhoneDigits, phoneFormRules } from '../../utils/phone'
import '../../styles/mobile-list.css'
import './customer-detail.css'

/**
 * 客户详情页：客户档案 + 合同列表 + 从模板添加合同。
 * 手机端合同列表用卡片，桌面端保留 Table。
 */
export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const customerId = Number(id)
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const isMobile = useIsMobile()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [contracts, setContracts] = useState<ContractListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
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

  /** 删除客户：确认后级联删除名下全部合同并返回列表 */
  const handleDeleteCustomer = () => {
    if (!customer) return
    const contractCount = contracts.length
    modal.confirm({
      title: `确认删除客户「${customer.customer_name}」？`,
      content:
        contractCount > 0
          ? `该客户下现有 ${contractCount} 份合同，删除后将一并删除这些合同及相关协作数据，此操作不可恢复。`
          : '将删除该客户档案。若之后关联有合同，也会一并删除，此操作不可恢复。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setDeleting(true)
        try {
          const result = await deleteCustomer(customerId)
          message.success(
            result.deleted_contract_count > 0
              ? `客户已删除，并删除了 ${result.deleted_contract_count} 份合同`
              : '客户已删除',
          )
          navigate('/customers')
        } finally {
          setDeleting(false)
        }
      },
    })
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

  /** 手机端客户合同卡片 */
  const renderContractMobileList = () => (
    <Spin spinning={loading}>
      {contracts.length === 0 && !loading ? (
        <div className="mobile-card-list__empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无合同，请从模板池添加" />
        </div>
      ) : (
        <div className="mobile-card-list">
          {contracts.map((item) => (
            <div
              key={item.id}
              className="mobile-card-list__item"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/contracts/${item.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(`/contracts/${item.id}`)
                }
              }}
            >
              <div className="mobile-card-list__head">
                <DocxIcon size={22} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="mobile-card-list__title">{item.contract_name}</p>
                  <div className="mobile-card-list__meta" style={{ marginTop: 4 }}>
                    <ContractStatusTag status={item.status} />
                    <span className="mobile-card-list__value">V{item.current_version_no}</span>
                  </div>
                </div>
              </div>
              <div className="mobile-card-list__meta">
                <div className="mobile-card-list__meta-row">
                  <span className="mobile-card-list__label">编号</span>
                  <span className="mobile-card-list__value">{item.contract_no}</span>
                </div>
                <div className="mobile-card-list__meta-row">
                  <span className="mobile-card-list__label">创建</span>
                  <span className="mobile-card-list__value">
                    {dayjs(item.create_time).format('YYYY-MM-DD HH:mm')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Spin>
  )

  if (!customer && loading) {
    return <Card loading style={{ maxWidth: 1200, margin: '0 auto' }} />
  }

  return (
    <div className={`customer-detail${isMobile ? ' customer-detail--mobile' : ''}`}>
      <div className="customer-detail__header">
        <Button
          type={isMobile ? 'text' : 'default'}
          icon={<ArrowLeftOutlined />}
          aria-label="返回客户列表"
          onClick={() => navigate('/customers')}
        >
          {isMobile ? null : '返回客户列表'}
        </Button>
        <Typography.Title level={4} className="customer-detail__name" ellipsis>
          {customer?.customer_name}
        </Typography.Title>
        <Space wrap size="small">
          <Button
            icon={<EditOutlined />}
            size={isMobile ? 'small' : 'middle'}
            onClick={() => setEditOpen(true)}
          >
            {isMobile ? '编辑' : '编辑客户'}
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            size={isMobile ? 'small' : 'middle'}
            loading={deleting}
            onClick={handleDeleteCustomer}
          >
            {isMobile ? '删除' : '删除客户'}
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="客户信息" size={isMobile ? 'small' : 'default'}>
            <Descriptions column={1} size={isMobile ? 'small' : 'default'}>
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
            size={isMobile ? 'small' : 'default'}
            extra={
              <Button
                type="primary"
                icon={<FileAddOutlined />}
                size={isMobile ? 'small' : 'middle'}
                onClick={openAddContract}
              >
                {isMobile ? '添加' : '添加合同'}
              </Button>
            }
          >
            {isMobile ? (
              renderContractMobileList()
            ) : (
              <Table
                rowKey="id"
                loading={loading}
                columns={contractColumns}
                dataSource={contracts}
                pagination={false}
                locale={{ emptyText: '暂无合同，请从模板池添加' }}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="编辑客户"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleUpdateCustomer}
        width={isMobile ? '100%' : undefined}
        style={isMobile ? { top: 16, maxWidth: 'calc(100vw - 24px)' } : undefined}
      >
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
        width={isMobile ? '100%' : undefined}
        style={isMobile ? { top: 16, maxWidth: 'calc(100vw - 24px)' } : undefined}
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
