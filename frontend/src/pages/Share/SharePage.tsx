import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Input,
  Result,
  Row,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd'
import { SafetyCertificateOutlined } from '@ant-design/icons'
import {
  confirmShareAck,
  confirmShareWithPdf,
  getShareChanges,
  getShareConfirmations,
  getShareContract,
  getShareInfo,
  getShareVersions,
  getShareConfirmProgress,
  joinShare,
  prepareShareFinalExport,
  saveShareVersion,
  uploadShareExportPdf,
} from '../../api/shareApi'
import type {
  Collaborator,
  ContractChange,
  ContractConfirmation,
  ContractVersionItem,
  DocumentContent,
  ShareContract,
  SharePublicInfo,
} from '../../types/contract'
import ContractStatusTag from '../../components/ContractStatusTag'
import DocumentEditor, { type DocumentEditorHandle } from '../../components/contract/DocumentEditor'
import ChangeTimeline from '../../components/contract/ChangeTimeline'
import CollapsibleScrollSection from '../../components/contract/CollapsibleScrollSection'
import OnlinePresenceBar from '../../components/contract/OnlinePresenceBar'
import ConfirmStatusBanner from '../../components/contract/ConfirmStatusBanner'
import StaleContentBanner from '../../components/contract/StaleContentBanner'
import ConfirmActionBar from '../../components/contract/ConfirmActionBar'
import { useCollaboration } from '../../hooks/useCollaboration'
import { isContractLocked, normalizeDocumentContent } from '../../utils/documentContent'
import { hasUserConfirmedVersion, willFinalizeAfterConfirm } from '../../utils/confirmProgress'
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
  const editorReadOnly = !canEdit || isLocked

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

  /** 保存修改（外部提交新版本） */
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
      const result = await saveShareVersion(token, name, {
        document_content: {
          ...latestContent,
          schema_version: 3,
          render_mode: 'web_canvas',
        },
        change_summary: `外部协作者 ${name} 提交修改`,
      })
      message.success(`已保存为 V${result.version_no}`)
      await loadContract(name)
    } catch {
      // 错误提示已在请求拦截器统一处理
    } finally {
      setSaving(false)
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

      const pngBlobs = await exportPagesAsPng(pages, { draft: false, pixelRatio: PDF_EXPORT_PIXEL_RATIO })
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

  /** 导出草稿 PDF */
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
      const pages =
        (await editorRef.current?.preparePagesForExport()) ??
        collectExportPageElements(editorRef.current?.getExportRoot() ?? document.body)
      if (pages.length === 0) throw new Error('文档为空，无法导出')

      const pngBlobs = await exportPagesAsPng(pages, { draft: !isLocked, pixelRatio: PDF_EXPORT_PIXEL_RATIO })
      const pdfBlob = await exportPagesAsPdf(pngBlobs)
      const hash = await sha256Blob(pdfBlob)
      downloadPdf(pdfBlob, !isLocked ? `${baseName}-草稿` : `${baseName}-终稿`)
      message.success(`已导出 ${pngBlobs.length} 页 PDF`)

      if (!isLocked && canEdit) {
        try {
          await uploadShareExportPdf(token, name, pdfBlob, hash, pngBlobs.length, true)
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

  // 加载中
  if (loading) {
    return (
      <div className="share-page">
        <Card>
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
    <div className="share-page">
      {/* 顶部品牌条 */}
      <header className="share-page__brand">
        <Space>
          <span className="share-page__brand-dot" />
          <span className="share-page__brand-name">心智协同 · 合同协作系统</span>
          {joined && shareInfo && (
            <Tag color="green" style={{ marginLeft: 8 }}>
              外部协作{shareInfo.permission === 0 ? '（只读）' : '（可编辑）'}
            </Tag>
          )}
        </Space>
      </header>

      <main className="share-page__content">
        {!joined && (
          <Card className="share-page__join share-page__join--gate">
            <Typography.Title level={4} style={{ marginTop: 0 }}>
              进入合同协作
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              您收到一份合同协作邀请。为保护合同内容，请输入与合同档案一致的
              <strong>客户姓名</strong>与<strong>预留手机号</strong>后再查看与编辑在线合同。
            </Typography.Paragraph>
            {shareInfo && (
              <Space size="middle" style={{ marginBottom: 16 }}>
                <Tag>{shareInfo.permission_text}</Tag>
                {shareInfo.expire_time && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    链接有效期至：{new Date(shareInfo.expire_time).toLocaleString()}
                  </Typography.Text>
                )}
              </Space>
            )}
            <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 400 }}>
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
                onPressEnter={handleJoin}
              />
              <Button type="primary" size="large" loading={joining} onClick={handleJoin} block>
                进入查看
              </Button>
            </Space>
          </Card>
        )}

        {joined && (
          <>
            <Card className="share-page__info">
              <Typography.Title level={4} style={{ margin: 0 }}>
                {contract?.contract_name ?? '加载中…'}
              </Typography.Title>
              <Space size="middle" style={{ marginTop: 4 }}>
                <Typography.Text type="secondary">{contract?.contract_no}</Typography.Text>
                {contract && <ContractStatusTag status={contract.status} />}
              </Space>
            </Card>
            {contentLoading ? (
              <Card>
                <Skeleton active paragraph={{ rows: 8 }} />
              </Card>
            ) : (
              <Row gutter={16}>
                <Col xs={24} lg={16}>
                  <Card
                    title={
                      <Space>
                        文档内容
                        {!canEdit && <Tag>只读模式</Tag>}
                      </Space>
                    }
                  >
                    <OnlinePresenceBar users={users} isConnected={isConnected} />
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
                      disabled={isLocked}
                    />
                    <DocumentEditor
                      ref={editorRef}
                      documentContent={documentContent}
                      onChange={(content) => {
                        contentRef.current = content
                        setDocumentContent(content)
                      }}
                      readOnly={editorReadOnly}
                    />
                  </Card>
                </Col>
                <Col xs={24} lg={8}>
                  <CollapsibleScrollSection
                    panelKey="share-change-timeline"
                    title="版本记录"
                    count={versions.length}
                    maxVisibleRows={5}
                    rowHeight={88}
                  >
                    <ChangeTimeline changes={changes} versions={versions} />
                  </CollapsibleScrollSection>

                  <Card title="操作" className="share-page__actions">
                    <Alert
                      type={canEdit ? 'success' : 'warning'}
                      showIcon
                      message={`当前协作者：${name}`}
                      description={
                        canEdit && !isLocked
                          ? '您可以编辑文档并保存新版本'
                          : isLocked
                            ? '合同已确认锁定，仅可查看与导出 PDF'
                            : '该分享链接为只读，您仅可查看与导出 PDF'
                      }
                      style={{ marginBottom: 12 }}
                    />
                    <ConfirmActionBar
                      onSave={handleSave}
                      onConfirm={handleConfirm}
                      onDownload={handleExportPdf}
                      saving={saving}
                      confirming={confirming}
                      downloading={downloading}
                      editReadOnly={editorReadOnly}
                    />
                  </Card>

                  <Card title="确认记录" className="share-page__actions">
                    {confirmations.length === 0 ? (
                      <Typography.Text type="secondary">暂无确认记录</Typography.Text>
                    ) : (
                      confirmations.map((item) => (
                        <Space key={item.id} orientation="vertical" size={0} style={{ width: '100%' }}>
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
                            {new Date(item.confirm_time).toLocaleString()}
                          </Typography.Text>
                        </Space>
                      ))
                    )}
                  </Card>
                </Col>
              </Row>
            )}
          </>
        )}
      </main>
    </div>
  )
}
