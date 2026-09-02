import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { App, Button, Card, Col, Input, Row, Space, Tabs, Typography } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import {
  fetchTemplatePreview,
  getTemplateDetail,
  saveTemplateContent,
} from '../../api/templateApi'
import type { TemplateDetail } from '../../types/template'
import type { DocumentContent } from '../../types/contract'
import DocxPreview from '../../components/contract/DocxPreview'
import DocumentEditor from '../../components/contract/DocumentEditor'
import './template-detail.css'

/**
 * 模板详情页：高保真 DOCX 预览 + 结构化编辑。
 */
export default function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const templateId = Number(id)
  const navigate = useNavigate()
  const { message } = App.useApp()

  const [detail, setDetail] = useState<TemplateDetail | null>(null)
  const [previewData, setPreviewData] = useState<ArrayBuffer | null>(null)
  const [documentContent, setDocumentContent] = useState<DocumentContent | null>(null)
  const contentRef = useRef<DocumentContent | null>(null)
  const [changeSummary, setChangeSummary] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('preview')

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

  /** 加载模板详情与预览 */
  const loadData = useCallback(async () => {
    if (!templateId) return
    setLoading(true)
    try {
      const [tpl, preview] = await Promise.all([
        getTemplateDetail(templateId),
        fetchTemplatePreview(templateId),
      ])
      setDetail(tpl)
      setPreviewData(preview)
      const content = parseContent(tpl.version?.document_content)
      setDocumentContent(content)
      contentRef.current = content
    } catch {
      message.error('模板加载失败')
    } finally {
      setLoading(false)
    }
  }, [templateId, message])

  useEffect(() => {
    loadData()
  }, [loadData])

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
    return <Card loading style={{ maxWidth: 1200, margin: '0 auto' }} />
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

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                {
                  key: 'preview',
                  label: '高保真预览',
                  children: <DocxPreview data={previewData} />,
                },
                {
                  key: 'edit',
                  label: '结构化编辑',
                  children: (
                    <>
                      <DocumentEditor
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
                    </>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
