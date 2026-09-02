import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Collapse,
  Input,
  Row,
  Skeleton,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  confirmContractAck,
  confirmContractWithPdf,
  fetchContractPreview,
  getConfirmProgress,
  getContractChanges,
  getContractConfirmations,
  getContractDetail,
  getContractExportPdf,
  getContractVersionDetail,
  getContractVersions,
  prepareFinalExport,
  saveContractVersion,
  uploadContractExportPdf,
} from '../../api/contractApi'
import type {
  ContractChange,
  ContractConfirmation,
  ContractDetail,
  ContractVersionDetail,
  ContractVersionItem,
  DocumentContent,
} from '../../types/contract'
import ContractStatusTag from '../../components/ContractStatusTag'
import DocumentEditor, { type DocumentEditorHandle } from '../../components/contract/DocumentEditor'
import ChangeTimeline from '../../components/contract/ChangeTimeline'
import CollapsibleScrollSection from '../../components/contract/CollapsibleScrollSection'
import VersionHistoryList from '../../components/contract/VersionHistoryList'
import OnlinePresenceBar from '../../components/contract/OnlinePresenceBar'
import ConfirmActionBar from '../../components/contract/ConfirmActionBar'
import ContractShareModal from '../../components/contract/ContractShareModal'
import DocxPreview from '../../components/contract/DocxPreview'
import { usePresence } from '../../hooks/usePresence'
import { isContractLocked, normalizeDocumentContent, prepareSaveDocumentContent } from '../../utils/documentContent'
import { hasUserConfirmedVersion, willFinalizeAfterConfirm } from '../../utils/confirmProgress'
import { getStoredUser } from '../../utils/token'
import {
  collectExportPageElements,
  exportPagesAsPng,
} from '../../utils/exportContractPng'
import {
  downloadPdf,
  exportPagesAsPdf,
  overlayQrWatermark,
  PDF_EXPORT_PIXEL_RATIO,
  sha256Blob,
} from '../../utils/exportContractPdf'
import './contract-detail.css'

/**
 * 合同详情 / 在线编辑页（V3：网页即真相，导出 PDF）。
 */
