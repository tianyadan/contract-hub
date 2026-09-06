import { useMemo } from 'react'
import { diffTextChars, type TextDiffPart } from '../../utils/textDiff'
import type { ChangeHighlightState } from './changeHighlightTypes'

interface ChangeDiffOverlayProps {
  state: ChangeHighlightState
}

/** 渲染行内 Diff 片段 */
function renderParts(parts: TextDiffPart[]) {
  return parts.map((part, i) => {
    if (part.type === 'delete') {
      return (
        <del key={i} className="doc-change-del">
          {part.text}
        </del>
      )
    }
    if (part.type === 'insert') {
      return (
        <ins key={i} className="doc-change-add">
          {part.text}
        </ins>
      )
    }
    return <span key={i}>{part.text}</span>
  })
}

/**
 * 块级变更高亮覆盖层内容（由 DocumentEditor 定位到目标块上方）。
 * pointer-events: none，不挡编辑。
 */
export default function ChangeDiffOverlay({ state }: ChangeDiffOverlayProps) {
  const parts = useMemo(() => {
    if (state.kind === 'style' || state.kind === 'structure') return null
    if (state.changeType === 0) {
      return [{ type: 'insert' as const, text: state.newText || '（新增内容）' }]
    }
    if (state.changeType === 1) {
      return [{ type: 'delete' as const, text: state.oldText || '（已删除内容）' }]
    }
    // 修改：行内红绿
    if (state.kind === 'table') {
      return null
    }
    return diffTextChars(state.oldText || '', state.newText || '')
  }, [state])

  const tip =
    state.kind === 'style'
      ? '样式变更（详见右侧说明）'
      : state.kind === 'table'
        ? '表格变更'
        : state.kind === 'structure'
          ? '结构变更'
          : null

  return (
    <div
      className={[
        'doc-change-overlay',
        state.changeType === 0 ? 'doc-change-overlay--add' : '',
        state.changeType === 1 ? 'doc-change-overlay--del' : '',
        state.changeType === 2 ? 'doc-change-overlay--mod' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      contentEditable={false}
      suppressContentEditableWarning
      aria-hidden
      data-change-overlay="1"
    >
      {tip ? <div className="doc-change-overlay__tip">{tip}</div> : null}
      {parts && parts.length > 0 ? (
        <div className="doc-change-overlay__body">{renderParts(parts)}</div>
      ) : null}
    </div>
  )
}
