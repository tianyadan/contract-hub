import { useEffect, useState } from 'react'
import { Modal, Spin } from 'antd'
import './fidelity-pdf-viewer.css'

interface FidelityPdfViewerProps {
  open: boolean
  /** 通过后端代理拉取 PDF Blob，避免直接访问 OSS 触发下载拦截 */
  loadPdf: (() => Promise<Blob>) | null
  title?: string
  onClose: () => void
}

/**
 * 高保真阅览 PDF 弹层（blob URL + iframe 内嵌，本期不提供下载）。
 */
export default function FidelityPdfViewer({
  open,
  loadPdf,
  title = '高保真阅览',
  onClose,
}: FidelityPdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !loadPdf) {
      setBlobUrl(null)
      setLoading(false)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)
    setBlobUrl(null)

    void loadPdf()
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) {
          setBlobUrl(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [open, loadPdf])

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      width="90vw"
      style={{ top: 24, maxWidth: 1200 }}
      destroyOnHidden
      className="fidelity-pdf-viewer-modal"
    >
      <div className="fidelity-pdf-viewer-modal__body">
        {loading ? (
          <div className="fidelity-pdf-viewer-modal__loading">
            <Spin tip="正在加载高保真阅览…" />
          </div>
        ) : null}
        {blobUrl ? (
          <iframe
            className="fidelity-pdf-viewer-modal__frame"
            src={blobUrl}
            title={title}
          />
        ) : null}
      </div>
    </Modal>
  )
}
