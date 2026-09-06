import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Input,
  Row,
  Skeleton,
  Space,
  Tabs,
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
  uploadContractSeal,
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
import VersionHistoryList from '../../components/contract/VersionHistoryList'
import OnlinePresenceFloat from '../../components/contract/OnlinePresenceFloat'
import ChangeInspectExitFloat from '../../components/contract/ChangeInspectExitFloat'
import VersionConflictModal from '../../components/contract/VersionConflictModal'
import { getApiErrorMessage, getVersionConflictPayload } from '../../api/request'
import type { VersionConflictPayload } from '../../utils/conflictResolve'
import ConfirmStatusBanner from '../../components/contract/ConfirmStatusBanner'
import StaleContentBanner from '../../components/contract/StaleContentBanner'
import ConfirmActionBar from '../../components/contract/ConfirmActionBar'
import ContractShareModal from '../../components/contract/ContractShareModal'
import { useCollaboration } from '../../hooks/useCollaboration'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { useWatermarkSetting } from '../../hooks/useWatermarkSetting'
import { isContractLocked, normalizeDocumentContent, prepareSaveDocumentContent } from '../../utils/documentContent'
import { hasUserConfirmedVersion, willFinalizeAfterConfirm } from '../../utils/confirmProgress'
import { getStoredUser } from '../../utils/token'
import { isValidCnMobile } from '../../utils/phone'
import {
  buildChangeHighlightState,
  documentHasBlock,
  resolveLocateVersionId,
} from '../../utils/changeLocate'
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
  const { message, modal } = App.useApp()
  const isMobile = useIsMobile()

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
  const [activeChangeId, setActiveChangeId] = useState<number | null>(null)
  const [pageIndexByBlockId, setPageIndexByBlockId] = useState<Record<string, number>>({})
  const [conflictPayload, setConflictPayload] = useState<VersionConflictPayload | null>(null)
  const [conflictSaving, setConflictSaving] = useState(false)
  const { activeText: watermarkText, activeStyle: watermarkStyle } = useWatermarkSetting()

  const fetchContractConfirmProgress = useCallback(
    () => getConfirmProgress(contractId),
    [contractId],
  )

  const me = getStoredUser()
  const {
    users,
    isConnected,
    confirmProgress,
    setConfirmProgress,
    staleVersion,
    dismissStaleVersion,
  } = useCollaboration({
    contractId,
    selfRole: 'owner',
    selfName: me?.username,
    fetchConfirmProgress: contractId ? fetchContractConfirmProgress : undefined,
    enabled: Boolean(contractId),
  })

  const isLocked = detail ? isContractLocked(detail.status) : false
  const editorReadOnly = Boolean(viewingVersion) || isLocked

  /** 当前编辑器展示的文档（最新或历史版本） */
  const displayedContent = viewingVersion
    ? viewingVersion.document_content
    : documentContent

  /** 根据当前分页刷新「约第 N 页」提示 */
  const refreshPageIndexMap = useCallback(() => {
    const editor = editorRef.current
    if (!editor || changes.length === 0) {
      setPageIndexByBlockId({})
      return
    }
    const map: Record<string, number> = {}
    for (const change of changes) {
      if (!change.block_id || map[change.block_id] != null) continue
      map[change.block_id] = editor.getPageIndexForBlock(change.block_id)
    }
    setPageIndexByBlockId(map)
  }, [changes])

  useEffect(() => {
    const timer = window.setTimeout(() => refreshPageIndexMap(), 200)
    return () => window.clearTimeout(timer)
  }, [displayedContent, refreshPageIndexMap, viewingVersion])

  /** 点击变更记录：跳转页+块，并 Git 风格高亮 */
  const handleLocateChange = useCallback(
    async (change: ContractChange) => {
      if (!change.block_id) {
        message.warning('该变更缺少段落定位信息')
        return
      }

      let content = displayedContent
      if (!documentHasBlock(content, change.block_id)) {
        const versionId = resolveLocateVersionId(change)
        try {
          const v = await getContractVersionDetail(contractId, versionId)
          const normalized = {
            ...v,
            document_content:
              normalizeDocumentContent(v.document_content) ?? v.document_content,
          }
          setViewingVersion(normalized)
          content = normalized.document_content
          message.info(
            change.change_type === 1
              ? '已切换到删除前的版本以便定位'
              : `已切换到 V${v.version_no} 以便定位该变更`,
          )
          // 等待编辑器载入新文档后再跳转
          await new Promise((r) => setTimeout(r, 280))
        } catch {
          message.warning('无法加载包含该变更的版本')
          return
        }
      }

      if (!documentHasBlock(content, change.block_id)) {
        message.warning('无法定位到该段落（可能已被后续大幅改写）')
        return
      }

      const ok = await editorRef.current?.jumpToBlock(change.block_id)
      if (!ok) {
        message.warning('无法定位到该段落所在页')
        return
      }
      editorRef.current?.setChangeHighlight(buildChangeHighlightState(change))
      setActiveChangeId(change.id)
      refreshPageIndexMap()
    },
    [contractId, displayedContent, message, refreshPageIndexMap],
  )

  const loadDetail = useCallback(async (restorePage?: number) => {
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
      if (restorePage != null) {
        requestAnimationFrame(() => {
          editorRef.current?.setCurrentPage(restorePage)
        })
      }
    } catch {
      message.error('合同加载失败')
    } finally {
      setLoading(false)
    }
  }, [contractId, message])

  const loadChangesAndVersions = useCallback(async () => {
    if (!contractId) return
    try {
      const [changeRes, versionRes, confirmRes, progress] = await Promise.all([
        getContractChanges(contractId, { page: 1, page_size: 50 }),
        getContractVersions(contractId, { page: 1, page_size: 50 }),
        getContractConfirmations(contractId),
        getConfirmProgress(contractId),
      ])
      setChanges(changeRes.list)
      setVersions(versionRes.list)
      setConfirmations(confirmRes)
      setConfirmProgress(progress)
    } catch {
      // 错误提示已在拦截器处理
    }
  }, [contractId, setConfirmProgress])

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

  const hasShareGateInfo = Boolean(
    detail?.customer_name?.trim() && isValidCnMobile(detail?.customer_phone ?? ''),
  )

  /** 对方保存后刷新正文并保留当前页码 */
  const handleStaleRefresh = async () => {
    if (viewingVersion) {
      message.info('请先返回当前版本再刷新')
      return
    }
    const savedPage = editorRef.current?.getCurrentPage() ?? 0
    const hasLocalChanges = hasChanges
    const doRefresh = async () => {
      dismissStaleVersion()
      await Promise.all([loadDetail(savedPage), loadChangesAndVersions()])
    }
    if (hasLocalChanges) {
      modal.confirm({
        title: '刷新将丢弃未保存修改',
        content: '对方已保存新版本，刷新后您当前的未保存修改将丢失。是否继续？',
        onOk: () => void doRefresh(),
      })
    } else {
      await doRefresh()
    }
  }

  const selfConfirmed =
    detail?.current_version_id != null &&
    hasUserConfirmedVersion(confirmations, detail.current_version_id, 0, me?.id, undefined)

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
        base_version_id: detail?.current_version_id,
      })
      message.success(
        result.auto_merged
          ? `已自动合并对方修改并保存为 V${result.version_no}`
          : result.change_count > 0
            ? `已保存为 V${result.version_no}，记录 ${result.change_count} 条变更`
            : `已保存为 V${result.version_no}`,
      )
      setChangeSummary('')
      dismissStaleVersion()
      if (result.auto_merged) {
        // 服务端合并结果与本地稿不同，重新拉取正文
        await Promise.all([loadDetail(), loadChangesAndVersions()])
      } else {
        setOriginalSnapshot(JSON.stringify(payload))
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                current_version_no: result.version_no,
                current_version_id: result.version_id,
              }
            : prev,
        )
        await loadChangesAndVersions()
      }
    } catch (error) {
      const conflict = getVersionConflictPayload(error)
      if (conflict) {
        setConflictPayload(conflict)
        return
      }
      message.error(getApiErrorMessage(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  /** 冲突弹窗确认：按选择合并后基于对方最新版本再保存 */
  const handleConflictConfirm = async (resolved: DocumentContent, baseVersionId: number) => {
    setConflictSaving(true)
    try {
      const payload = prepareSaveDocumentContent(resolved)
      const result = await saveContractVersion(contractId, {
        document_content: payload,
        change_summary: changeSummary || '合并冲突后保存',
        base_version_id: baseVersionId,
      })
      setConflictPayload(null)
      setDocumentContent(payload)
      contentRef.current = payload
      setOriginalSnapshot(JSON.stringify(payload))
      setChangeSummary('')
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              current_version_no: result.version_no,
              current_version_id: result.version_id,
            }
          : prev,
      )
      dismissStaleVersion()
      message.success(`冲突已解决，已保存为 V${result.version_no}`)
      await loadChangesAndVersions()
    } catch (error) {
      const conflict = getVersionConflictPayload(error)
      if (conflict) {
        setConflictPayload(conflict)
        message.warning('合并期间又有新版本，请重新选择冲突区域')
        return
      }
      message.error(getApiErrorMessage(error, '合并保存失败'))
    } finally {
      setConflictSaving(false)
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

    const meUser = getStoredUser()
    const versionId = detail.current_version_id
    if (
      hasUserConfirmedVersion(confirmations, versionId, 0, meUser?.id, undefined)
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

      const pngBlobs = await exportPagesAsPng(pages, { pixelRatio: PDF_EXPORT_PIXEL_RATIO })
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

      const pngBlobs = await exportPagesAsPng(pages, { pixelRatio: PDF_EXPORT_PIXEL_RATIO })
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
      setActiveChangeId(null)
      editorRef.current?.setChangeHighlight(null)
      message.info(`正在查看历史版本 V${v.version_no}`)
    } catch {
      message.error('版本内容加载失败')
    }
  }

  /** 退出变更/历史查看：留在当前页，恢复可编辑（权限允许时） */
  const handleResumeEdit = useCallback(() => {
    const page = editorRef.current?.getCurrentPage() ?? 0
    const fromHistory = Boolean(viewingVersion)
    setViewingVersion(null)
    setActiveChangeId(null)
    editorRef.current?.setChangeHighlight(null)
    if (!fromHistory) return
    // 切回当前版本文档后保留页码，避免回到第 1 页
    const restorePage = () => editorRef.current?.setCurrentPage(page)
    requestAnimationFrame(() => {
      requestAnimationFrame(restorePage)
    })
    window.setTimeout(restorePage, 120)
    window.setTimeout(restorePage, 320)
  }, [viewingVersion])

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

  /** 打开分享弹窗（需客户姓名与预留手机号） */
  const openShareModal = () => {
    if (!hasShareGateInfo) {
      message.warning('请先完善合同的客户姓名与预留手机号后再分享')
      return
    }
    setShareOpen(true)
  }

  /** 侧栏 Tabs（版本 / 历史 / 确认），手机与桌面共用 */
  const sideTabItems = [
    {
      key: 'changes',
      label: isMobile ? (
        '版本'
      ) : (
        <Space size={6}>
          <HistoryOutlined />
          版本记录
          {versions.length > 0 ? <Tag style={{ marginInlineEnd: 0 }}>{versions.length}</Tag> : null}
        </Space>
      ),
      children: (
        <div className="contract-detail__side-pane">
          <ChangeTimeline
            changes={changes}
            versions={versions}
            activeChangeId={activeChangeId}
            onLocateChange={(change) => void handleLocateChange(change)}
            pageIndexByBlockId={pageIndexByBlockId}
          />
        </div>
      ),
    },
    {
      key: 'history',
      label: isMobile ? '历史' : '历史版本',
      children: (
        <div className="contract-detail__side-pane">
          <VersionHistoryList versions={versions} onView={handleViewVersion} />
        </div>
      ),
    },
    {
      key: 'confirms',
      label: isMobile ? (
        '确认'
      ) : (
        <Space size={6}>
          <CheckCircleOutlined />
          确认记录
        </Space>
      ),
      children: (
        <div className="contract-detail__side-pane">
          {confirmations.length === 0 ? (
            <Typography.Text type="secondary">暂无确认记录</Typography.Text>
          ) : (
            confirmations.map((item) => (
              <div key={item.id} className="contract-detail__confirmation-item">
                <Space orientation="vertical" size={0} style={{ width: '100%' }}>
                  <Space size="small" wrap>
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
        </div>
      ),
    },
  ]

  return (
    <div className={`contract-detail${isMobile ? ' contract-detail--mobile' : ''}`}>
      <Card className="contract-detail__header" variant="borderless">
        <div className="contract-detail__header-row">
          <div className="contract-detail__header-main">
            <Button
              type="text"
              className="contract-detail__back"
              icon={<ArrowLeftOutlined />}
              aria-label="返回合同列表"
              onClick={() => navigate('/contracts')}
            >
              {isMobile ? null : '返回'}
            </Button>
            <div className="contract-detail__title-block">
              <Typography.Title level={4} className="contract-detail__title" ellipsis>
                {detail.contract_name}
              </Typography.Title>
              <div className="contract-detail__meta">
                {!isMobile ? (
                  <Typography.Text type="secondary">{detail.contract_no}</Typography.Text>
                ) : null}
                <ContractStatusTag status={detail.status} />
                <Tag>V{detail.current_version_no}</Tag>
                {!isMobile && detail.customer_name ? (
                  <Typography.Text type="secondary">客户：{detail.customer_name}</Typography.Text>
                ) : null}
                {hasChanges && !viewingVersion && !isLocked ? (
                  <Tag color="orange">{isMobile ? '未保存' : '有未保存修改'}</Tag>
                ) : null}
              </div>
            </div>
          </div>

          {/* 桌面：顶栏操作；手机：下沉到底部 Dock */}
          {!isMobile ? (
            <div className="contract-detail__header-actions">
              <Button icon={<ShareAltOutlined />} disabled={!hasShareGateInfo} onClick={openShareModal}>
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
            </div>
          ) : null}
        </div>
      </Card>

      {isLocked && !viewingVersion && (
        <Alert
          className="contract-detail__version-alert"
          type="info"
          showIcon
          message={isMobile ? '合同已锁定，可下载终稿 PDF' : '合同已确认锁定，文档为只读；可下载终稿 PDF'}
        />
      )}

      {viewingVersion && (
        <Alert
          className="contract-detail__version-alert"
          type="warning"
          showIcon
          message={
            isMobile
              ? `查看历史 V${viewingVersion.version_no}（只读）`
              : `正在查看历史版本 V${viewingVersion.version_no}（只读），编辑与保存已禁用`
          }
          action={
            <Button size="small" onClick={handleResumeEdit}>
              返回编辑
            </Button>
          }
        />
      )}

      <Row gutter={[16, 16]} className="contract-detail__body">
        <Col xs={24} lg={16}>
          <Card
            title={
              isMobile ? undefined : (
                <Space size={8}>
                  <Typography.Text strong>
                    文档编辑{viewingVersion ? ` · 历史 V${viewingVersion.version_no}` : ''}
                  </Typography.Text>
                </Space>
              )
            }
            className="contract-detail__editor-card"
          >
            <div className="contract-detail__editor-workspace">
              <div className="contract-detail__editor-banners">
                <ConfirmStatusBanner
                  progress={confirmProgress}
                  viewerType={0}
                  contractStatus={detail.status}
                  currentVersionNo={detail.current_version_no}
                  selfConfirmed={selfConfirmed}
                />
                <StaleContentBanner
                  payload={staleVersion}
                  onRefresh={() => void handleStaleRefresh()}
                  onDismiss={dismissStaleVersion}
                  disabled={Boolean(viewingVersion) || isLocked}
                />
              </div>

              <DocumentEditor
                ref={editorRef}
                documentContent={
                  viewingVersion ? viewingVersion.document_content : documentContent
                }
                onChange={handleEditorChange}
                readOnly={editorReadOnly}
                watermarkText={watermarkText}
                watermarkStyle={watermarkStyle}
                allowHeaderFooterEdit={!isLocked && !viewingVersion}
                allowSealEdit={!isLocked && !viewingVersion}
                sealDisplayContext={
                  contractId ? { mode: 'contract', contractId } : null
                }
                uploadSealImage={
                  contractId
                    ? (file) => uploadContractSeal(contractId, file)
                    : undefined
                }
              />

              <OnlinePresenceFloat users={users} isConnected={isConnected} />
              <ChangeInspectExitFloat
                visible={Boolean(viewingVersion) || activeChangeId != null}
                canEdit={!isLocked}
                viewingHistory={Boolean(viewingVersion)}
                versionNo={viewingVersion?.version_no}
                onExit={handleResumeEdit}
              />
            </div>

            {!editorReadOnly && (
              <div className="contract-detail__save-bar">
                <Input
                  placeholder={isMobile ? '修改说明（选填）' : '本次修改说明（选填），保存版本时一并提交'}
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  maxLength={200}
                />
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <div className="contract-detail__side">
            <Card
              className={`contract-detail__side-card${isMobile ? ' contract-detail__side-card--mobile-tabs' : ''}`}
              styles={{ body: { padding: 0 } }}
            >
              <Tabs defaultActiveKey="changes" size={isMobile ? 'small' : 'middle'} items={sideTabItems} />
            </Card>
          </div>
        </Col>
      </Row>

      {/* 手机端底部固定操作栏 */}
      {isMobile ? (
        <div className="contract-detail__mobile-dock">
          <div className="contract-detail__mobile-dock-meta">
            <Typography.Text strong ellipsis style={{ maxWidth: '52vw' }}>
              {detail.contract_name}
            </Typography.Text>
            <Button
              size="small"
              icon={<ShareAltOutlined />}
              disabled={!hasShareGateInfo}
              onClick={openShareModal}
            >
              分享
            </Button>
          </div>
          <ConfirmActionBar
            layout="horizontal"
            compact
            onSave={handleSaveVersion}
            onConfirm={handleConfirm}
            onDownload={isLocked ? handleDownloadFinalPdf : handleExportPdf}
            saving={saving}
            confirming={confirming}
            downloading={exporting}
            editReadOnly={editorReadOnly}
          />
        </div>
      ) : null}

      <ContractShareModal
        contractId={contractId}
        contractName={detail.contract_name}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
      <VersionConflictModal
        open={conflictPayload != null}
        payload={conflictPayload}
        confirming={conflictSaving}
        onCancel={() => setConflictPayload(null)}
        onConfirm={(resolved, baseVersionId) => void handleConflictConfirm(resolved, baseVersionId)}
      />
    </div>
  )
}
