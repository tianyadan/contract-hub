import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { App, Button, Card, Col, Form, Input, Modal, Row, Space, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, EditOutlined, HistoryOutlined, SaveOutlined } from '@ant-design/icons'
import { getTemplateDetail, saveTemplateContent, updateTemplateMeta } from '../../api/templateApi'
import {
  createTemplateFidelitySnapshot,
  fetchTemplateFidelitySnapshotPdf,
  getTemplateFidelitySnapshot,
  getTemplateFidelitySnapshots,
  rollbackTemplateFidelitySnapshot,
} from '../../api/fidelityApi'
import type { TemplateDetail } from '../../types/template'
import type { DocumentContent } from '../../types/contract'
import DocumentEditor, { type DocumentEditorHandle } from '../../components/contract/DocumentEditor'
import CollapsibleScrollSection from '../../components/contract/CollapsibleScrollSection'
import FidelityPdfViewer from '../../components/contract/FidelityPdfViewer'
import FidelitySnapshotList from '../../components/contract/FidelitySnapshotList'
import { useFidelitySnapshots } from '../../hooks/useFidelitySnapshots'
import { useWatermarkSetting } from '../../hooks/useWatermarkSetting'
import { normalizeDocumentContent, prepareSaveDocumentContent } from '../../utils/documentContent'
import '../ContractDetail/contract-detail.css'
import './template-detail.css'

/**
 * 模板池合同编辑页：与合同管理详情页共用同一 DocumentEditor 与 V3 网页画布规范。
 */
