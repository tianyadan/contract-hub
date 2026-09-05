import { useState } from 'react'
import {
  App,
  Form,
  Input,
  Modal,
  Upload,
} from 'antd'
import type { UploadFile } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { createContract } from '../../api/contractApi'
import { normalizePhoneDigits, phoneFormRules } from '../../utils/phone'

/** 导入合同表单字段 */
interface ImportFormValues {
  /** 合同名称（必填） */
  contract_name: string
  /** 客户名称 */
  customer_name: string
  /** 客户联系人 */
  customer_contact?: string
  /** 客户联系电话 */
  customer_phone: string
  /** 合同备注 */
  description?: string
}

/** 导入合同弹窗属性 */
interface ContractImportModalProps {
  /** 是否打开 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 导入成功回调（父组件刷新列表） */
  onSuccess: () => void
}

/**
 * 导入合同弹窗。
 * 表单字段 + DOCX 上传（仅 .docx，限 20MB），
 * 提交到 POST /api/contracts（multipart/form-data），成功后刷新列表。
 */
export default function ContractImportModal({
  open,
  onClose,
  onSuccess,
}: ContractImportModalProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm<ImportFormValues>()
  // 提交 loading 状态
  const [submitting, setSubmitting] = useState(false)
  // 待上传文件列表
  const [fileList, setFileList] = useState<UploadFile[]>([])

  /** 校验上传文件：仅 .docx、不超过 20MB */
  const beforeUpload = (file: File) => {
    const isDocx = file.name.toLowerCase().endsWith('.docx')
    if (!isDocx) {
      message.error('仅支持上传 .docx 文件')
      return Upload.LIST_IGNORE
    }
    const isLt20M = file.size / 1024 / 1024 < 20
    if (!isLt20M) {
      message.error('文件大小不能超过 20MB')
      return Upload.LIST_IGNORE
    }
    // 阻止自动上传，由表单提交时统一处理
    return false
  }

  /** 提交导入：组装 FormData 调用创建合同接口 */
  const handleOk = async () => {
    try {
      // 校验表单字段
      const values = await form.validateFields()
      if (fileList.length === 0) {
        message.warning('请选择要上传的 DOCX 文件')
        return
      }

      setSubmitting(true)
      // 组装 multipart 表单
      const formData = new FormData()
      formData.append('contract_name', values.contract_name)
      formData.append('customer_name', values.customer_name)
      if (values.customer_contact) formData.append('customer_contact', values.customer_contact)
      formData.append('customer_phone', normalizePhoneDigits(values.customer_phone))
      if (values.description) formData.append('description', values.description)
      formData.append('file', fileList[0].originFileObj as File)

      await createContract(formData)
      message.success('合同导入成功')
      // 重置表单并关闭
      form.resetFields()
      setFileList([])
      onClose()
      onSuccess()
    } catch {
      // 表单校验失败或接口错误（拦截器已提示）
    } finally {
      setSubmitting(false)
    }
  }

  /** 关闭时重置表单状态 */
  const handleCancel = () => {
    form.resetFields()
    setFileList([])
    onClose()
  }

  return (
    <Modal
      title="导入合同"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={submitting}
      okText="开始导入"
      cancelText="取消"
      width={520}
    >
      <Form form={form} layout="vertical" className="contract-import-form">
        {/* 合同名称（必填） */}
        <Form.Item
          name="contract_name"
          label="合同名称"
          rules={[{ required: true, message: '请输入合同名称' }]}
        >
          <Input placeholder="请输入合同名称" maxLength={255} />
        </Form.Item>

        {/* 客户信息（选填） */}
        <Form.Item
          name="customer_name"
          label="客户名称"
          rules={[{ required: true, message: '请输入客户名称' }]}
        >
          <Input placeholder="请输入客户名称（分享门禁校验用）" />
        </Form.Item>
        <Form.Item name="customer_contact" label="客户联系人">
          <Input placeholder="请输入客户联系人（选填）" />
        </Form.Item>
        <Form.Item
          name="customer_phone"
          label="客户联系电话"
          rules={phoneFormRules}
          extra="须为 11 位大陆手机号，用于合同分享身份校验"
        >
          <Input placeholder="例如 13800138000" maxLength={20} inputMode="numeric" />
        </Form.Item>

        {/* 合同备注（选填） */}
        <Form.Item name="description" label="合同备注">
          <Input.TextArea placeholder="请输入合同备注（选填）" rows={2} maxLength={500} />
        </Form.Item>

        {/* DOCX 文件上传（必填） */}
        <Form.Item label="DOCX 文件" required>
          <Upload.Dragger
            accept=".docx"
            maxCount={1}
            fileList={fileList}
            beforeUpload={beforeUpload}
            onChange={({ fileList: list }) => setFileList(list.slice(-1))}
            onRemove={() => setFileList([])}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ color: '#00b96b' }} />
            </p>
            <p className="ant-upload-text">点击或拖拽 DOCX 文件到此处</p>
            <p className="ant-upload-hint">仅支持 .docx 格式，文件大小不超过 20MB</p>
          </Upload.Dragger>
        </Form.Item>
      </Form>
    </Modal>
  )
}
