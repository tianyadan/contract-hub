import type { DocumentSeal } from '../../types/contract'
import { resolveSealDisplaySrc, type SealDisplayContext } from '../../utils/sealUrl'
import './document-seal-layer.css'

interface DocumentSealLayerProps {
  /** 当前页要渲染的印章 */
  seals: DocumentSeal[]
  /** 展示上下文：合同 / 分享 */
  displayContext?: SealDisplayContext
  /** 是否可交互（拖拽/选中） */
  interactive?: boolean
  /** 当前选中实例 */
  selectedId?: string | null
  /** 选中回调 */
  onSelect?: (id: string | null) => void
  /** 拖拽结束更新位置 */
  onMove?: (id: string, xRatio: number, yRatio: number) => void
  /** 缩放 */
  onScale?: (id: string, scale: number) => void
  /** 删除实例 */
  onRemove?: (id: string) => void
  /** 纸面 fitScale，用于坐标换算 */
  fitScale?: number
}

/**
 * 纸面电子章层：绝对定位于 .doc-page 内，导出宿主同样挂载。
 */
export default function DocumentSealLayer({
  seals,
  displayContext,
  interactive = false,
  selectedId = null,
  onSelect,
  onMove,
  onScale,
  onRemove,
  fitScale = 1,
}: DocumentSealLayerProps) {
  if (!seals.length) return null

  return (
    <div className="doc-seal-layer" data-export-keep="1">
      {seals.map((seal) => {
        const selected = interactive && selectedId === seal.id
        const widthPct = Math.min(40, Math.max(8, 22 * (seal.scale || 1)))
        const src = resolveSealDisplaySrc(seal, displayContext)
        return (
          <div
            key={seal.id}
            className={`doc-seal${selected ? ' doc-seal--selected' : ''}${interactive ? ' doc-seal--interactive' : ''}`}
            style={{
              left: `${(seal.x_ratio || 0.5) * 100}%`,
              top: `${(seal.y_ratio || 0.5) * 100}%`,
              width: `${widthPct}%`,
              transform: `translate(-50%, -50%) rotate(${seal.rotate || 0}deg)`,
              pointerEvents: interactive ? 'auto' : 'none',
            }}
            onMouseDown={
              interactive
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onSelect?.(seal.id)
                    const page = (e.currentTarget.closest('.doc-page') as HTMLElement) || null
                    if (!page || !onMove) return
                    const startX = e.clientX
                    const startY = e.clientY
                    const startXR = seal.x_ratio
                    const startYR = seal.y_ratio
                    const scale = fitScale > 0 ? fitScale : 1

                    const onMoveWin = (ev: MouseEvent) => {
                      const rect = page.getBoundingClientRect()
                      const dx = (ev.clientX - startX) / (rect.width || 1)
                      const dy = (ev.clientY - startY) / (rect.height || 1)
                      void scale
                      onMove(
                        seal.id,
                        Math.min(0.95, Math.max(0.05, startXR + dx)),
                        Math.min(0.95, Math.max(0.05, startYR + dy)),
                      )
                    }
                    const onUp = () => {
                      window.removeEventListener('mousemove', onMoveWin)
                      window.removeEventListener('mouseup', onUp)
                    }
                    window.addEventListener('mousemove', onMoveWin)
                    window.addEventListener('mouseup', onUp)
                  }
                : undefined
            }
            onClick={
              interactive
                ? (e) => {
                    e.stopPropagation()
                    onSelect?.(seal.id)
                  }
                : undefined
            }
          >
            <img src={src} alt="电子章" draggable={false} />
            {selected ? (
              <div className="doc-seal__toolbar" onMouseDown={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => onScale?.(seal.id, Math.max(0.4, (seal.scale || 1) - 0.1))}
                >
                  －
                </button>
                <button
                  type="button"
                  onClick={() => onScale?.(seal.id, Math.min(2.5, (seal.scale || 1) + 0.1))}
                >
                  ＋
                </button>
                <button type="button" className="doc-seal__remove" onClick={() => onRemove?.(seal.id)}>
                  删除
                </button>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
