import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Col,
  Input,
  Result,
  Row,
  Skeleton,
  Space,
  Tabs,
  Tag,
  Typography,
  Upload,
} from 'antd'
import {
  LinkOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
  UserOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  confirmShareAck,
  confirmShareWithPdf,
  getShareChanges,
  getShareConfirmations,
  getShareContract,
  getShareExportPdf,
  getShareInfo,
  getShareVersions,
  getShareVersionDetail,
  getShareConfirmProgress,
  joinShare,
  prepareShareFinalExport,
  saveShareVersion,
  uploadShareExportPdf,
  uploadShareSeal,
} from '../../api/shareApi'
import type {
  Collaborator,
  ContractChange,
  ContractConfirmation,
  ContractVersionDetail,
  ContractVersionItem,
  DocumentContent,
  DocumentSeal,
  ShareContract,
  SharePublicInfo,
} from '../../types/contract'
import ContractStatusTag from '../../components/ContractStatusTag'
import DocumentEditor, { type DocumentEditorHandle } from '../../components/contract/DocumentEditor'
import ChangeTimeline from '../../components/contract/ChangeTimeline'
import OnlinePresenceFloat from '../../components/contract/OnlinePresenceFloat'
import ConfirmStatusBanner from '../../components/contract/ConfirmStatusBanner'
import StaleContentBanner from '../../components/contract/StaleContentBanner'
import ConfirmActionBar from '../../components/contract/ConfirmActionBar'
import BrandLogo from '../../components/BrandLogo'
import ChangeInspectExitFloat from '../../components/contract/ChangeInspectExitFloat'
import VersionConflictModal from '../../components/contract/VersionConflictModal'
import { getApiErrorMessage, getVersionConflictPayload } from '../../api/request'
import type { VersionConflictPayload } from '../../utils/conflictResolve'
import { useCollaboration } from '../../hooks/useCollaboration'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { isContractLocked, normalizeDocumentContent, prepareSaveDocumentContent } from '../../utils/documentContent'
import { hasUserConfirmedVersion, willFinalizeAfterConfirm } from '../../utils/confirmProgress'
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
import { pickWatermarkVisualStyle } from '../../utils/watermarkStyle'
import './share.css'

/** 按分享 token 隔离协作者姓名/手机号缓存 */
function shareNameStorageKey(token: string): string {
  return `lshc_share_name_${token}`
}

function sharePhoneStorageKey(token: string): string {
  return `lshc_share_phone_${token}`
}

/**
 * 外部协作者访问页（公开，免登录，通过 URL token 访问）。
 * 流程：打开链接 → 输入姓名加入（POST /api/share/{token}/join）→
 * 查看 / 编辑合同 → 保存 / 确认 / 下载。
 * 权限：permission=0 只读（仅查看与下载），permission=1 可编辑。
 */
