import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Space,
  Spin,
  Table,
  Upload,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd'
import { DeleteOutlined, EyeOutlined, InboxOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  deleteTemplate,
  getTemplateList,
  uploadTemplate,
} from '../../api/templateApi'
import type { TemplateListItem } from '../../types/template'
import DocxIcon from '../../components/DocxIcon'
import { useIsMobile } from '../../hooks/useMediaQuery'
import '../../styles/mobile-list.css'
import './template-list.css'

/**
 * 合同模板池列表页。
 * 支持上传 DOCX、分页列表、跳转详情预览。
 * 手机端用卡片列表，桌面端保留 Table。
 */
export default function TemplateListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<TemplateListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [keyword, setKeyword] = useState('')

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [form] = Form.useForm<{ template_name: string; description?: string }>()

  /** 加载模板列表 */
  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getTemplateList({ page, page_size: pageSize, keyword: keyword || undefined })
      setData(res.list)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword])

  useEffect(() => {
    loadList()
  }, [loadList])

  /** 打开上传弹窗时，用文件名预填模板名 */
  const handleFileChange = (info: { fileList: UploadFile[] }) => {
    setFileList(info.fileList.slice(-1))
    const file = info.fileList[0]?.originFileObj
    if (file && !form.getFieldValue('template_name')) {
      const name = file.name.replace(/\.docx$/i, '')
      form.setFieldsValue({ template_name: name })
    }
  }

  /** 提交上传 */
  const handleUpload = async () => {
    const values = await form.validateFields()
    if (fileList.length === 0 || !fileList[0].originFileObj) {
      message.warning('请选择 DOCX 文件')
      return
    }
    setUploading(true)
    try {
      const result = await uploadTemplate(
        fileList[0].originFileObj,
        values.template_name,
        values.description,
      )
      message.success('模板上传成功')
      setUploadOpen(false)
      form.resetFields()
      setFileList([])
      loadList()
      navigate(`/templates/${result.template_id}`)
    } finally {
      setUploading(false)
    }
  }

  /** 删除模板 */
  const handleDelete = async (id: number) => {
    await deleteTemplate(id)
    message.success('已删除')
    loadList()
  }

  const columns: ColumnsType<TemplateListItem> = [
    {
      title: '模板名称',
      dataIndex: 'template_name',
      key: 'template_name',
      render: (name: string, record) => (
        <Space>
          <DocxIcon size={20} />
          <a onClick={() => navigate(`/templates/${record.id}`)}>{name}</a>
        </Space>
      ),
    },
    {
      title: '原始文件名',
      dataIndex: 'original_file_name',
      key: 'original_file_name',
      ellipsis: true,
    },
    {
      title: '版本',
      dataIndex: 'current_version_no',
      key: 'current_version_no',
      width: 80,
      render: (v: number) => `V${v}`,
    },
    {
      title: '更新时间',
      dataIndex: 'update_time',
      key: 'update_time',
      width: 170,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/templates/${record.id}`)}
          >
            预览
          </Button>
          <Popconfirm title="确定删除该模板？" onConfirm={() => void handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  /** 手机端模板卡片 */
  const renderMobileList = () => (
    <Spin spinning={loading}>
      {data.length === 0 && !loading ? (
        <div className="mobile-card-list__empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无模板" />
        </div>
      ) : (
        <div className="mobile-card-list">
          {data.map((item) => (
            <div key={item.id} className="mobile-card-list__item">
              <div className="mobile-card-list__head">
                <DocxIcon size={22} />
                <Button
                  type="link"
                  className="mobile-card-list__title"
                  onClick={() => navigate(`/templates/${item.id}`)}
                >
                  {item.template_name}
                </Button>
              </div>
              <div className="mobile-card-list__meta">
                <div className="mobile-card-list__meta-row">
                  <span className="mobile-card-list__label">版本</span>
                  <span className="mobile-card-list__value">V{item.current_version_no}</span>
                </div>
                <div className="mobile-card-list__meta-row">
                  <span className="mobile-card-list__label">更新</span>
                  <span className="mobile-card-list__value">
                    {dayjs(item.update_time).format('YYYY-MM-DD HH:mm')}
                  </span>
                </div>
                {item.original_file_name ? (
                  <div className="mobile-card-list__meta-row">
                    <span className="mobile-card-list__label">文件</span>
                    <span className="mobile-card-list__value">{item.original_file_name}</span>
                  </div>
                ) : null}
              </div>
              <div className="mobile-card-list__actions">
                <Button
                  type="link"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => navigate(`/templates/${item.id}`)}
                >
                  预览
                </Button>
                <Popconfirm title="确定删除该模板？" onConfirm={() => void handleDelete(item.id)}>
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
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
            showSizeChanger
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
    <div className={`template-list${isMobile ? ' template-list--mobile' : ''}`}>
      <Card
        title="合同模板池"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setUploadOpen(true)}>
            {isMobile ? '上传' : '上传模板'}
          </Button>
        }
      >
        <Input.Search
          className="template-list__search"
          placeholder="搜索模板名称或文件名"
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
              showSizeChanger: true,
              onChange: (p, ps) => {
                setPage(p)
                setPageSize(ps)
              },
            }}
          />
        )}
      </Card>

      <Modal
        title="上传合同模板"
        open={uploadOpen}
        onCancel={() => setUploadOpen(false)}
        onOk={handleUpload}
        confirmLoading={uploading}
        destroyOnHidden
        width={isMobile ? '100%' : undefined}
        style={isMobile ? { top: 16, maxWidth: 'calc(100vw - 24px)' } : undefined}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="template_name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="默认取上传文件名" maxLength={255} />
          </Form.Item>
          <Form.Item name="description" label="模板说明">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
          <Form.Item label="DOCX 文件" required>
            <Upload.Dragger
              accept=".docx"
              maxCount={1}
              fileList={fileList}
              beforeUpload={(file) => {
                if (!file.name.toLowerCase().endsWith('.docx')) {
                  message.error('仅支持 .docx 文件')
                  return Upload.LIST_IGNORE
                }
                if (file.size > 20 * 1024 * 1024) {
                  message.error('文件不能超过 20MB')
                  return Upload.LIST_IGNORE
                }
                return false
              }}
              onChange={handleFileChange}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽 DOCX 到此处</p>
            </Upload.Dragger>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