export default function ContractDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const contractId = Number(id)
  const { message } = App.useApp()

  const [detail, setDetail] = useState<ContractDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [documentContent, setDocumentContent] = useState<DocumentContent | null>(null)
  const contentRef = useRef<DocumentContent | null>(null)
  const editorRef = useRef<DocumentEditorHandle>(null)
  const [originalSnapshot, setOriginalSnapshot] = useState('')
  const [changeSummary, setChangeSummary] = useState('')
  const [changes, setChanges] = useState<ContractChange[]>([])
  const [versions, setVersions] = useState<ContractVersionItem[]>([])
  const [confirmations, setConfirmations] = useState<ContractConfirmation[]>([])
  const [viewingVersion, setViewingVersion] = useState<ContractVersionDetail | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [previewData, setPreviewData] = useState<ArrayBuffer | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewTried, setPreviewTried] = useState(false)
  const { users, isConnected } = usePresence(contractId)

  const isLocked = detail ? isContractLocked(detail.status) : false
  const editorReadOnly = Boolean(viewingVersion) || isLocked

  const loadDetail = useCallback(async () => {
    if (!contractId) return
    setLoading(true)
    try {
      const data = await getContractDetail(contractId)
      setDetail(data)
      const content = normalizeDocumentContent(data.version?.document_content)
      setDocumentContent(content)
      contentRef.current = content
      setOriginalSnapshot(JSON.stringify(content))
      setViewingVersion(null)
      setPreviewData(null)
      setPreviewTried(false)
    } catch {
      message.error('合同加载失败')
    } finally {
      setLoading(false)
    }
  }, [contractId, message])

  /** 展开「导入原文件参考」时再加载 DOCX，避免每次进详情都请求 */
  const handleLoadPreview = async () => {
    if (previewTried || previewLoading) return
    setPreviewLoading(true)
    try {
      const preview = await fetchContractPreview(contractId)
      setPreviewData(preview)
    } finally {
      setPreviewTried(true)
      setPreviewLoading(false)
    }
  }

  const loadChangesAndVersions = useCallback(async () => {
    if (!contractId) return
    try {
      const [changeRes, versionRes, confirmRes] = await Promise.all([
        getContractChanges(contractId, { page: 1, page_size: 50 }),
        getContractVersions(contractId, { page: 1, page_size: 50 }),
        getContractConfirmations(contractId),
      ])
      setChanges(changeRes.list)
      setVersions(versionRes.list)
      setConfirmations(confirmRes)
    } catch {
      // 错误提示已在拦截器处理
    }
  }, [contractId])

  useEffect(() => {
    loadDetail()
    loadChangesAndVersions()
  }, [loadDetail, loadChangesAndVersions])

  const handleEditorChange = (content: DocumentContent) => {
    contentRef.current = content
    setDocumentContent(content)
  }

  const hasChanges = useMemo(() => {
    return originalSnapshot !== '' && JSON.stringify(documentContent) !== originalSnapshot
  }, [documentContent, originalSnapshot])

  const handleSaveVersion = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    if (viewingVersion) {
      message.info('当前正在查看历史版本，请先返回当前版本再编辑')
      return
    }
    if (isLocked) {
      message.warning('合同已确认锁定，无法继续编辑')
      return
    }
    const latestContent = contentRef.current
    if (!latestContent || JSON.stringify(latestContent) === originalSnapshot) {
      message.info('文档没有修改，无需保存新版本')
      return
    }
  const payload: DocumentContent = prepareSaveDocumentContent({
    ...latestContent,
  })
    setSaving(true)
    try {
      const result = await saveContractVersion(contractId, {
        document_content: payload,
        change_summary: changeSummary,
      })
      message.success(
        result.change_count > 0
          ? `已保存为 V${result.version_no}，记录 ${result.change_count} 条变更`
          : `已保存为 V${result.version_no}`,
      )
      setChangeSummary('')
      setOriginalSnapshot(JSON.stringify(payload))
      setDetail((prev) =>
        prev ? { ...prev, current_version_no: result.version_no } : prev,
      )
      await loadChangesAndVersions()
    } catch {
      // 错误提示已在拦截器处理
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    if (hasChanges && !viewingVersion) {
      message.warning('当前文档有未保存修改，请先保存版本后再确认')
      return
    }
    if (!detail?.current_version_id) {
      message.error('当前版本不存在')
      return
    }

    const me = getStoredUser()
    const versionId = detail.current_version_id
    if (
      hasUserConfirmedVersion(confirmations, versionId, 0, me?.id, undefined)
    ) {
      message.info('您已确认过当前版本')
      return
    }

    setConfirming(true)
    const hide = message.loading({ content: '正在处理确认…', duration: 0, key: 'confirm-pdf' })
    try {
      const progress = await getConfirmProgress(contractId)
      const needPdf = willFinalizeAfterConfirm(progress, 0)

      if (!needPdf) {
        const outcome = await confirmContractAck(contractId)
        message.success(outcome.message)
        await loadChangesAndVersions()
        return
      }

      message.loading({ content: '正在生成终稿 PDF…', duration: 0, key: 'confirm-pdf' })
      const { verify_code, public_web_origin } = await prepareFinalExport(contractId)
      const baseName = detail.contract_no ?? 'contract'
      const pages =
        (await editorRef.current?.preparePagesForExport()) ??
        collectExportPageElements(editorRef.current?.getExportRoot() ?? document.body)
      if (pages.length === 0) throw new Error('文档为空，无法确认')

      const pngBlobs = await exportPagesAsPng(pages, { draft: false, pixelRatio: PDF_EXPORT_PIXEL_RATIO })
      const withQr = await Promise.all(
        pngBlobs.map((blob, index) =>
          overlayQrWatermark(blob, verify_code, index + 1, public_web_origin),
        ),
      )
      const pdfBlob = await exportPagesAsPdf(withQr)
      const hash = await sha256Blob(pdfBlob)

      const outcome = await confirmContractWithPdf(contractId, {
        file: pdfBlob,
        hash,
        page_count: withQr.length,
        verify_code,
      })
      downloadPdf(pdfBlob, `${baseName}-终稿`)
      message.success(outcome.message)
      await Promise.all([loadDetail(), loadChangesAndVersions()])
    } catch (error) {
      if (error instanceof Error && !error.message.includes('请求')) {
        message.error(error.message)
      }
    } finally {
      hide()
      setConfirming(false)
    }
  }

  /** 导出草稿 PDF 并本地下载 */
  const handleExportPdf = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    if (hasChanges && !viewingVersion) {
      message.warning('当前文档有未保存修改，请先保存版本后再导出')
      return
    }
    setExporting(true)
    try {
      const baseName = detail?.contract_no ?? 'contract'
      const draft = !isLocked
      const pages =
        (await editorRef.current?.preparePagesForExport()) ??
        collectExportPageElements(editorRef.current?.getExportRoot() ?? document.body)
      if (pages.length === 0) throw new Error('文档为空，无法导出')

      const pngBlobs = await exportPagesAsPng(pages, { draft, pixelRatio: PDF_EXPORT_PIXEL_RATIO })
      const pdfBlob = await exportPagesAsPdf(pngBlobs)
      const hash = await sha256Blob(pdfBlob)
      downloadPdf(pdfBlob, draft ? `${baseName}-草稿` : `${baseName}-终稿`)
      message.success(`已导出 ${pngBlobs.length} 页 PDF`)

      if (!viewingVersion && draft) {
        try {
          await uploadContractExportPdf(contractId, pdfBlob, hash, pngBlobs.length, { draft: true })
        } catch {
          // 草稿归档失败不影响本地下载
        }
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'PDF 导出失败')
    } finally {
      setExporting(false)
    }
  }

  /** 已确认合同下载 OSS 终稿 PDF */
  const handleDownloadFinalPdf = async () => {
    setExporting(true)
    try {
      const info = await getContractExportPdf(contractId)
      if (info.pdf_url) {
        window.open(info.pdf_url, '_blank', 'noopener,noreferrer')
        message.success('正在打开终稿 PDF')
      }
    } catch {
      message.warning('暂无终稿 PDF 归档，请尝试重新导出')
    } finally {
      setExporting(false)
    }
  }

  const handleViewVersion = async (version: ContractVersionItem) => {
    try {
      const v = await getContractVersionDetail(contractId, version.version_id)
      setViewingVersion({
        ...v,
        document_content: normalizeDocumentContent(v.document_content) ?? v.document_content,
      })
      message.info(`正在查看历史版本 V${v.version_no}`)
    } catch {
      message.error('版本内容加载失败')
    }
  }

  const handleBackToCurrent = () => {
    setViewingVersion(null)
  }

  if (loading) {
    return (
      <div className="contract-detail">
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      </div>
    )
  }

  if (!detail) {
    return (
      <Card className="contract-detail__not-found">
        <Typography.Title level={4}>合同不存在或无权访问</Typography.Title>
        <Button onClick={() => navigate('/contracts')}>返回合同列表</Button>
      </Card>
    )
  }

  return (
    <div className="contract-detail">
      <Card className="contract-detail__header" styles={{ body: { padding: '16px 20px' } }}>
        <div className="contract-detail__header-main">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/contracts')}>
            返回
          </Button>
          <div className="contract-detail__title-block">
            <Typography.Title level={4} style={{ margin: 0 }}>
              {detail.contract_name}
            </Typography.Title>
            <Space size="small" className="contract-detail__meta">
              <Typography.Text type="secondary">{detail.contract_no}</Typography.Text>
              <ContractStatusTag status={detail.status} />
              <Tag>V{detail.current_version_no}</Tag>
              {detail.customer_name && (
                <Typography.Text type="secondary">客户：{detail.customer_name}</Typography.Text>
              )}
            </Space>
          </div>
        </div>

        <div className="contract-detail__header-actions">
          <Space>
            <Button icon={<ShareAltOutlined />} onClick={() => setShareOpen(true)}>
              分享
            </Button>
            <ConfirmActionBar
              onSave={handleSaveVersion}
              onConfirm={handleConfirm}
              onDownload={isLocked ? handleDownloadFinalPdf : handleExportPdf}
              saving={saving}
              confirming={confirming}
              downloading={exporting}
              editReadOnly={editorReadOnly}
            />
          </Space>
        </div>
      </Card>

      {isLocked && !viewingVersion && (
        <Alert
          className="contract-detail__version-alert"
          type="info"
          showIcon
          message="合同已确认锁定，文档为只读；可下载终稿 PDF"
        />
      )}

      {viewingVersion && (
        <Alert
          className="contract-detail__version-alert"
          type="warning"
          showIcon
          message={`正在查看历史版本 V${viewingVersion.version_no}（只读），编辑与保存已禁用`}
          action={
            <Button size="small" onClick={handleBackToCurrent}>
              返回当前版本
            </Button>
          }
        />
      )}

      <Row gutter={16} className="contract-detail__body">
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <Typography.Text strong>
                  文档内容{viewingVersion ? `（历史版本 V${viewingVersion.version_no}）` : ''}
                </Typography.Text>
                {hasChanges && !viewingVersion && !isLocked && (
                  <Tag color="orange">有未保存修改</Tag>
                )}
              </Space>
            }
            className="contract-detail__editor-card"
          >
            <OnlinePresenceBar users={users} isConnected={isConnected} />
            <DocumentEditor
              ref={editorRef}
              documentContent={
                viewingVersion ? viewingVersion.document_content : documentContent
              }
              onChange={handleEditorChange}
              readOnly={editorReadOnly}
            />
            {!editorReadOnly && (
              <div className="contract-detail__save-bar">
                <Input
                  placeholder="本次修改说明（选填）"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  maxLength={200}
                />
              </div>
            )}
            <Collapse
              className="contract-detail__source-collapse"
              onChange={(keys) => {
                if (Array.isArray(keys) ? keys.includes('source') : keys === 'source') {
                  void handleLoadPreview()
                }
              }}
              items={[
                {
                  key: 'source',
                  label: '导入原文件参考（只读，不影响导出）',
                  children: previewLoading ? (
                    <div style={{ textAlign: 'center', padding: 24 }}>
                      <Spin />
                    </div>
                  ) : previewData ? (
                    <DocxPreview data={previewData} />
                  ) : previewTried ? (
                    <Typography.Text type="secondary">暂无导入原文件或原文件已不可用</Typography.Text>
                  ) : (
                    <Typography.Text type="secondary">展开后将加载导入的 DOCX 原文件</Typography.Text>
                  ),
                },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <CollapsibleScrollSection
            panelKey="change-timeline"
            title={
              <Space size={6}>
                <HistoryOutlined />
                版本记录
              </Space>
            }
            count={versions.length}
            maxVisibleRows={5}
            rowHeight={88}
          >
            <ChangeTimeline changes={changes} versions={versions} />
          </CollapsibleScrollSection>

          <CollapsibleScrollSection
            panelKey="version-history"
            title="历史版本"
            count={versions.length}
            maxVisibleRows={5}
            rowHeight={64}
          >
            <VersionHistoryList versions={versions} onView={handleViewVersion} />
          </CollapsibleScrollSection>

          <Card
            title={
              <Space>
                <CheckCircleOutlined />
                确认记录
              </Space>
            }
            className="contract-detail__confirmations-card"
          >
            {confirmations.length === 0 ? (
              <Typography.Text type="secondary">暂无确认记录</Typography.Text>
            ) : (
              confirmations.map((item) => (
                <div key={item.id} className="contract-detail__confirmation-item">
                  <Space orientation="vertical" size={0} style={{ width: '100%' }}>
                    <Space size="small">
                      <Typography.Text strong>{item.confirmer_name}</Typography.Text>
                      <Tag color={item.confirm_status === 1 ? 'green' : 'default'}>
                        {item.confirm_status === 1 ? '已确认' : '已取消确认'}
                      </Tag>
                      <Tag color={item.confirmer_type === 0 ? 'blue' : 'orange'}>
                        {item.confirmer_type === 0 ? '内部用户' : '外部协作者'}
                      </Tag>
                    </Space>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(item.confirm_time).format('YYYY-MM-DD HH:mm')}
                    </Typography.Text>
                  </Space>
                </div>
              ))
            )}
          </Card>
        </Col>
      </Row>

      <ContractShareModal
        contractId={contractId}
        contractName={detail.contract_name}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </div>
  )
}