export default function SharePage() {
  const { token = '' } = useParams<{ token: string }>()
  const { message, modal } = App.useApp()
  const isMobile = useIsMobile()

  // 分享信息与加载状态
  const [shareInfo, setShareInfo] = useState<SharePublicInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  // 协作者信息（含权限）
  const [collaborator, setCollaborator] = useState<Collaborator | null>(null)
  // 合同内容
  const [contract, setContract] = useState<ShareContract | null>(null)
  const [documentContent, setDocumentContent] = useState<DocumentContent | null>(null)
  // 最新内容 ref：保存时读取，避免 state 未刷新的竞态
  const contentRef = useRef<DocumentContent | null>(null)
  const editorRef = useRef<DocumentEditorHandle>(null)
  const [originalSnapshot, setOriginalSnapshot] = useState('')
  const [changes, setChanges] = useState<ContractChange[]>([])
  const [versions, setVersions] = useState<ContractVersionItem[]>([])
  const [confirmations, setConfirmations] = useState<ContractConfirmation[]>([])
  const [contentLoading, setContentLoading] = useState(false)
  // 操作 loading
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [viewingVersion, setViewingVersion] = useState<ContractVersionDetail | null>(null)
  const [activeChangeId, setActiveChangeId] = useState<number | null>(null)
  const [pageIndexByBlockId, setPageIndexByBlockId] = useState<Record<string, number>>({})
  const [conflictPayload, setConflictPayload] = useState<VersionConflictPayload | null>(null)
  const [conflictSaving, setConflictSaving] = useState(false)
  const [uploadingSeal, setUploadingSeal] = useState(false)

  const fetchShareConfirmProgress = useCallback(
    () => getShareConfirmProgress(token, name),
    [token, name],
  )

  const {
    users,
    isConnected,
    confirmProgress,
    setConfirmProgress,
    staleVersion,
    dismissStaleVersion,
  } = useCollaboration({
    shareToken: joined ? token : undefined,
    selfRole: 'collaborator',
    selfName: name,
    fetchConfirmProgress: joined && name ? fetchShareConfirmProgress : undefined,
    enabled: joined,
  })

  // 当前协作者权限：0 只读 1 可编辑
  const canEdit = collaborator?.permission === 1
  const isLocked = contract ? isContractLocked(contract.status) : false
  const editorReadOnly = !canEdit || isLocked || Boolean(viewingVersion)

  // 合同所有者水印：分享页展示与导出截图叠加
  const watermarkText = useMemo(() => {
    const wm = contract?.watermark
    if (!wm?.enabled || !wm.content?.trim()) return null
    return wm.content.trim()
  }, [contract?.watermark])
  const watermarkStyle = useMemo(() => {
    if (!watermarkText || !contract?.watermark) return null
    return pickWatermarkVisualStyle(contract.watermark)
  }, [watermarkText, contract?.watermark])

  const displayedContent = viewingVersion
    ? viewingVersion.document_content
    : documentContent

  /** 刷新变更条目「约第 N 页」 */
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

  /** 点击变更：定位并红绿高亮 */
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
          const v = await getShareVersionDetail(token, name, versionId)
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
    [displayedContent, message, name, refreshPageIndexMap, token],
  )

  /** 加载分享合同内容、变更记录与确认记录 */
  const loadContract = useCallback(
    async (collabName: string, restorePage?: number) => {
      setContentLoading(true)
      try {
        const [data, changeRes, versionRes, confirmRes, progress] = await Promise.all([
          getShareContract(token, collabName),
          getShareChanges(token, collabName, { page: 1, page_size: 50 }),
          getShareVersions(token, collabName, { page: 1, page_size: 50 }),
          getShareConfirmations(token, collabName),
          getShareConfirmProgress(token, collabName),
        ])
        setContract(data)
        const content = normalizeDocumentContent(data.document_content)
        setDocumentContent(content)
        contentRef.current = content
        setOriginalSnapshot(JSON.stringify(content))
        setChanges(changeRes.list)
        setVersions(versionRes.list)
        setConfirmations(confirmRes)
        setConfirmProgress(progress)
        setViewingVersion(null)
        setActiveChangeId(null)
        if (restorePage != null) {
          requestAnimationFrame(() => {
            editorRef.current?.setCurrentPage(restorePage)
          })
        }
      } catch {
        message.error('合同内容加载失败')
      } finally {
        setContentLoading(false)
      }
    },
    [token, message, setConfirmProgress],
  )

  // 首次加载：校验链接；若本地有姓名则向后端验证后加入
  useEffect(() => {
    getShareInfo(token)
      .then(async (info) => {
        setShareInfo(info)
        const savedName = sessionStorage.getItem(shareNameStorageKey(token))
        const savedPhone = sessionStorage.getItem(sharePhoneStorageKey(token))
        if (savedName && savedPhone) {
          setName(savedName)
          setPhone(savedPhone)
          try {
            const collab = await joinShare(token, savedName, savedPhone)
            setCollaborator(collab)
            setJoined(true)
            await loadContract(collab.name)
          } catch {
            sessionStorage.removeItem(shareNameStorageKey(token))
            sessionStorage.removeItem(sharePhoneStorageKey(token))
            setJoined(false)
          }
        }
      })
      .catch(() => {
        // 分享链接不存在 / 已失效
        setNotFound(true)
      })
      .finally(() => setLoading(false))
  }, [token, loadContract])

  /** 外部用户输入姓名与预留手机号加入协作 */
  const handleJoin = async () => {
    if (!name.trim()) {
      message.warning('请输入您的姓名')
      return
    }
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits.length !== 11) {
      message.warning('请输入正确的 11 位预留手机号')
      return
    }
    setJoining(true)
    try {
      const collab = await joinShare(token, name.trim(), phoneDigits)
      sessionStorage.setItem(shareNameStorageKey(token), name.trim())
      sessionStorage.setItem(sharePhoneStorageKey(token), phoneDigits)
      setCollaborator(collab)
      setJoined(true)
      await loadContract(collab.name)
    } catch {
      // 错误提示已在请求拦截器统一处理
    } finally {
      setJoining(false)
    }
  }

  /** 对方保存后刷新正文并保留当前页码 */
  const handleStaleRefresh = async () => {
    const savedPage = editorRef.current?.getCurrentPage() ?? 0
    const hasLocalChanges =
      originalSnapshot !== '' && JSON.stringify(contentRef.current) !== originalSnapshot
    const doRefresh = async () => {
      dismissStaleVersion()
      await loadContract(name, savedPage)
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

  /** 保存修改（外部提交新版本，支持冲突合并） */
  const handleSave = async () => {
    // 先失焦同步最新内容到 ref
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    if (isLocked) {
      message.warning('合同已确认锁定，无法继续编辑')
      return
    }
    const latestContent = contentRef.current
    if (!latestContent || JSON.stringify(latestContent) === originalSnapshot) {
      message.info('文档没有修改，无需保存')
      return
    }
    setSaving(true)
    try {
      const payload: DocumentContent = prepareSaveDocumentContent({
        ...latestContent,
        schema_version: 3,
        render_mode: 'web_canvas',
      })
      const result = await saveShareVersion(token, name, {
        document_content: payload,
        change_summary: `外部协作者 ${name} 提交修改`,
        base_version_id: contract?.current_version_id,
      })
      message.success(
        result.auto_merged
          ? `已自动合并对方修改并保存为 V${result.version_no}`
          : `已保存为 V${result.version_no}`,
      )
      dismissStaleVersion()
      await loadContract(name)
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

  /** 冲突弹窗确认后再次保存 */
  const handleConflictConfirm = async (resolved: DocumentContent, baseVersionId: number) => {
    setConflictSaving(true)
    try {
      const payload: DocumentContent = prepareSaveDocumentContent({
        ...resolved,
        schema_version: 3,
        render_mode: 'web_canvas',
      })
      const result = await saveShareVersion(token, name, {
        document_content: payload,
        change_summary: `外部协作者 ${name} 合并冲突后保存`,
        base_version_id: baseVersionId,
      })
      setConflictPayload(null)
      setDocumentContent(payload)
      contentRef.current = payload
      setOriginalSnapshot(JSON.stringify(payload))
      dismissStaleVersion()
      message.success(`冲突已解决，已保存为 V${result.version_no}`)
      await loadContract(name)
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

  /** 外部确认并归档终稿 PDF */
  const handleConfirm = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    const hasChanges =
      originalSnapshot !== '' && JSON.stringify(documentContent) !== originalSnapshot
    if (hasChanges && canEdit && !isLocked) {
      message.warning('当前文档有未保存修改，请先保存后再确认')
      return
    }
    if (!contract || !collaborator) {
      message.error('请先输入姓名加入协作')
      return
    }
    const versionId = contract.current_version_id
    if (
      versionId &&
      hasUserConfirmedVersion(
        confirmations,
        versionId,
        1,
        undefined,
        collaborator.collaborator_id,
      )
    ) {
      message.info('您已确认过当前版本')
      return
    }

    setConfirming(true)
    const hide = message.loading({ content: '正在处理确认…', duration: 0, key: 'share-confirm' })
    try {
      const progress = await getShareConfirmProgress(token, name)
      const needPdf = willFinalizeAfterConfirm(progress, 1)

      if (!needPdf) {
        const outcome = await confirmShareAck(token, name)
        message.success(outcome.message)
        await loadContract(name)
        return
      }

      message.loading({ content: '正在生成终稿 PDF…', duration: 0, key: 'share-confirm' })
      const { verify_code, public_web_origin } = await prepareShareFinalExport(token, name)
      const baseName = contract.contract_no ?? 'contract'
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

      const outcome = await confirmShareWithPdf(token, name, {
        file: pdfBlob,
        hash,
        page_count: withQr.length,
        verify_code,
      })
      downloadPdf(pdfBlob, `${baseName}-终稿`)
      message.success(outcome.message)
      await loadContract(name)
    } catch (error) {
      if (error instanceof Error && !error.message.includes('请求')) {
        message.error(error.message)
      }
    } finally {
      hide()
      setConfirming(false)
    }
  }

  /** 导出 PDF：未锁定叠加验真二维码；已锁定下载归档终稿 */
  const handleExportPdf = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    const hasChanges =
      originalSnapshot !== '' && JSON.stringify(documentContent) !== originalSnapshot
    if (hasChanges && canEdit && !isLocked) {
      message.warning('当前文档有未保存修改，请先保存后再导出')
      return
    }
    setDownloading(true)
    try {
      const baseName = contract?.contract_no ?? 'contract'

      // 已确认锁定：下载 OSS 终稿（含水印与验真二维码）
      if (isLocked) {
        const info = await getShareExportPdf(token, name)
        if (info.pdf_url) {
          window.open(info.pdf_url, '_blank', 'noopener,noreferrer')
          message.success('正在打开终稿 PDF')
        } else {
          message.warning('暂无终稿 PDF 归档')
        }
        return
      }

      const pages =
        (await editorRef.current?.preparePagesForExport()) ??
        collectExportPageElements(editorRef.current?.getExportRoot() ?? document.body)
      if (pages.length === 0) throw new Error('文档为空，无法导出')

      // 草稿导出：DOM 含水印，并叠加验真二维码标签
      const { verify_code, public_web_origin } = await prepareShareFinalExport(token, name)
      const pngBlobs = await exportPagesAsPng(pages, { pixelRatio: PDF_EXPORT_PIXEL_RATIO })
      const withQr = await Promise.all(
        pngBlobs.map((blob, index) =>
          overlayQrWatermark(blob, verify_code, index + 1, public_web_origin),
        ),
      )
      const pdfBlob = await exportPagesAsPdf(withQr)
      const hash = await sha256Blob(pdfBlob)
      downloadPdf(pdfBlob, `${baseName}-草稿`)
      message.success(`已导出 ${withQr.length} 页 PDF`)

      if (canEdit) {
        try {
          await uploadShareExportPdf(token, name, pdfBlob, hash, withQr.length, true)
        } catch {
          // 草稿归档失败不影响本地下载
        }
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'PDF 导出失败')
    } finally {
      setDownloading(false)
    }
  }

  const selfConfirmed =
    contract?.current_version_id != null &&
    collaborator != null &&
    hasUserConfirmedVersion(
      confirmations,
      contract.current_version_id,
      1,
      undefined,
      collaborator.collaborator_id,
    )

  const latestVersionTime = versions[0]?.create_time
  const permissionLabel = canEdit ? '可编辑' : '只读'

  /** 退出变更/历史查看：留在当前页，恢复可编辑（权限允许时） */
  const handleResumeEdit = useCallback(() => {
    const page = editorRef.current?.getCurrentPage() ?? 0
    const fromHistory = Boolean(viewingVersion)
    setViewingVersion(null)
    setActiveChangeId(null)
    editorRef.current?.setChangeHighlight(null)
    if (!fromHistory) return
    const restorePage = () => editorRef.current?.setCurrentPage(page)
    requestAnimationFrame(() => {
      requestAnimationFrame(restorePage)
    })
    window.setTimeout(restorePage, 120)
    window.setTimeout(restorePage, 320)
  }, [viewingVersion])

  // 加载中
  if (loading) {
    return (
      <div className="share-page share-page--center">
        <Card style={{ width: 420 }}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      </div>
    )
  }

  // 链接无效 / 已失效
  if (notFound || !shareInfo) {
    return (
      <div className="share-page share-page--center">
        <Result
          icon={<SafetyCertificateOutlined style={{ color: '#ff4d4f' }} />}
          title="分享链接不存在或已失效"
          subTitle="请联系合同创建者重新获取有效的分享链接。"
        />
      </div>
    )
  }

  return (
    <div className={`share-page${isMobile ? ' share-page--mobile' : ''}`}>
      <header className="share-page__topbar">
        <div className="share-page__topbar-left">
          <BrandLogo size={isMobile ? 28 : 32} />
          {!isMobile ? (
            <span className="share-page__brand-name">心智协同 · 合同协作系统</span>
          ) : (
            <span className="share-page__brand-name">合同协作</span>
          )}
          {joined ? (
            <Tag className="share-page__mode-tag">
              {isMobile ? permissionLabel : `外部协作（${permissionLabel}）`}
            </Tag>
          ) : (
            <Tag className="share-page__mode-tag">{isMobile ? '邀请' : '外部协作邀请'}</Tag>
          )}
        </div>
        <div className="share-page__topbar-right">
          {joined ? (
            <>
              {!isMobile ? (
                <span className="share-page__share-hint">
                  <LinkOutlined />
                  通过链接分享中
                </span>
              ) : null}
              {!isMobile && latestVersionTime ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  最近保存 {dayjs(latestVersionTime).format('YYYY-MM-DD HH:mm')}
                </Typography.Text>
              ) : null}
              <div className="share-page__user">
                {!isMobile ? <span className="share-page__user-name">{name}</span> : null}
                <Avatar size={28} style={{ backgroundColor: '#00b96b' }} icon={<UserOutlined />}>
                  {name.slice(0, 1)}
                </Avatar>
              </div>
            </>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {isMobile ? '验证后进入' : '安全门禁验证后进入'}
            </Typography.Text>
          )}
        </div>
      </header>

      <main className="share-page__content">
        {!joined && (
          <Card className="share-page__join">
            <Typography.Title level={4} style={{ marginTop: 0 }}>
              进入合同协作
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              您收到一份合同协作邀请。为保护合同内容，请输入与合同档案一致的
              <strong>客户姓名</strong>与<strong>预留手机号</strong>后再查看与编辑在线合同。
            </Typography.Paragraph>
            {shareInfo && (
              <Space size="middle" style={{ marginBottom: 16 }} wrap>
                <Tag>{shareInfo.permission_text}</Tag>
                {shareInfo.expire_time && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    链接有效期至：{new Date(shareInfo.expire_time).toLocaleString()}
                  </Typography.Text>
                )}
              </Space>
            )}
            <Space orientation="vertical" size="middle" style={{ width: '100%', maxWidth: 400 }}>
              <Input
                placeholder="请输入客户姓名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={32}
                size="large"
              />
              <Input
                placeholder="请输入预留手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={20}
                size="large"
                onPressEnter={() => void handleJoin()}
              />
              <Button type="primary" size="large" loading={joining} onClick={() => void handleJoin()} block>
                进入查看
              </Button>
            </Space>
          </Card>
        )}

        {joined && (
          <>
            <div className="share-page__doc-head">
              <Typography.Title level={3} className="share-page__doc-title">
                {contract?.contract_name ?? '加载中…'}
              </Typography.Title>
              <div className="share-page__meta">
                <span className="share-page__meta-item">
                  <span className="share-page__meta-label">合同编号</span>
                  {contract?.contract_no ?? '—'}
                </span>
                <span className="share-page__meta-item">
                  <span className="share-page__meta-label">当前版本</span>
                  {contract ? <Tag color="blue">V{contract.current_version_no}</Tag> : '—'}
                </span>
                <span className="share-page__meta-item">
                  <span className="share-page__meta-label">身份</span>
                  <Tag color="green">外部协作者 · {permissionLabel}</Tag>
                </span>
                <span className="share-page__meta-item">
                  <span className="share-page__meta-label">状态</span>
                  {contract ? <ContractStatusTag status={contract.status} /> : null}
                </span>
                <span className="share-page__meta-item">
                  <span className="share-page__meta-label">分享</span>
                  <Tag icon={<LinkOutlined />}>链接已启用</Tag>
                </span>
              </div>
            </div>

            {contentLoading ? (
              <Card>
                <Skeleton active paragraph={{ rows: 8 }} />
              </Card>
            ) : (
              <Row gutter={[16, 16]} className="share-page__body">
                <Col xs={24} lg={16}>
                  <div className="share-page__main">
                    {!isMobile ? (
                      <Alert
                        className="share-page__tip"
                        type="success"
                        showIcon
                        message={
                          canEdit && !isLocked
                            ? '当前由外部协作者编辑中；网页按页预览，导出以 PDF 为准。'
                            : isLocked
                              ? '合同已确认锁定，仅可查看与导出 PDF。'
                              : '当前为只读分享，您可查看与导出 PDF。'
                        }
                      />
                    ) : null}

                    <Card className="share-page__editor-card" styles={{ body: { padding: 0 } }}>
                      <div className="share-page__editor-workspace">
                        <div className="share-page__editor-banners">
                          <ConfirmStatusBanner
                            progress={confirmProgress}
                            viewerType={1}
                            contractStatus={contract?.status ?? 0}
                            currentVersionNo={contract?.current_version_no ?? 1}
                            selfConfirmed={selfConfirmed}
                          />
                          <StaleContentBanner
                            payload={staleVersion}
                            onRefresh={() => void handleStaleRefresh()}
                            onDismiss={dismissStaleVersion}
                            disabled={isLocked || Boolean(viewingVersion)}
                          />
                          {viewingVersion && (
                            <Alert
                              type="info"
                              showIcon
                              message={`正在查看历史版本 V${viewingVersion.version_no}（只读）`}
                              action={
                                <Button size="small" type="link" onClick={handleResumeEdit}>
                                  返回编辑
                                </Button>
                              }
                            />
                          )}
                        </div>
                        {canEdit && !isLocked && !viewingVersion ? (
                          <div style={{ marginBottom: 10 }}>
                            <Upload
                              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                              showUploadList={false}
                              disabled={uploadingSeal}
                              beforeUpload={(file) => {
                                const lower = file.name.toLowerCase()
                                if (!/\.(png|jpe?g|webp)$/.test(lower)) {
                                  message.error('仅支持 PNG / JPEG / WebP')
                                  return false
                                }
                                if (file.size > 2 * 1024 * 1024) {
                                  message.error('印章不能超过 2MB')
                                  return false
                                }
                                const pageIndex = editorRef.current?.getCurrentPage?.() ?? 0
                                void (async () => {
                                  setUploadingSeal(true)
                                  try {
                                    const uploaded = await uploadShareSeal(token, name, file)
                                    const seal: DocumentSeal = {
                                      id: `seal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                                      oss_key: uploaded.oss_key,
                                      image_url: '',
                                      page_index: pageIndex,
                                      x_ratio: 0.72,
                                      y_ratio: 0.78,
                                      scale: 1,
                                      placed_by: 'external',
                                      placed_at: new Date().toISOString(),
                                    }
                                    const base = contentRef.current
                                    if (!base) return
                                    const nextSeals = [...(base.seals ?? []), seal]
                                    if (nextSeals.length > 20) {
                                      message.warning('单份合同最多 20 枚电子章')
                                      return
                                    }
                                    const next = { ...base, seals: nextSeals }
                                    contentRef.current = next
                                    setDocumentContent(next)
                                    message.success(
                                      `已盖章到第 ${pageIndex + 1} 页，请保存版本后对方可见`,
                                    )
                                  } catch (e) {
                                    message.error(getApiErrorMessage(e, '盖章上传失败'))
                                  } finally {
                                    setUploadingSeal(false)
                                  }
                                })()
                                return false
                              }}
                            >
                              <Button
                                icon={<AuditOutlined />}
                                size={isMobile ? 'middle' : 'small'}
                                loading={uploadingSeal}
                              >
                                上传电子章并盖章
                              </Button>
                            </Upload>
                          </div>
                        ) : null}
                        <DocumentEditor
                          ref={editorRef}
                          documentContent={
                            viewingVersion ? viewingVersion.document_content : documentContent
                          }
                          onChange={(content) => {
                            contentRef.current = content
                            setDocumentContent(content)
                          }}
                          readOnly={editorReadOnly}
                          watermarkText={watermarkText}
                          watermarkStyle={watermarkStyle}
                          sealInteractive={canEdit && !isLocked && !viewingVersion}
                          sealDisplayContext={
                            token ? { mode: 'share', shareToken: token } : null
                          }
                          uploadSealImage={(file) => uploadShareSeal(token, name, file)}
                        />
                        <OnlinePresenceFloat users={users} isConnected={isConnected} />
                        <ChangeInspectExitFloat
                          visible={Boolean(viewingVersion) || activeChangeId != null}
                          canEdit={canEdit && !isLocked}
                          viewingHistory={Boolean(viewingVersion)}
                          versionNo={viewingVersion?.version_no}
                          onExit={handleResumeEdit}
                        />
                      </div>
                    </Card>
                  </div>
                </Col>

                <Col xs={24} lg={8} className="share-page__side-col">
                  {isMobile ? (
                    <Card className="share-page__panel share-page__panel--mobile-tabs">
                      <Tabs
                        size="small"
                        items={[
                          {
                            key: 'versions',
                            label: '版本记录',
                            children: (
                              <div className="share-page__mobile-tab-pane">
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
                            key: 'confirms',
                            label: '确认记录',
                            children: (
                              <div className="share-page__mobile-tab-pane">
                                {confirmations.length === 0 ? (
                                  <Typography.Text type="secondary">暂无确认记录</Typography.Text>
                                ) : (
                                  confirmations.map((item) => (
                                    <div key={item.id} className="share-page__confirm-item">
                                      <Space size="small" wrap>
                                        <Typography.Text strong>{item.confirmer_name}</Typography.Text>
                                        <Tag color={item.confirm_status === 1 ? 'green' : 'default'}>
                                          {item.confirm_status === 1 ? '已确认' : '已取消确认'}
                                        </Tag>
                                      </Space>
                                      <div>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                          {dayjs(item.confirm_time).format('YYYY-MM-DD HH:mm')}
                                        </Typography.Text>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            ),
                          },
                        ]}
                      />
                    </Card>
                  ) : (
                    <div className="share-page__side">
                      <Card title="版本记录" className="share-page__panel share-page__panel--versions">
                        <ChangeTimeline
                          changes={changes}
                          versions={versions}
                          activeChangeId={activeChangeId}
                          onLocateChange={(change) => void handleLocateChange(change)}
                          pageIndexByBlockId={pageIndexByBlockId}
                        />
                      </Card>

                      <Card title="操作" className="share-page__panel">
                        <div className="share-page__collab-box">
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            当前协作者
                          </Typography.Text>
                          <div>
                            <Typography.Text strong>{name}</Typography.Text>
                            <Tag style={{ marginLeft: 8 }} color={canEdit ? 'success' : 'default'}>
                              {permissionLabel}
                            </Tag>
                          </div>
                          <Typography.Paragraph
                            type="secondary"
                            style={{ margin: '6px 0 0', fontSize: 12 }}
                          >
                            {canEdit && !isLocked
                              ? '可编辑文档并保存新版本'
                              : isLocked
                                ? '合同已锁定，仅可查看与导出'
                                : '只读链接，仅可查看与导出 PDF'}
                          </Typography.Paragraph>
                        </div>
                        <ConfirmActionBar
                          layout="vertical"
                          onSave={handleSave}
                          onConfirm={handleConfirm}
                          onDownload={handleExportPdf}
                          saving={saving}
                          confirming={confirming}
                          downloading={downloading}
                          editReadOnly={editorReadOnly}
                        />
                      </Card>

                      <Card title="确认记录" className="share-page__panel">
                        {confirmations.length === 0 ? (
                          <Typography.Text type="secondary">暂无确认记录</Typography.Text>
                        ) : (
                          confirmations.map((item) => (
                            <div key={item.id} className="share-page__confirm-item">
                              <Space size="small" wrap>
                                <Typography.Text strong>{item.confirmer_name}</Typography.Text>
                                <Tag color={item.confirm_status === 1 ? 'green' : 'default'}>
                                  {item.confirm_status === 1 ? '已确认' : '已取消确认'}
                                </Tag>
                                <Tag color={item.confirmer_type === 0 ? 'blue' : 'orange'}>
                                  {item.confirmer_type === 0 ? '内部用户' : '外部协作者'}
                                </Tag>
                              </Space>
                              <div>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                  {dayjs(item.confirm_time).format('YYYY-MM-DD HH:mm')}
                                </Typography.Text>
                              </div>
                            </div>
                          ))
                        )}
                      </Card>
                    </div>
                  )}
                </Col>
              </Row>
            )}
          </>
        )}
      </main>

      {/* 手机端底部固定操作栏，便于单手保存 / 确认 / 导出 */}
      {joined && isMobile && !contentLoading ? (
        <div className="share-page__mobile-dock">
          <div className="share-page__mobile-dock-meta">
            <Typography.Text strong ellipsis style={{ maxWidth: '46vw' }}>
              {name}
            </Typography.Text>
            <Tag color={canEdit ? 'success' : 'default'} style={{ margin: 0 }}>
              {permissionLabel}
            </Tag>
          </div>
          <ConfirmActionBar
            layout="horizontal"
            compact
            onSave={handleSave}
            onConfirm={handleConfirm}
            onDownload={handleExportPdf}
            saving={saving}
            confirming={confirming}
            downloading={downloading}
            editReadOnly={editorReadOnly}
          />
        </div>
      ) : null}

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
