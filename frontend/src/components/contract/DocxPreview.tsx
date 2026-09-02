import { useEffect, useRef, useState } from 'react'
import { Spin, Alert } from 'antd'
import { renderAsync } from 'docx-preview'
import './docx-preview.css'

interface DocxPreviewProps {
  /** DOCX 文件二进制数据 */
  data: ArrayBuffer | null
  /** 加载中文案 */
  loadingText?: string
  /** 外层类名 */
  className?: string
}

/**
 * 高保真 DOCX 预览组件（基于 docx-preview）。
 * 用于模板池、合同详情等需要还原 WPS 排版的场景。
 */
export default function DocxPreview({
  data,
  loadingText = '正在加载文档预览…',
  className = '',
}: DocxPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !data) {
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    container.innerHTML = ''

    renderAsync(data, container, undefined, {
      className: 'docx-preview-wrapper',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
    })
      .then(() => {
        if (!cancelled) setLoading(false)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoading(false)
          setError(err instanceof Error ? err.message : '文档预览失败')
        }
      })

    return () => {
      cancelled = true
    }
  }, [data])

  if (!data) {
    return (
      <div className={`docx-preview docx-preview--empty ${className}`}>
        <Alert type="info" showIcon message="暂无可预览的文档" />
      </div>
    )
  }

  return (
    <div className={`docx-preview ${className}`}>
      {loading && (
        <div className="docx-preview__loading">
          <Spin tip={loadingText} />
        </div>
      )}
      {error && <Alert type="error" showIcon message={error} className="docx-preview__error" />}
      <div ref={containerRef} className="docx-preview__container" />
    </div>
  )
}
