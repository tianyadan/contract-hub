import { Modal } from 'antd'
import './fidelity-pdf-viewer.css'

interface FidelityPdfViewerProps {
  open: boolean
  pdfUrl: string | null
  title?: string
  onClose: () => void
}

/**
 * 高保真阅览 PDF 弹层（iframe 内嵌，本期不提供下载）。
 */
export default function FidelityPdfViewer({
  open,
  pdfUrl,
  title = '高保真阅览',
  onClose,
}: FidelityPdfViewerProps) {
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
      {pdfUrl ? (
        <iframe
          className="fidelity-pdf-viewer-modal__frame"
          src={pdfUrl}
          title={title}
        />
      ) : null}
    </Modal>
  )
}
