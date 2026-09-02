import { useCallback, useRef, useState } from 'react'
import { App, Button } from 'antd'
import { FileSearchOutlined } from '@ant-design/icons'
import type { RefObject } from 'react'
import type { DocumentEditorHandle } from '../components/contract/DocumentEditor'
import type { DocumentContent } from '../types/contract'
import type { FidelitySnapshot, FidelitySnapshotDetail } from '../types/fidelity'
import { generateFidelityPreviewPdf } from '../utils/generateFidelityPreview'

export interface FidelityApiAdapter {
  list: () => Promise<FidelitySnapshot[]>
  create: (payload: {
    file: Blob
    hash: string
    page_count: number
    source_version_no: number
    document_content: DocumentContent
  }) => Promise<FidelitySnapshotDetail>
  getDetail: (snapshotId: number) => Promise<FidelitySnapshotDetail>
  /** 通过后端代理获取 PDF Blob，用于内嵌预览 */
  fetchPdf: (snapshotId: number) => Promise<Blob>
  rollback?: (snapshotId: number) => Promise<unknown>
}

interface UseFidelitySnapshotsOptions {
  entityLabel: string
  currentVersionNo: number
  documentContent: DocumentContent | null
  contentSnapshot: string
  editorRef: RefObject<DocumentEditorHandle | null>
  api: FidelityApiAdapter
  rollbackDisabled?: boolean
  onRollbackSuccess?: () => void | Promise<void>
  onGenerateSuccess?: () => void | Promise<void>
}

/**
 * 高保真快照：生成、列表、预览、回退。
 */
export function useFidelitySnapshots(options: UseFidelitySnapshotsOptions) {
  const { message } = App.useApp()
  const [snapshots, setSnapshots] = useState<FidelitySnapshot[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewTitle, setPreviewTitle] = useState('高保真阅览')
  const previewSnapshotIdRef = useRef<number | null>(null)

  /** 加载快照列表 */
  const loadSnapshots = useCallback(async () => {
    setLoadingList(true)
    try {
      const list = await options.api.list()
      setSnapshots(list)
    } catch {
      // 错误已在拦截器处理
    } finally {
      setLoadingList(false)
    }
  }, [options.api])

  /** 打开预览弹层 */
  const openPreview = useCallback(
    (snapshotId: number, title: string) => {
      previewSnapshotIdRef.current = snapshotId
      setPreviewTitle(title)
      setPreviewOpen(true)
    },
    [],
  )

  /** 关闭预览弹层 */
  const closePreview = useCallback(() => {
    previewSnapshotIdRef.current = null
    setPreviewOpen(false)
  }, [])

  /** 供 FidelityPdfViewer 调用的 PDF 加载器 */
  const previewLoadPdf = useCallback(async () => {
    const snapshotId = previewSnapshotIdRef.current
    if (snapshotId == null) {
      throw new Error('快照不存在')
    }
    return options.api.fetchPdf(snapshotId)
  }, [options.api])

  /** 手动生成高保真阅览 */
  const handleGenerate = useCallback(async () => {
    if (!options.documentContent) {
      message.warning('暂无文档内容')
      return
    }
    const hasChanges =
      options.contentSnapshot !== '' &&
      JSON.stringify(options.documentContent) !== options.contentSnapshot
    if (hasChanges) {
      message.warning('当前有未保存修改，请先保存后再生成高保真阅览')
      return
    }
    setGenerating(true)
    const hide = message.loading({ content: '正在生成高保真阅览…', duration: 0, key: 'fidelity-gen' })
    try {
      const { pdfBlob, hash, pageCount } = await generateFidelityPreviewPdf({
        editorRef: options.editorRef,
        documentContent: options.documentContent,
      })
      const result = await options.api.create({
        file: pdfBlob,
        hash,
        page_count: pageCount,
        source_version_no: options.currentVersionNo,
        document_content: options.documentContent,
      })
      message.success('高保真阅览已生成')
      openPreview(result.snapshot_id, `${options.entityLabel} · 快照 #${result.snapshot_no}`)
      await loadSnapshots()
      await options.onGenerateSuccess?.()
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message)
      }
    } finally {
      hide()
      setGenerating(false)
    }
  }, [options, message, loadSnapshots, openPreview])

  /** 预览已有快照 */
  const handlePreview = useCallback(
    async (snapshot: FidelitySnapshot) => {
      openPreview(snapshot.snapshot_id, `${options.entityLabel} · 快照 #${snapshot.snapshot_no}`)
    },
    [options.entityLabel, openPreview],
  )

  /** 回退到快照 */
  const handleRollback = useCallback(
    async (snapshot: FidelitySnapshot) => {
      if (!options.api.rollback) return
      const hide = message.loading({ content: '正在回退…', duration: 0, key: 'fidelity-rollback' })
      try {
        await options.api.rollback(snapshot.snapshot_id)
        message.success('已回退至快照内容')
        await options.onRollbackSuccess?.()
      } finally {
        hide()
      }
    },
    [options.api, message, options.onRollbackSuccess],
  )

  const generateButton = (
    <Button
      type="default"
      icon={<FileSearchOutlined />}
      loading={generating}
      onClick={() => void handleGenerate()}
      block
    >
      生成高保真阅览
    </Button>
  )

  return {
    snapshots,
    loadingList,
    generating,
    previewOpen,
    previewTitle,
    previewLoadPdf: previewOpen ? previewLoadPdf : null,
    setPreviewOpen: closePreview,
    loadSnapshots,
    handleGenerate,
    handlePreview,
    handleRollback,
    generateButton,
  }
}
