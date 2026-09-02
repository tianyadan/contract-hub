import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { App, Button, Card, Col, Input, Row, Space, Typography } from 'antd'
import { ArrowLeftOutlined, HistoryOutlined, SaveOutlined } from '@ant-design/icons'
import { getTemplateDetail, saveTemplateContent } from '../../api/templateApi'
import {
  createTemplateFidelitySnapshot,
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
import { normalizeDocumentContent } from '../../utils/documentContent'
import './template-detail.css'

/**
 * 模板详情页：默认结构化编辑 + 手动高保真阅览。
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

  /** 解析 JSON 文档内容 */
  const parseContent = (raw: unknown): DocumentContent | null => {
    if (!raw) return null
    if (typeof raw === 'object') return raw as DocumentContent
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as DocumentContent
      } catch {
        return null
      }
    }
    return null
  }

  /** 加载模板详情（不再请求 DOCX 预览） */
  const loadData = useCallback(async () => {
    if (!templateId) return
    setLoading(true)
    try {
      const tpl = await getTemplateDetail(templateId)
      setDetail(tpl)
      const content = normalizeDocumentContent(parseContent(tpl.version?.document_content))
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

  /** 保存模板结构化内容 */
  const handleSave = async () => {
    const content = contentRef.current
    if (!content) {
      message.warning('暂无文档内容')
      return
    }
    setSaving(true)
    try {
      await saveTemplateContent(templateId, content, changeSummary || '更新模板内容')
      message.success('保存成功')
      setChangeSummary('')
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  if (loading && !detail) {
    return <Card loading style={{ maxWidth: 1400, margin: '0 auto' }} />
  }

  return (
    <div className="template-detail">
      <div className="template-detail__header">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/templates')}>
          返回模板池
        </Button>
        <Space orientation="vertical" size={0}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {detail?.template_name}
          </Typography.Title>
          <Typography.Text type="secondary">
            {detail?.original_file_name} · V{detail?.current_version_no}
          </Typography.Text>
        </Space>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
          保存模板
        </Button>
      </div>

      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Card title="合同模板维护（网页编辑）">
            <DocumentEditor
              ref={editorRef}
              documentContent={documentContent}
              onChange={(c) => {
                setDocumentContent(c)
                contentRef.current = c
              }}
            />
            <Input
              style={{ marginTop: 12 }}
              placeholder="本次修改说明（选填）"
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              maxLength={200}
            />
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
        pdfUrl={fidelity.previewUrl}
        title={fidelity.previewTitle}
        onClose={() => fidelity.setPreviewOpen(false)}
      />
    </div>
  )
}