export default function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const templateId = Number(id)
  const navigate = useNavigate()
  const { message } = App.useApp()

  const [detail, setDetail] = useState<TemplateDetail | null>(null)
  const [documentContent, setDocumentContent] = useState<DocumentContent | null>(null)
  const contentRef = useRef<DocumentContent | null>(null)
  const editorRef = useRef<DocumentEditorHandle>(null)
  const [originalSnapshot, setOriginalSnapshot] = useState('')
  const [changeSummary, setChangeSummary] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameForm] = Form.useForm<{ template_name: string; description?: string }>()
  const { activeText: watermarkText, activeStyle: watermarkStyle } = useWatermarkSetting()

  /** 加载模板详情（与合同详情相同：normalizeDocumentContent） */
  const loadData = useCallback(async () => {
    if (!templateId) return
    setLoading(true)
    try {
      const tpl = await getTemplateDetail(templateId)
      setDetail(tpl)
      const content = normalizeDocumentContent(tpl.version?.document_content)
      setDocumentContent(content)
      contentRef.current = content
      setOriginalSnapshot(JSON.stringify(content))
    } catch {
      message.error('模板加载失败')
    } finally {
      setLoading(false)
    }
  }, [templateId, message])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const fidelityApi = useMemo(
    () => ({
      list: () => getTemplateFidelitySnapshots(templateId),
      create: (payload: Parameters<typeof createTemplateFidelitySnapshot>[1]) =>
        createTemplateFidelitySnapshot(templateId, payload),
      getDetail: (snapshotId: number) => getTemplateFidelitySnapshot(templateId, snapshotId),
      fetchPdf: (snapshotId: number) => fetchTemplateFidelitySnapshotPdf(templateId, snapshotId),
      rollback: (snapshotId: number) => rollbackTemplateFidelitySnapshot(templateId, snapshotId),
    }),
    [templateId],
  )

  const fidelity = useFidelitySnapshots({
    entityLabel: detail?.template_name ?? '模板',
    currentVersionNo: detail?.current_version_no ?? 1,
    documentContent,
    contentSnapshot: originalSnapshot,
    editorRef,
    api: fidelityApi,
    onRollbackSuccess: async () => {
      await loadData()
    },
  })

  useEffect(() => {
    if (templateId) {
      void fidelity.loadSnapshots()
    }
  }, [templateId, fidelity.loadSnapshots])

  /** 编辑器内容变更（与合同详情 handleEditorChange 一致） */
  const handleEditorChange = (content: DocumentContent) => {
    contentRef.current = content
    setDocumentContent(content)
  }

  /** 打开重命名弹窗 */
  const openRename = () => {
    if (!detail) return
    renameForm.setFieldsValue({
      template_name: detail.template_name,
      description: detail.description,
    })
    setRenameOpen(true)
  }

  /** 提交模板重命名 */
  const handleRename = async () => {
    const values = await renameForm.validateFields()
    await updateTemplateMeta(templateId, {
      template_name: values.template_name.trim(),
      description: values.description?.trim(),
    })
    message.success('模板已重命名')
    setRenameOpen(false)
    await loadData()
  }

  /** 保存模板（与合同 saveVersion 相同：写入 web_canvas 快照） */
  const handleSave = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    const latestContent = contentRef.current
    if (!latestContent || JSON.stringify(latestContent) === originalSnapshot) {
      message.info('文档没有修改，无需保存')
      return
    }
    const payload = prepareSaveDocumentContent(latestContent)
    setSaving(true)
    try {
      await saveTemplateContent(templateId, payload, changeSummary || '更新模板内容')
      message.success('保存成功')
      setChangeSummary('')
      setOriginalSnapshot(JSON.stringify(payload))
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  if (loading && !detail) {
    return (
      <div className="template-detail">
        <Card>
          <Typography.Text type="secondary">加载中…</Typography.Text>
        </Card>
      </div>
    )
  }

  return (
    <div className="template-detail contract-detail">
      <Card className="contract-detail__header" styles={{ body: { padding: '16px 20px' } }}>
        <div className="contract-detail__header-main">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/templates')}>
            返回模板池
          </Button>
          <div className="contract-detail__title-block">
            <Typography.Title level={4} style={{ margin: 0 }}>
              {detail?.template_name}
            </Typography.Title>
            <Space size="small" className="contract-detail__meta">
              <Typography.Text type="secondary">{detail?.original_file_name}</Typography.Text>
              <Tag>V{detail?.current_version_no}</Tag>
            </Space>
          </div>
        </div>
        <div className="contract-detail__header-actions">
          <Button icon={<EditOutlined />} onClick={openRename}>
            重命名
          </Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            保存模板
          </Button>
        </div>
      </Card>

      <Row gutter={16} className="contract-detail__body">
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <Typography.Text strong>文档内容</Typography.Text>
                {originalSnapshot !== '' &&
                  JSON.stringify(documentContent) !== originalSnapshot && (
                    <Tag color="orange">有未保存修改</Tag>
                  )}
              </Space>
            }
            className="contract-detail__editor-card"
          >
            <DocumentEditor
              ref={editorRef}
              documentContent={documentContent}
              onChange={handleEditorChange}
              emptyText="该模板暂无文档内容"
              watermarkText={watermarkText}
              watermarkStyle={watermarkStyle}
            />
            <div className="contract-detail__save-bar">
              <Input
                placeholder="本次修改说明（选填）"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                maxLength={200}
              />
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <HistoryOutlined />
                版本管理
              </Space>
            }
          >
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              {fidelity.generateButton}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                模板池合同：高保真阅览与导出效果一致，手动生成后最多保留 5 条快照
              </Typography.Text>
              <CollapsibleScrollSection
                panelKey="template-fidelity"
                title="高保真快照"
                count={fidelity.snapshots.length}
                maxVisibleRows={5}
                rowHeight={72}
              >
                <FidelitySnapshotList
                  snapshots={fidelity.snapshots}
                  loading={fidelity.loadingList}
                  onPreview={fidelity.handlePreview}
                  onRollback={fidelity.handleRollback}
                />
              </CollapsibleScrollSection>
            </Space>
          </Card>
        </Col>
      </Row>

      <FidelityPdfViewer
        open={fidelity.previewOpen}
        loadPdf={fidelity.previewLoadPdf}
        title={fidelity.previewTitle}
        onClose={() => fidelity.setPreviewOpen()}
      />

      <Modal
        title="重命名模板"
        open={renameOpen}
        onCancel={() => setRenameOpen(false)}
        onOk={() => void handleRename()}
        destroyOnHidden
      >
        <Form form={renameForm} layout="vertical">
          <Form.Item
            name="template_name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item name="description" label="模板说明">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
