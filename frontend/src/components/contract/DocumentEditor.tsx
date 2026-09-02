import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from 'react'
import { flushSync } from 'react-dom'
import { Alert, Empty } from 'antd'
import type { CSSProperties, ReactNode } from 'react'
import type {
  BlockStyle,
  DocumentBlock,
  DocumentContent,
  DocumentRun,
} from '../../types/contract'
import { highlightNameToHex } from '../../utils/contract'
import {
  applyLivePageOverflowBreaks,
  computePaperLayout,
  dedupeBlocksById,
  findPageIndex,
  paginateByHeights,
} from '../../utils/paginateDocument'
import FormatToolbar from './FormatToolbar'
import PageNavigator from './PageNavigator'
import './doc-editor.css'

/** pt 转 px（1pt = 1/72 英寸，96dpi） */
const ptToPx = (pt: number) => (pt / 72) * 96
const twipsToPxLocal = (tw: number) => (tw / 1440) * 96

/** 标题级别默认字号（pt） */
const HEADING_FONT_SIZES: Record<number, number> = { 1: 18, 2: 16, 3: 14, 4: 12 }

const INLINE_STYLE_KEYS = new Set<keyof BlockStyle>([
  'font_size',
  'font_name',
  'east_asia_font',
  'bold',
  'italic',
  'underline',
  'strike',
  'color',
  'highlight',
  'shadow',
])

/** 工具栏布尔样式：支持一次点击开/关 */
const BOOLEAN_TOGGLE_KEYS: (keyof BlockStyle)[] = [
  'bold',
  'italic',
  'underline',
  'strike',
  'shadow',
]

interface TextSelectionState {
  blockId: string
  start: number
  end: number
  x: number
  y: number
}

/** 浮动工具栏桥：独立 setState，避免拖累 contentEditable 重渲染 */
export interface FloatingToolbarBridge {
  show: (selection: TextSelectionState, style?: BlockStyle) => void
  hide: () => void
  getSelection: () => TextSelectionState | null
}

interface FloatingToolbarHostProps {
  bridgeRef: React.MutableRefObject<FloatingToolbarBridge | null>
  onStyleChange: (patch: Partial<BlockStyle>) => void
}

/** 工具栏宿主：选区变化只更新本组件，不触发编辑器正文 reconcile */
function FloatingToolbarHost({ bridgeRef, onStyleChange }: FloatingToolbarHostProps) {
  const [visible, setVisible] = useState(false)
  const [selection, setSelection] = useState<TextSelectionState | null>(null)
  const [style, setStyle] = useState<BlockStyle | undefined>()
  const selectionRef = useRef<TextSelectionState | null>(null)

  // 每次渲染刷新 bridge，保证父组件调用的是最新 setter
  bridgeRef.current = {
    show: (next, nextStyle) => {
      selectionRef.current = next
      setSelection(next)
      setStyle(nextStyle)
      setVisible(true)
    },
    hide: () => {
      selectionRef.current = null
      setVisible(false)
      setSelection(null)
    },
    getSelection: () => selectionRef.current,
  }

  if (!visible || !selection) return null

  return (
    <div
      className="doc-editor__floating-toolbar"
      style={{ left: selection.x, top: Math.max(8, selection.y) }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <FormatToolbar style={style} disabled={false} onChange={onStyleChange} />
    </div>
  )
}

function isInlineStylePatch(patch: Partial<BlockStyle>): boolean {
  return Object.keys(patch).some((key) => INLINE_STYLE_KEYS.has(key as keyof BlockStyle))
}

function mergeAdjacentRuns(runs: DocumentRun[]): DocumentRun[] {
  const merged: DocumentRun[] = []
  for (const run of runs) {
    if (!run.text) continue
    const last = merged[merged.length - 1]
    if (last && JSON.stringify(last.style ?? {}) === JSON.stringify(run.style ?? {})) {
      last.text += run.text
    } else {
      merged.push({ text: run.text, style: { ...(run.style ?? {}) } })
    }
  }
  return merged
}

function normalizeRuns(block: DocumentBlock): DocumentRun[] {
  const text = block.text ?? ''
  const runs = block.runs ?? []
  const runText = runs.map((run) => run.text).join('')
  if (runs.length > 0 && runText === text) {
    return runs.map((run) => ({ text: run.text, style: { ...(run.style ?? {}) } }))
  }
  return text ? [{ text, style: { ...(block.style ?? {}) } }] : []
}

function applyStyleToRuns(
  block: DocumentBlock,
  start: number,
  end: number,
  patch: Partial<BlockStyle>,
): DocumentRun[] {
  const runs = normalizeRuns(block)
  if (runs.length === 0) return []

  let cursor = 0
  const next: DocumentRun[] = []
  const safeStart = Math.max(0, Math.min(start, block.text.length))
  const safeEnd = Math.max(safeStart, Math.min(end, block.text.length))

  for (const run of runs) {
    const runStart = cursor
    const runEnd = cursor + run.text.length
    cursor = runEnd

    if (runEnd <= safeStart || runStart >= safeEnd) {
      next.push(run)
      continue
    }

    const localStart = Math.max(0, safeStart - runStart)
    const localEnd = Math.min(run.text.length, safeEnd - runStart)
    const before = run.text.slice(0, localStart)
    const selected = run.text.slice(localStart, localEnd)
    const after = run.text.slice(localEnd)

    if (before) next.push({ text: before, style: { ...(run.style ?? {}) } })
    if (selected) next.push({ text: selected, style: { ...(run.style ?? {}), ...patch } })
    if (after) next.push({ text: after, style: { ...(run.style ?? {}) } })
  }

  return mergeAdjacentRuns(next)
}

/** 选区内有效样式是否全部为 true（用于工具栏高亮与一次点击取消） */
function computeBooleanToggleForSelection(
  block: DocumentBlock,
  start: number,
  end: number,
  key: keyof BlockStyle,
): boolean {
  const runs = normalizeRuns(block)
  const safeStart = Math.min(start, end)
  const safeEnd = Math.max(start, end)
  let cursor = 0
  const values: boolean[] = []

  for (const run of runs) {
    const runEnd = cursor + run.text.length
    const overlapStart = Math.max(safeStart, cursor)
    const overlapEnd = Math.min(safeEnd, runEnd)
    if (overlapEnd > overlapStart) {
      const effective = { ...(block.style ?? {}), ...(run.style ?? {}) }
      values.push(Boolean(effective[key]))
    }
    cursor = runEnd
  }

  if (values.length === 0) return true
  return !values.every((v) => v)
}

/** 将工具栏布尔 patch 解析为应对选区生效的目标值 */
function resolveInlineStylePatch(
  block: DocumentBlock,
  start: number,
  end: number,
  patch: Partial<BlockStyle>,
): Partial<BlockStyle> {
  const result = { ...patch }
  for (const key of BOOLEAN_TOGGLE_KEYS) {
    if (key in patch) {
      result[key] = computeBooleanToggleForSelection(block, start, end, key) as never
    }
  }
  return result
}

/** 根据选区推断工具栏应展示的样式（选区内全部加粗才高亮加粗） */
function resolveStyleForSelection(
  block: DocumentBlock,
  start: number,
  end: number,
): BlockStyle | undefined {
  const safeStart = Math.min(start, end)
  const safeEnd = Math.max(start, end)
  if (safeStart === safeEnd) return resolveStyleAtOffset(block, safeStart)

  const runs = normalizeRuns(block)
  let cursor = 0
  const effectiveStyles: BlockStyle[] = []
  for (const run of runs) {
    const runEnd = cursor + run.text.length
    const overlapStart = Math.max(safeStart, cursor)
    const overlapEnd = Math.min(safeEnd, runEnd)
    if (overlapEnd > overlapStart) {
      effectiveStyles.push({ ...(block.style ?? {}), ...(run.style ?? {}) })
    }
    cursor = runEnd
  }

  const result: BlockStyle = { ...(resolveStyleAtOffset(block, safeStart) ?? {}) }
  for (const key of BOOLEAN_TOGGLE_KEYS) {
    const vals = effectiveStyles.map((s) => Boolean(s[key]))
    ;(result as Record<string, unknown>)[key] = vals.length > 0 && vals.every(Boolean)
  }
  return result
}

/** 在文本宿主内按字符偏移定位 DOM 选区端点 */
function findDomTextOffsets(
  root: HTMLElement,
  start: number,
  end: number,
): { startNode: Node; startOffset: number; endNode: Node; endOffset: number } | null {
  let cursor = 0
  let startNode: Node | null = null
  let startOffset = 0
  let endNode: Node | null = null
  let endOffset = 0

  const walk = (node: Node): void => {
    if (startNode && endNode) return
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0
      if (!startNode && start < cursor + len) {
        startNode = node
        startOffset = start - cursor
      }
      if (!endNode && end <= cursor + len) {
        endNode = node
        endOffset = end - cursor
      }
      cursor += len
      return
    }
    node.childNodes.forEach(walk)
  }

  walk(root)
  if (!startNode || !endNode) return null
  return { startNode, startOffset, endNode, endOffset }
}

/** 样式写入后恢复文字选区，避免工具栏操作后选区丢失 */
function restoreTextSelectionInBlock(
  unifiedEl: HTMLElement,
  blockId: string,
  start: number,
  end: number,
): boolean {
  const escaped =
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(blockId) : blockId.replace(/"/g, '\\"')
  const blockEl = unifiedEl.querySelector<HTMLElement>(`[data-block-id="${escaped}"]`)
  if (!blockEl) return false

  const host = blockEl.querySelector<HTMLElement>('[data-formula-text]') ?? blockEl
  const offsets = findDomTextOffsets(host, start, end)
  if (!offsets) return false

  unifiedEl.focus()
  const range = document.createRange()
  range.setStart(offsets.startNode, offsets.startOffset)
  range.setEnd(offsets.endNode, offsets.endOffset)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  return true
}

/** 将 React 样式对象写入 DOM 元素 */
function applyCssProperties(el: HTMLElement, css: CSSProperties): void {
  for (const key of Object.keys(css) as (keyof CSSProperties)[]) {
    const value = css[key]
    if (value === undefined || value === null || value === '') continue
    el.style.setProperty(
      key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
      String(value),
    )
  }
}

/** 按 runs 重建块内文字 DOM（保留公式 data-formula-text 宿主） */
function writeRunsToBlockDom(
  blockEl: HTMLElement,
  block: DocumentBlock,
  toRunCss: (style?: BlockStyle) => CSSProperties,
): void {
  const host =
    block.type === 'formula'
      ? (blockEl.querySelector<HTMLElement>('[data-formula-text]') ?? blockEl)
      : blockEl
  const runs = normalizeRuns(block)
  const mergedText = runs.map((r) => r.text).join('')

  if (!mergedText) {
    host.innerHTML = '<br>'
    return
  }

  const hasInlineRuns =
    runs.length > 1 || runs.some((r) => r.style && Object.keys(r.style).length > 0)

  if (!hasInlineRuns) {
    host.textContent = mergedText
    return
  }

  host.textContent = ''
  runs.forEach((run, i) => {
    if (!run.text) return
    const span = document.createElement('span')
    const effectiveStyle = { ...(block.style ?? {}), ...(run.style ?? {}) }
    applyCssProperties(span, toRunCss(effectiveStyle))
    span.textContent = run.text
    span.dataset.runIndex = String(i)
    host.appendChild(span)
  })
}

/** 从当前选区解析块内文字偏移 */
function resolveTextSelectionInEditor(
  editorRoot: HTMLElement,
): { blockId: string; start: number; end: number } | null {
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  if (!selection || !range) return null

  const anchor =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement
  const blockEl = anchor?.closest<HTMLElement>('[data-block-id]')
  const editableEl =
    anchor?.closest<HTMLElement>('[data-editable-block-id]') ??
    (blockEl?.dataset.blockKind === 'text' ? blockEl : null)
  if (!blockEl || !editableEl || !editorRoot.contains(blockEl)) return null

  const blockId = blockEl.dataset.blockId
  if (!blockId) return null

  const start = getTextOffset(editableEl, range.startContainer, range.startOffset)
  const end = getTextOffset(editableEl, range.endContainer, range.endOffset)
  return { blockId, start: Math.min(start, end), end: Math.max(start, end) }
}

function getTextOffset(root: Node, target: Node, targetOffset: number): number {
  let offset = 0
  let found = false

  const walk = (node: Node) => {
    if (found) return
    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += targetOffset
      } else {
        for (let i = 0; i < targetOffset; i += 1) {
          offset += node.childNodes[i]?.textContent?.length ?? 0
        }
      }
      found = true
      return
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0
      return
    }
    node.childNodes.forEach(walk)
  }

  walk(root)
  return offset
}

/** 根据光标偏移合并块级与 run 级样式（供固定工具栏展示） */
function resolveStyleAtOffset(block: DocumentBlock, offset: number): BlockStyle | undefined {
  const runs = normalizeRuns(block)
  let cursor = 0
  for (const run of runs) {
    const next = cursor + run.text.length
    if (offset >= cursor && offset <= next) {
      return { ...(block.style ?? {}), ...(run.style ?? {}) }
    }
    cursor = next
  }
  return block.style
}

function redistributeRuns(runs: DocumentRun[], newText: string): DocumentRun[] {
  const totalLen = runs.reduce((sum, r) => sum + r.text.length, 0)
  if (totalLen === 0) {
    return [{ text: newText, style: runs[0]?.style ?? {} }]
  }
  const len = newText.length
  let allocated = 0
  return runs.map((run, i) => {
    if (i === runs.length - 1) {
      return { ...run, text: newText.slice(allocated) }
    }
    const n = Math.round((run.text.length / totalLen) * len)
    const text = newText.slice(allocated, allocated + n)
    allocated += n
    return { ...run, text }
  })
}

function newBlockId(): string {
  return `b-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

function readTextBlockContent(el: HTMLElement): string {
  const textHost = el.querySelector<HTMLElement>('[data-formula-text]')
  if (textHost) return textHost.textContent ?? ''
  return el.textContent ?? ''
}

function readTableRows(tableEl: HTMLTableElement): string[][] {
  return Array.from(tableEl.querySelectorAll('tr')).map((row) =>
    Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent ?? ''),
  )
}

/** 为浏览器回车生成的裸 div 补齐块属性，避免同步丢段 */
function normalizeEditableDom(root: HTMLElement): void {
  Array.from(root.children).forEach((child) => {
    const el = child as HTMLElement
    if (el.dataset.blockKind === 'table') return
    if (!el.dataset.blockId) {
      el.dataset.blockId = newBlockId()
    }
    if (!el.dataset.blockKind) el.dataset.blockKind = 'text'
    if (!el.dataset.blockType) el.dataset.blockType = 'paragraph'
    if (!el.dataset.editableBlockId) el.dataset.editableBlockId = el.dataset.blockId
    if (!el.className) el.className = 'doc-editor__paragraph'
  })
}

/** 从选区定位所在块元素 */
function findBlockElementFromSelection(root: HTMLElement): HTMLElement | null {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  const node = selection.getRangeAt(0).commonAncestorContainer
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  const block = el?.closest<HTMLElement>('[data-block-id]')
  if (!block || !root.contains(block)) return null
  return block
}

/** 获取有序全文块列表（编辑中以 frozen 为准） */
function getOrderedBlocks(source: DocumentBlock[]): DocumentBlock[] {
  return dedupeBlocksById([...source].sort((a, b) => a.order - b.order))
}

/** 深拷贝块列表（用于撤销栈） */
function cloneBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
  return JSON.parse(JSON.stringify(blocks)) as DocumentBlock[]
}

const MAX_UNDO_STACK = 50

/** 文档编辑器对外暴露能力 */
export interface DocumentEditorHandle {
  getExportRoot: () => HTMLElement | null
  preparePagesForExport: () => Promise<HTMLElement[]>
  getPageCount: () => number
}

interface DocumentEditorProps {
  documentContent: DocumentContent | null
  onChange?: (content: DocumentContent) => void
  readOnly?: boolean
  emptyText?: string
}

interface EditableBodyProps {
  /** 仅 sessionKey 变化时允许 React 重挂载正文，避免编辑中 removeChild 白屏 */
  sessionKey: string
  pageBlocks: DocumentBlock[]
  defaultStyle: BlockStyle
  scale: number
  bodyRef: React.MutableRefObject<HTMLDivElement | null>
  onFocus: () => void
  onBlur: () => void
  onSelectionRefresh: () => void
  /** 输入后触发实时分页（回车/删除等） */
  onInputCommit: () => void
  onEditorKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  renderBlockNode: (block: DocumentBlock, mode: 'edit', index: number) => ReactNode
}

/**
 * 可编辑正文：sessionKey 不变则跳过 reconcile。
 * 输入过程中父组件因工具栏/分页 setState 时，不会用旧 VDOM 覆盖 contentEditable DOM。
 */
const EditableUnifiedBody = memo(
  function EditableUnifiedBody({
    sessionKey,
    pageBlocks,
    defaultStyle,
    scale,
    bodyRef,
    onFocus,
    onBlur,
    onSelectionRefresh,
    onInputCommit,
    onEditorKeyDown,
    renderBlockNode,
  }: EditableBodyProps) {
    return (
      <div
        key={sessionKey}
        ref={bodyRef}
        className="doc-editor__unified"
        contentEditable
        suppressContentEditableWarning
        onFocus={onFocus}
        onBlur={onBlur}
        onInput={onInputCommit}
        onMouseUp={onSelectionRefresh}
        onKeyUp={onSelectionRefresh}
        onKeyDown={onEditorKeyDown}
      >
        {pageBlocks.length > 0 ? (
          pageBlocks.map((b, i) => renderBlockNode(b, 'edit', i))
        ) : (
          <div
            data-block-id={newBlockId()}
            data-block-kind="text"
            data-block-type="paragraph"
            data-editable-block-id="new"
            className="doc-editor__paragraph"
            style={{
              fontSize: ptToPx(defaultStyle.font_size ?? 10.5) * scale,
            }}
          >
            <br />
          </div>
        )}
      </div>
    )
  },
  (prev, next) => prev.sessionKey === next.sessionKey,
)

/**
 * 文档在线编辑器（V3.1：按页挂载 + 翻页）。
 * 关键点：编辑中禁止 React 重绘 contentEditable 子树，杜绝 removeChild 白屏。
 */
export default forwardRef<DocumentEditorHandle, DocumentEditorProps>(function DocumentEditor(
  { documentContent, onChange, readOnly = false, emptyText = '该合同暂无文档内容' },
  ref,
) {
  const blocks = useMemo(() => {
    const list = documentContent?.blocks ?? []
    return dedupeBlocksById([...list].sort((a, b) => a.order - b.order))
  }, [documentContent])

  const blockMap = useMemo(() => {
    const map: Record<string, DocumentBlock> = {}
    blocks.forEach((b) => {
      map[b.id] = b
    })
    return map
  }, [blocks])

  const hasLegacyBlocks = useMemo(
    () => blocks.length > 0 && blocks.some((b) => b.source_ref === undefined),
    [blocks],
  )

  const defaultStyle: BlockStyle = documentContent?.default_style ?? {}
  const layout = useMemo(() => computePaperLayout(documentContent?.page), [documentContent?.page])
  const scale = layout.scale

  const editorRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const exportHostRef = useRef<HTMLDivElement | null>(null)
  const unifiedBodyRef = useRef<HTMLDivElement | null>(null)
  const isFocusedRef = useRef(false)
  const frozenBlocksRef = useRef<DocumentBlock[]>(blocks)
  const originalRunsRef = useRef<Record<string, DocumentRun[]>>({})
  const pageIdsRef = useRef<string[][]>([[]])
  const currentPageRef = useRef(0)
  const toolbarBridgeRef = useRef<FloatingToolbarBridge | null>(null)
  const activeBlockIdRef = useRef<string | null>(null)
  const repaginateTimerRef = useRef<number | null>(null)
  const emitChangeTimerRef = useRef<number | null>(null)
  const pendingFocusBlockIdRef = useRef<string | null>(null)
  const displayedPageBlockIdsRef = useRef<string[]>([])
  /** 编辑时由可视区溢出自动打的换页标记（与导入分页符区分） */
  const autoBreakBlockIdsRef = useRef<Set<string>>(new Set())
  const undoStackRef = useRef<DocumentBlock[][]>([])
  const redoStackRef = useRef<DocumentBlock[][]>([])
  const inputUndoBurstRef = useRef(false)
  const inputUndoTimerRef = useRef<number | null>(null)

  const [fixedToolbarStyle, setFixedToolbarStyle] = useState<BlockStyle | undefined>()
  const [fixedToolbarBlockId, setFixedToolbarBlockId] = useState<string | null>(null)

  const [currentPage, setCurrentPage] = useState(0)
  const [pageIds, setPageIds] = useState<string[][]>([[]])
  const [paginating, setPaginating] = useState(false)
  /** 编辑中用于测量容器刷新的块快照（不触发正文 reconcile） */
  const [liveMeasureBlocks, setLiveMeasureBlocks] = useState<DocumentBlock[] | null>(null)
  /** frozen 块更新后递增，驱动当前页块列表刷新 */
  const [blocksVersion, setBlocksVersion] = useState(0)
  /** 仅翻页 / 失焦同步后递增，驱动 EditableUnifiedBody 安全重挂载 */
  const [editSession, setEditSession] = useState(0)

  const contentRef = useRef(documentContent)
  contentRef.current = documentContent
  currentPageRef.current = currentPage
  pageIdsRef.current = pageIds

  if (!isFocusedRef.current) {
    frozenBlocksRef.current = blocks
  }

  const renderBlocks = frozenBlocksRef.current
  const activeSourceBlocks = useMemo(
    () => getOrderedBlocks(isFocusedRef.current ? frozenBlocksRef.current : blocks),
    // blocksVersion 用于编辑中 frozen 更新后刷新当前页展示
    [blocks, blocksVersion, liveMeasureBlocks],
  )
  const activeBlockMap = useMemo(() => {
    const map: Record<string, DocumentBlock> = {}
    activeSourceBlocks.forEach((b) => {
      map[b.id] = b
    })
    return map
  }, [activeSourceBlocks])

  const currentPageBlockIds = pageIds[currentPage] ?? []
  const currentPageBlocks = currentPageBlockIds
    .map((id) => activeBlockMap[id])
    .filter(Boolean)

  const editSessionKey = `p${currentPage}-s${editSession}`

  /** 两页块 id 列表是否一致 */
  const sameBlockIdList = (a: string[], b: string[]) =>
    a.length === b.length && a.every((id, i) => id === b[i])

  /** 测量全部块高度并分页；返回新页表 */
  const remasureAndPaginate = useCallback((): string[][] => {
    const measureRoot = measureRef.current
    const list = dedupeBlocksById(
      [...(isFocusedRef.current ? frozenBlocksRef.current : (contentRef.current?.blocks ?? []))].sort(
        (a, b) => a.order - b.order,
      ),
    )
    if (!measureRoot) {
      const next = list.length ? [list.map((b) => b.id)] : [[]]
      pageIdsRef.current = next
      setPageIds(next)
      return next
    }

    const heights: Record<string, number> = {}
    const forceBreak: Record<string, boolean> = {}
    list.forEach((block) => {
      const el = measureRoot.querySelector<HTMLElement>(
        `[data-measure-id="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(block.id) : block.id.replace(/"/g, '\\"')}"]`,
      )
      heights[block.id] = el?.offsetHeight ?? 24
      forceBreak[block.id] = Boolean(block.page_break_before)
    })

    const nextPages = paginateByHeights(
      list.map((b) => b.id),
      heights,
      layout.bodyHeightPx,
      forceBreak,
    )
    pageIdsRef.current = nextPages
    setPageIds(nextPages)

    setCurrentPage((prev) => {
      // 编辑中由 applyRepaginationAfterEdit 统一处理翻页
      if (isFocusedRef.current) return prev
      const focusId = activeBlockIdRef.current
      if (focusId) {
        const idx = findPageIndex(nextPages, focusId)
        if (idx >= 0) return idx
      }
      return Math.min(prev, Math.max(0, nextPages.length - 1))
    })

    // 非编辑态允许重挂载正文，确保分页结果进入可编辑区
    if (!isFocusedRef.current) {
      setEditSession((s) => s + 1)
    }
    return nextPages
  }, [layout.bodyHeightPx])

  useLayoutEffect(() => {
    if (isFocusedRef.current) return
    setPaginating(true)
    remasureAndPaginate()
    setPaginating(false)
  }, [blocks, layout, remasureAndPaginate])

  useLayoutEffect(() => {
    if (!isFocusedRef.current) {
      frozenBlocksRef.current = blocks
    }
  }, [blocks])

  useImperativeHandle(ref, () => ({
    getExportRoot: () => editorRef.current,
    getPageCount: () => Math.max(1, pageIdsRef.current.length),
    preparePagesForExport: async () => {
      if (unifiedBodyRef.current && isFocusedRef.current) {
        unifiedBodyRef.current.blur()
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 50))
      flushSync(() => {
        remasureAndPaginate()
      })
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      const host = exportHostRef.current
      if (!host) return []
      return Array.from(host.querySelectorAll<HTMLElement>('.doc-page'))
    },
  }))

  /** 选区刷新：只更新工具栏岛，不 setState 到编辑器本体 */
  const refreshSelectionToolbar = useCallback(() => {
    if (readOnly) return
    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    if (!selection || !range || !editorRef.current) {
      toolbarBridgeRef.current?.hide()
      return
    }

    const anchor =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement
    const blockEl = anchor?.closest<HTMLElement>('[data-block-id]')
    const editableEl =
      anchor?.closest<HTMLElement>('[data-editable-block-id]') ??
      (blockEl?.dataset.blockKind === 'text' ? blockEl : null)
    if (!blockEl || !editableEl || !editorRef.current.contains(blockEl)) {
      toolbarBridgeRef.current?.hide()
      return
    }

    const blockId = blockEl.dataset.blockId
    if (!blockId) return

    const start = getTextOffset(editableEl, range.startContainer, range.startOffset)
    const end = getTextOffset(editableEl, range.endContainer, range.endOffset)
    const rect = range.getBoundingClientRect()
    const fallbackRect = editableEl.getBoundingClientRect()
    const safeStart = Math.min(start, end)
    const safeEnd = Math.max(start, end)
    activeBlockIdRef.current = blockId
    setFixedToolbarBlockId(blockId)

    const block =
      blockMap[blockId] ??
      frozenBlocksRef.current.find((b) => b.id === blockId) ??
      contentRef.current?.blocks?.find((b) => b.id === blockId)
    const style = block ? resolveStyleForSelection(block, safeStart, safeEnd) : undefined
    setFixedToolbarStyle(style)

    // 浮动工具栏：仅在有文字选区时出现
    if (safeStart === safeEnd) {
      toolbarBridgeRef.current?.hide()
      return
    }

    toolbarBridgeRef.current?.show(
      {
        blockId,
        start: safeStart,
        end: safeEnd,
        x:
          rect.width > 0
            ? rect.left + rect.width / 2
            : Number.isFinite(rect.left) && rect.left > 0
              ? rect.left
              : fallbackRect.left + 120,
        y: (rect.height ? rect.top : fallbackRect.top) - 12,
      },
      style,
    )
  }, [readOnly, blockMap])

  const emitChange = (nextBlocks: DocumentBlock[]) => {
    const current = contentRef.current
    if (!current || readOnly) return
    const normalized = dedupeBlocksById(nextBlocks.map((b, i) => ({ ...b, order: i })))
    const next: DocumentContent = {
      ...current,
      schema_version: 3,
      render_mode: 'web_canvas',
      blocks: normalized,
    }
    contentRef.current = next
    if (isFocusedRef.current) {
      frozenBlocksRef.current = normalized
    }
    onChange?.(next)
  }

  /** 压入撤销快照（与当前状态相同则跳过） */
  const pushUndoSnapshot = useCallback(() => {
    if (readOnly) return
    const snap = cloneBlocks(getOrderedBlocks(frozenBlocksRef.current))
    const stack = undoStackRef.current
    const last = stack[stack.length - 1]
    if (last && JSON.stringify(last) === JSON.stringify(snap)) return
    stack.push(snap)
    if (stack.length > MAX_UNDO_STACK) stack.shift()
    redoStackRef.current = []
  }, [readOnly])

  /** 提交块更新并刷新编辑态 */
  const commitBlocksUpdate = useCallback(
    (nextBlocks: DocumentBlock[]) => {
      const normalized = dedupeBlocksById(nextBlocks.map((b, i) => ({ ...b, order: i })))
      frozenBlocksRef.current = normalized
      const nextContent = {
        ...(contentRef.current ?? { blocks: [] }),
        schema_version: 3,
        render_mode: 'web_canvas',
        blocks: normalized,
      } as DocumentContent
      contentRef.current = nextContent
      setBlocksVersion((v) => v + 1)
      onChange?.(nextContent)
      return normalized
    },
    [onChange],
  )

  const performUndo = useCallback(() => {
    if (readOnly || undoStackRef.current.length === 0) return false
    redoStackRef.current.push(cloneBlocks(getOrderedBlocks(frozenBlocksRef.current)))
    const prev = undoStackRef.current.pop()!
    frozenBlocksRef.current = prev
    contentRef.current = {
      ...(contentRef.current ?? { blocks: [] }),
      schema_version: 3,
      render_mode: 'web_canvas',
      blocks: prev,
    } as DocumentContent
    setBlocksVersion((v) => v + 1)
    setEditSession((s) => s + 1)
    onChange?.({ ...(contentRef.current as DocumentContent), blocks: prev })
    toolbarBridgeRef.current?.hide()
    requestAnimationFrame(() => {
      remasureAndPaginate()
      displayedPageBlockIdsRef.current = pageIdsRef.current[currentPageRef.current] ?? []
    })
    return true
  }, [readOnly, onChange, remasureAndPaginate])

  const performRedo = useCallback(() => {
    if (readOnly || redoStackRef.current.length === 0) return false
    undoStackRef.current.push(cloneBlocks(getOrderedBlocks(frozenBlocksRef.current)))
    const next = redoStackRef.current.pop()!
    frozenBlocksRef.current = next
    contentRef.current = {
      ...(contentRef.current ?? { blocks: [] }),
      schema_version: 3,
      render_mode: 'web_canvas',
      blocks: next,
    } as DocumentContent
    setBlocksVersion((v) => v + 1)
    setEditSession((s) => s + 1)
    onChange?.({ ...(contentRef.current as DocumentContent), blocks: next })
    toolbarBridgeRef.current?.hide()
    requestAnimationFrame(() => {
      remasureAndPaginate()
      displayedPageBlockIdsRef.current = pageIdsRef.current[currentPageRef.current] ?? []
    })
    return true
  }, [readOnly, onChange, remasureAndPaginate])

  const markInputUndoBurst = useCallback(() => {
    if (!inputUndoBurstRef.current) {
      pushUndoSnapshot()
      inputUndoBurstRef.current = true
    }
    if (inputUndoTimerRef.current) window.clearTimeout(inputUndoTimerRef.current)
    inputUndoTimerRef.current = window.setTimeout(() => {
      inputUndoBurstRef.current = false
      inputUndoTimerRef.current = null
    }, 1000)
  }, [pushUndoSnapshot])

  const syncBlocksFromDom = useCallback((): DocumentBlock[] | null => {
    const unifiedEl = unifiedBodyRef.current
    if (!unifiedEl || readOnly) return null

    normalizeEditableDom(unifiedEl)

    const fullList = getOrderedBlocks(frozenBlocksRef.current)
    const existingMap = new Map(fullList.map((b) => [b.id, b]))
    const pages = pageIdsRef.current
    const pageIndex = currentPageRef.current
    const pageBlockIds = pages[pageIndex] ?? []

    // 在全文顺序中定位当前页块区间，用 DOM 解析结果替换该区间（保证回车后后续内容整体后移）
    let startIdx = 0
    let endIdx = -1
    if (pageBlockIds.length > 0) {
      startIdx = fullList.findIndex((b) => b.id === pageBlockIds[0])
      endIdx = fullList.findIndex((b) => b.id === pageBlockIds[pageBlockIds.length - 1])
    }
    if (startIdx < 0) {
      startIdx = pages.slice(0, pageIndex).flat().length
      endIdx = startIdx - 1
    }

    const syncedPage: DocumentBlock[] = []
    let lastTextBlock: DocumentBlock | undefined
    const usedIds = new Set<string>()

    const children = Array.from(unifiedEl.children) as HTMLElement[]
    for (const child of children) {
      const kind = child.dataset.blockKind

      if (kind === 'table') {
        const blockId = child.dataset.blockId
        const existing = blockId ? existingMap.get(blockId) : undefined
        const tableEl = child.querySelector('table')
        const rows = tableEl ? readTableRows(tableEl) : existing?.rows ?? []
        if (!existing || usedIds.has(existing.id)) continue
        usedIds.add(existing.id)
        syncedPage.push({ ...existing, rows })
        continue
      }

      const blockId = child.dataset.blockId
      const blockType = (child.dataset.blockType as DocumentBlock['type']) || 'paragraph'
      const newText = readTextBlockContent(child)
      let id = blockId && existingMap.has(blockId) && !usedIds.has(blockId) ? blockId : newBlockId()
      if (usedIds.has(id)) id = newBlockId()
      usedIds.add(id)

      const existing = existingMap.get(id)
      const template: DocumentBlock =
        existing ??
        lastTextBlock ?? {
          id,
          type: 'paragraph',
          text: '',
          order: 0,
          level: 0,
          formulas: [],
          source_ref: null,
          style: {
            font_size: defaultStyle.font_size,
            font_name: defaultStyle.font_name,
            east_asia_font: defaultStyle.east_asia_font,
          },
        }

      const originalRuns = originalRunsRef.current[id] ?? (existing ? normalizeRuns(existing) : [])
      const textChanged = newText !== (existing?.text ?? '')
      let runs = existing?.runs
      if (textChanged) {
        runs =
          originalRuns.length > 0
            ? redistributeRuns(originalRuns, newText)
            : newText
              ? [{ text: newText, style: { ...(template.style ?? {}) } }]
              : undefined
      }

      const synced: DocumentBlock = {
        ...template,
        id,
        type: blockType,
        text: newText,
        runs,
        source_ref: existing?.source_ref ?? null,
        page_break_before: existing?.page_break_before ?? false,
        export_page_break_before: false,
        order: 0,
        level: existing?.level ?? template.level ?? 0,
        formulas: existing?.formulas ?? template.formulas ?? [],
      }
      syncedPage.push(synced)
      lastTextBlock = synced
    }

    const next = dedupeBlocksById([
      ...fullList.slice(0, startIdx),
      ...syncedPage,
      ...fullList.slice(endIdx + 1),
    ]).map((b, i) => ({ ...b, order: i }))

    return next
  }, [defaultStyle, readOnly])

  /** 编辑后根据新页表决定是否重挂载当前页 / 跳转光标所在页 */
  const applyRepaginationAfterEdit = useCallback(() => {
    const focusId = activeBlockIdRef.current
    const pages = pageIdsRef.current
    const pageIndex = currentPageRef.current
    const currentIds = pages[pageIndex] ?? []

    let targetPage = pageIndex
    if (focusId) {
      const idx = findPageIndex(pages, focusId)
      if (idx >= 0) targetPage = idx
    }

    const idsChanged = !sameBlockIdList(currentIds, displayedPageBlockIdsRef.current)
    const pageChanged = targetPage !== pageIndex

    if (idsChanged || pageChanged) {
      displayedPageBlockIdsRef.current = pages[targetPage] ?? []
      pendingFocusBlockIdRef.current = focusId
      if (pageChanged) {
        setCurrentPage(targetPage)
      }
      setBlocksVersion((v) => v + 1)
      setEditSession((s) => s + 1)
    }
  }, [])

  /** 延迟通知父组件内容变更 */
  const scheduleEmitChange = useCallback(
    (nextBlocks: DocumentBlock[]) => {
      if (emitChangeTimerRef.current) window.clearTimeout(emitChangeTimerRef.current)
      emitChangeTimerRef.current = window.setTimeout(() => {
        emitChangeTimerRef.current = null
        const current = contentRef.current
        if (!current) return
        onChange?.({
          ...current,
          schema_version: 3,
          render_mode: 'web_canvas',
          blocks: nextBlocks,
        })
      }, 200)
    },
    [onChange],
  )

  /** 同步 DOM 后按当前页可视高度打上溢出换页，再交给测量容器分页 */
  const applyOverflowBreaksFromLiveDom = useCallback(
    (blocks: DocumentBlock[]): DocumentBlock[] => {
      const unifiedEl = unifiedBodyRef.current
      if (!unifiedEl) return blocks
      const liveChildren = Array.from(unifiedEl.children) as HTMLElement[]
      const result = applyLivePageOverflowBreaks(
        blocks,
        liveChildren,
        layout.bodyHeightPx,
        autoBreakBlockIdsRef.current,
      )
      autoBreakBlockIdsRef.current = result.autoBreakIds
      return result.blocks
    },
    [layout.bodyHeightPx],
  )

  /** 从 DOM 同步并实时重分页（回车/删除后溢出块进下一页） */
  const syncAndRepaginate = useCallback(() => {
    if (!isFocusedRef.current || readOnly) return

    refreshSelectionToolbar()
    const synced = syncBlocksFromDom()
    if (!synced) return

    const nextBlocks = applyOverflowBreaksFromLiveDom(synced)

    frozenBlocksRef.current = nextBlocks
    contentRef.current = {
      ...(contentRef.current ?? { blocks: [] }),
      schema_version: 3,
      render_mode: 'web_canvas',
      blocks: nextBlocks,
    } as DocumentContent
    setBlocksVersion((v) => v + 1)
    scheduleEmitChange(nextBlocks)
    setLiveMeasureBlocks(nextBlocks)
  }, [readOnly, refreshSelectionToolbar, syncBlocksFromDom, scheduleEmitChange, applyOverflowBreaksFromLiveDom])

  /**
   * 在数据模型中于光标处拆段（回车），后续全文块整体后移，再触发重分页。
   */
  const splitBlockAtCursor = useCallback((): boolean => {
    const unifiedEl = unifiedBodyRef.current
    if (!unifiedEl || readOnly) return false

    pushUndoSnapshot()

    const blockEl = findBlockElementFromSelection(unifiedEl)
    if (!blockEl || blockEl.dataset.blockKind === 'table') return false

    const blockId = blockEl.dataset.blockId
    if (!blockId) return false

    const selection = window.getSelection()
    if (!selection?.rangeCount) return false
    const range = selection.getRangeAt(0)

    const offset = getTextOffset(blockEl, range.startContainer, range.startOffset)
    const fullText = readTextBlockContent(blockEl)
    const before = fullText.slice(0, offset)
    const after = fullText.slice(offset)

    const fullList = getOrderedBlocks(frozenBlocksRef.current)
    const idx = fullList.findIndex((b) => b.id === blockId)
    if (idx < 0) return false

    const existing = fullList[idx]
    const newId = newBlockId()
    const baseRuns = normalizeRuns(existing)

    const updatedExisting: DocumentBlock = {
      ...existing,
      text: before,
      runs: before ? redistributeRuns(baseRuns, before) : undefined,
    }
    const newBlock: DocumentBlock = {
      ...existing,
      id: newId,
      text: after,
      runs: after
        ? redistributeRuns(baseRuns, after)
        : [{ text: '', style: { ...(existing.style ?? {}) } }],
      source_ref: null,
      page_break_before: false,
    }

    const next = getOrderedBlocks([
      ...fullList.slice(0, idx),
      updatedExisting,
      newBlock,
      ...fullList.slice(idx + 1),
    ]).map((b, i) => ({ ...b, order: i }))

    frozenBlocksRef.current = next
    contentRef.current = {
      ...(contentRef.current ?? { blocks: [] }),
      schema_version: 3,
      render_mode: 'web_canvas',
      blocks: next,
    } as DocumentContent
    activeBlockIdRef.current = newId
    originalRunsRef.current[newId] = normalizeRuns(newBlock)
    setBlocksVersion((v) => v + 1)

    // 同步更新 DOM：当前块保留前半段，后半段插入新块
    if (existing.type === 'formula') {
      const host = blockEl.querySelector<HTMLElement>('[data-formula-text]')
      if (host) host.textContent = before
    } else {
      blockEl.textContent = before
    }

    const newEl = document.createElement('div')
    newEl.dataset.blockId = newId
    newEl.dataset.blockKind = 'text'
    newEl.dataset.blockType = existing.type
    newEl.dataset.editableBlockId = newId
    newEl.className = blockEl.className
    newEl.style.cssText = blockEl.style.cssText
    if (after) {
      newEl.textContent = after
    } else {
      newEl.innerHTML = '<br>'
    }
    blockEl.insertAdjacentElement('afterend', newEl)

    const newRange = document.createRange()
    newRange.selectNodeContents(newEl)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)

    // 按当前页可视高度立即判断溢出，避免需多次回车才换页
    const withBreaks = applyOverflowBreaksFromLiveDom(next)
    frozenBlocksRef.current = withBreaks
    contentRef.current = {
      ...(contentRef.current ?? { blocks: [] }),
      schema_version: 3,
      render_mode: 'web_canvas',
      blocks: withBreaks,
    } as DocumentContent

    scheduleEmitChange(withBreaks)
    setLiveMeasureBlocks(withBreaks)
    return true
  }, [readOnly, scheduleEmitChange, applyOverflowBreaksFromLiveDom, pushUndoSnapshot])

  /** 测量 DOM 更新后执行分页 */
  useLayoutEffect(() => {
    if (!liveMeasureBlocks) return
    remasureAndPaginate()
    applyRepaginationAfterEdit()
    setLiveMeasureBlocks(null)
  }, [liveMeasureBlocks, remasureAndPaginate, applyRepaginationAfterEdit])

  /** 重挂载后恢复光标到原块 */
  useLayoutEffect(() => {
    const blockId = pendingFocusBlockIdRef.current
    if (!blockId || !unifiedBodyRef.current) return
    pendingFocusBlockIdRef.current = null

    const escaped =
      typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(blockId) : blockId.replace(/"/g, '\\"')
    const blockEl = unifiedBodyRef.current.querySelector<HTMLElement>(`[data-block-id="${escaped}"]`)
    if (!blockEl) return

    unifiedBodyRef.current.focus()
    const range = document.createRange()
    const sel = window.getSelection()
    const textNode = blockEl.querySelector('[data-formula-text]') ?? blockEl
    range.selectNodeContents(textNode)
    range.collapse(false)
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [editSessionKey])

  /** 防抖 / 立即触发实时分页 */
  const scheduleRepaginate = useCallback(
    (immediate = false) => {
      if (repaginateTimerRef.current) window.clearTimeout(repaginateTimerRef.current)
      const run = () => {
        repaginateTimerRef.current = null
        syncAndRepaginate()
      }
      if (immediate) {
        window.requestAnimationFrame(() => window.requestAnimationFrame(run))
      } else {
        repaginateTimerRef.current = window.setTimeout(run, 120)
      }
    },
    [syncAndRepaginate],
  )

  const handleEditorInput = useCallback(() => {
    markInputUndoBurst()
    scheduleRepaginate(false)
  }, [scheduleRepaginate, markInputUndoBurst])

  const handleEditorKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          performRedo()
        } else {
          performUndo()
        }
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        performRedo()
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        if (splitBlockAtCursor()) return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        pushUndoSnapshot()
        scheduleRepaginate(true)
      }
    },
    [scheduleRepaginate, splitBlockAtCursor, performUndo, performRedo, pushUndoSnapshot],
  )

  const handleTableCellInteractionEnd = () => {
    const nextBlocks = syncBlocksFromDom()
    if (!nextBlocks) return
    emitChange(nextBlocks)
  }

  const handleUnifiedBlur = () => {
    if (repaginateTimerRef.current) window.clearTimeout(repaginateTimerRef.current)
    if (emitChangeTimerRef.current) window.clearTimeout(emitChangeTimerRef.current)
    isFocusedRef.current = false
    originalRunsRef.current = {}
    toolbarBridgeRef.current?.hide()
    activeBlockIdRef.current = null
    setFixedToolbarBlockId(null)
    setFixedToolbarStyle(undefined)
    const nextBlocks = syncBlocksFromDom()
    if (!nextBlocks) {
      setEditSession((s) => s + 1)
      return
    }
    frozenBlocksRef.current = nextBlocks
    emitChange(nextBlocks)
    requestAnimationFrame(() => {
      remasureAndPaginate()
      displayedPageBlockIdsRef.current = pageIdsRef.current[currentPageRef.current] ?? []
      setEditSession((s) => s + 1)
    })
  }

  const handleUnifiedFocus = () => {
    isFocusedRef.current = true
    displayedPageBlockIdsRef.current = pageIdsRef.current[currentPageRef.current] ?? []
    const snapshot: Record<string, DocumentRun[]> = {}
    for (const block of currentPageBlocks) {
      if (block.type === 'table') continue
      snapshot[block.id] = normalizeRuns(block)
    }
    originalRunsRef.current = snapshot
  }

  const handlePageChange = (pageIndex: number) => {
    if (isFocusedRef.current && unifiedBodyRef.current) {
      unifiedBodyRef.current.blur()
    }
    toolbarBridgeRef.current?.hide()
    setCurrentPage(pageIndex)
    setEditSession((s) => s + 1)
  }

  const buildBlockStyle = (block: DocumentBlock): CSSProperties => {
    const s = block.style ?? {}
    const isHeading = block.type === 'heading'
    const fontSizePt =
      s.font_size ??
      (isHeading ? (HEADING_FONT_SIZES[block.level] ?? 16) : (defaultStyle.font_size ?? 10.5))

    const fontFamily = [
      s.east_asia_font || defaultStyle.east_asia_font || s.font_name || defaultStyle.font_name,
      'SimSun',
      '宋体',
      'Songti SC',
      'PingFang SC',
      'serif',
    ]
      .filter(Boolean)
      .join(', ')

    let lineHeight: number | string | undefined
    if (s.line_spacing != null) {
      if (
        s.line_spacing_rule === 'exact' ||
        s.line_spacing_rule === 'exactly' ||
        s.line_spacing_rule === 'at_least'
      ) {
        lineHeight = ptToPx(s.line_spacing) * scale
      } else {
        lineHeight = s.line_spacing
      }
    }

    let background: string | undefined
    if (s.highlight) background = highlightNameToHex(s.highlight)
    else if (s.shading) background = `#${s.shading}`

    let textDecoration: string | undefined
    if (s.underline && s.strike) textDecoration = 'underline line-through'
    else if (s.underline) textDecoration = 'underline'
    else if (s.strike) textDecoration = 'line-through'

    const isCentered = s.alignment === 'center'
    return {
      fontFamily,
      fontSize: ptToPx(fontSizePt) * scale,
      textAlign: (s.alignment as CSSProperties['textAlign']) || 'left',
      fontWeight: s.bold ? 700 : isHeading ? 700 : 400,
      fontStyle: s.italic ? 'italic' : undefined,
      textDecoration,
      color: s.color ? `#${s.color}` : undefined,
      background,
      textShadow: s.shadow ? '1px 1px 2px rgba(0, 0, 0, 0.45)' : undefined,
      lineHeight,
      marginTop: ptToPx(s.space_before ?? 0) * scale,
      marginBottom: ptToPx(s.space_after ?? 0) * scale,
      paddingLeft: isCentered ? 0 : twipsToPxLocal(s.indent_left ?? 0) * scale,
      paddingRight: isCentered ? 0 : twipsToPxLocal(s.indent_right ?? 0) * scale,
      textIndent: isCentered ? 0 : twipsToPxLocal(s.indent_first_line ?? 0) * scale,
    }
  }

  const buildTableStyle = (block: DocumentBlock): CSSProperties => {
    const s = block.style ?? {}
    return {
      fontFamily: [
        s.east_asia_font || defaultStyle.east_asia_font || s.font_name || defaultStyle.font_name,
        'SimSun',
        '宋体',
        'serif',
      ]
        .filter(Boolean)
        .join(', '),
      fontSize: ptToPx(s.font_size ?? defaultStyle.font_size ?? 10.5) * scale,
      fontWeight: s.bold ? 700 : 400,
      color: s.color ? `#${s.color}` : undefined,
      margin: s.alignment === 'center' ? '0 auto' : s.alignment === 'right' ? '0 0 0 auto' : undefined,
    }
  }

  const buildRunStyle = (runStyle?: BlockStyle): CSSProperties => {
    if (!runStyle) return {}
    const s = runStyle
    const css: CSSProperties = {}
    if (s.font_size) css.fontSize = ptToPx(s.font_size) * scale
    if (s.east_asia_font || s.font_name) {
      css.fontFamily = [
        s.east_asia_font || s.font_name,
        'SimSun',
        '宋体',
        'Songti SC',
        'PingFang SC',
        'serif',
      ]
        .filter(Boolean)
        .join(', ')
    }
    if (s.bold !== undefined) css.fontWeight = s.bold ? 700 : 400
    if (s.italic !== undefined) css.fontStyle = s.italic ? 'italic' : undefined
    if (s.underline && s.strike) css.textDecoration = 'underline line-through'
    else if (s.underline) css.textDecoration = 'underline'
    else if (s.strike) css.textDecoration = 'line-through'
    if (s.color) css.color = `#${s.color}`
    if (s.highlight) css.background = highlightNameToHex(s.highlight)
    else if (s.shading) css.background = `#${s.shading}`
    if (s.shadow) css.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.45)'
    return css
  }

  /** 工具栏样式：同步数据模型并立即写入 contentEditable DOM */
  const applyStyleFromToolbar = useCallback(
    (patch: Partial<BlockStyle>) => {
      if (readOnly) return

      const bridgeSel = toolbarBridgeRef.current?.getSelection()
      const liveSel = editorRef.current
        ? resolveTextSelectionInEditor(editorRef.current)
        : null
      const blockId =
        bridgeSel?.blockId ?? liveSel?.blockId ?? fixedToolbarBlockId ?? activeBlockIdRef.current
      if (!blockId) return

      const target =
        frozenBlocksRef.current.find((b) => b.id === blockId) ??
        contentRef.current?.blocks?.find((b) => b.id === blockId)
      if (!target || target.type === 'table') return

      pushUndoSnapshot()

      let start = bridgeSel?.start ?? liveSel?.start ?? 0
      let end = bridgeSel?.end ?? liveSel?.end ?? 0

      if (isInlineStylePatch(patch)) {
        if (start === end) {
          const runs = normalizeRuns(target)
          let cursor = 0
          for (const run of runs) {
            const next = cursor + run.text.length
            if (start >= cursor && start <= next) {
              start = cursor
              end = next
              break
            }
            cursor = next
          }
        }
        if (start === end) return

        const selStart = Math.min(start, end)
        const selEnd = Math.max(start, end)
        const finalPatch = resolveInlineStylePatch(target, selStart, selEnd, patch)
        const nextRuns = applyStyleToRuns(target, selStart, selEnd, finalPatch)
        const nextText = nextRuns.map((r) => r.text).join('')

        let nextBlockStyle = { ...(target.style ?? {}) }
        const textLen = target.text?.length ?? 0
        if (selStart === 0 && selEnd === textLen && textLen > 0) {
          for (const key of BOOLEAN_TOGGLE_KEYS) {
            if (key in finalPatch && finalPatch[key] === false && nextBlockStyle[key]) {
              delete nextBlockStyle[key]
            }
          }
        }

        const updatedBlock: DocumentBlock = {
          ...target,
          text: nextText,
          runs: nextRuns,
          style: nextBlockStyle,
        }
        const nextBlocks = getOrderedBlocks(
          frozenBlocksRef.current.map((b) => (b.id === blockId ? updatedBlock : b)),
        )
        commitBlocksUpdate(nextBlocks)
        originalRunsRef.current[blockId] = nextRuns

        const escaped =
          typeof CSS !== 'undefined' && CSS.escape
            ? CSS.escape(blockId)
            : blockId.replace(/"/g, '\\"')
        const blockEl = unifiedBodyRef.current?.querySelector<HTMLElement>(
          `[data-block-id="${escaped}"]`,
        )
        if (blockEl) {
          writeRunsToBlockDom(blockEl, updatedBlock, buildRunStyle)
          if (selEnd > selStart && unifiedBodyRef.current) {
            restoreTextSelectionInBlock(unifiedBodyRef.current, blockId, selStart, selEnd)
          }
        }
        setFixedToolbarStyle(resolveStyleForSelection(updatedBlock, selStart, selEnd))
        requestAnimationFrame(() => refreshSelectionToolbar())
        return
      }

      const selStart = Math.min(start, end)
      const selEnd = Math.max(start, end)
      const updatedBlock: DocumentBlock = {
        ...target,
        style: { ...(target.style ?? {}), ...patch },
      }
      const nextBlocks = getOrderedBlocks(
        frozenBlocksRef.current.map((b) => (b.id === blockId ? updatedBlock : b)),
      )
      commitBlocksUpdate(nextBlocks)

      const escaped =
        typeof CSS !== 'undefined' && CSS.escape
          ? CSS.escape(blockId)
          : blockId.replace(/"/g, '\\"')
      const blockEl = unifiedBodyRef.current?.querySelector<HTMLElement>(
        `[data-block-id="${escaped}"]`,
      )
      if (blockEl) applyCssProperties(blockEl, buildBlockStyle(updatedBlock))
      setFixedToolbarStyle(updatedBlock.style)
      if (selEnd > selStart && unifiedBodyRef.current) {
        restoreTextSelectionInBlock(unifiedBodyRef.current, blockId, selStart, selEnd)
        requestAnimationFrame(() => refreshSelectionToolbar())
      }
    },
    [readOnly, fixedToolbarBlockId, pushUndoSnapshot, commitBlocksUpdate, refreshSelectionToolbar],
  )

  useEffect(() => {
    if (readOnly) return
    const onSelectionChange = () => {
      if (!isFocusedRef.current) return
      refreshSelectionToolbar()
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [readOnly, refreshSelectionToolbar])

  const renderBlockText = (block: DocumentBlock) => {
    if (block.runs && block.runs.length > 0) {
      return block.runs.map((run, i) => (
        <span key={i} style={buildRunStyle(run.style)}>
          {run.text}
        </span>
      ))
    }
    return block.text
  }

  /** 渲染内容块；key 带 index，杜绝重复 id 冲突 */
  const renderBlockNode = (block: DocumentBlock, mode: 'edit' | 'measure' | 'export', index: number) => {
    const style = buildBlockStyle(block)
    const idAttr = mode === 'measure' ? { 'data-measure-id': block.id } : { 'data-block-id': block.id }
    const reactKey = `${mode}-${block.id}-${index}`

    if (block.type === 'table') {
      return (
        <div
          key={reactKey}
          {...idAttr}
          data-block-kind="table"
          data-block-type="table"
          className="doc-editor__table-wrap"
          contentEditable={false}
          suppressContentEditableWarning
        >
          <table className="doc-editor__table" style={buildTableStyle(block)}>
            <tbody>
              {(block.rows ?? []).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      data-editable-block-id={mode === 'edit' ? block.id : undefined}
                      contentEditable={mode === 'edit' && !readOnly}
                      suppressContentEditableWarning
                      onMouseUp={mode === 'edit' ? refreshSelectionToolbar : undefined}
                      onKeyUp={mode === 'edit' ? refreshSelectionToolbar : undefined}
                      onBlur={mode === 'edit' ? handleTableCellInteractionEnd : undefined}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    const className =
      block.type === 'heading'
        ? 'doc-editor__heading'
        : block.type === 'formula'
          ? 'doc-editor__formula'
          : 'doc-editor__paragraph'

    return (
      <div
        key={reactKey}
        {...idAttr}
        data-block-kind="text"
        data-block-type={block.type}
        data-editable-block-id={mode === 'edit' ? block.id : undefined}
        className={className}
        style={style}
      >
        {block.type === 'formula' ? (
          <span data-formula-text>{renderBlockText(block)}</span>
        ) : (
          renderBlockText(block)
        )}
        {block.type === 'formula' &&
          block.formulas?.map((f, i) => (
            <div key={i} className="doc-editor__formula-item" contentEditable={false}>
              【公式】{f}
            </div>
          ))}
      </div>
    )
  }

  const paperSheetStyle: CSSProperties = {
    width: layout.pageWidthPx,
    height: layout.pageHeightPx,
    paddingTop: layout.marginTopPx,
    paddingBottom: layout.marginBottomPx,
    paddingLeft: layout.marginLeftPx,
    paddingRight: layout.marginRightPx,
  }

  const bodyStyle: CSSProperties = {
    height: layout.bodyHeightPx,
    overflow: 'hidden',
  }

  const headerText = documentContent?.headers?.[0]?.text
  const footerText = documentContent?.footers?.[0]?.text
  const totalPages = Math.max(1, pageIds.length)

  const renderStaticPageBody = (pageBlocks: DocumentBlock[], mode: 'measure' | 'export') => (
    <div className="doc-editor__unified doc-editor__unified--readonly">
      {pageBlocks.map((b, i) => renderBlockNode(b, mode, i))}
    </div>
  )

  /** 渲染导出/只读纸面 */
  const renderExportPaperPage = (pageIndex: number, pageBlocks: DocumentBlock[]) => (
    <div
      className="doc-page doc-page--export"
      style={paperSheetStyle}
      data-page-index={pageIndex}
    >
      {headerText && <div className="doc-page__header">{headerText}</div>}
      <div className="doc-page__body" style={bodyStyle}>
        {renderStaticPageBody(pageBlocks, 'export')}
      </div>
      {footerText && <div className="doc-page__footer-text">{footerText}</div>}
      <div className="doc-page__page-number">
        第 {pageIndex + 1} 页{totalPages > 1 ? ` / 共 ${totalPages} 页` : ''}
      </div>
    </div>
  )

  if (!documentContent) {
    return (
      <div className="doc-editor doc-editor--empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
      </div>
    )
  }

  // 编辑中冻结测量/导出快照，避免输入时同步 reconcile 干扰
  const snapshotBlocks = liveMeasureBlocks ?? (isFocusedRef.current ? renderBlocks : blocks)

  useLayoutEffect(() => {
    if (!isFocusedRef.current) {
      displayedPageBlockIdsRef.current = pageIds[currentPage] ?? []
    }
  }, [currentPage, pageIds])

  return (
    <div className="doc-editor doc-editor--paper" ref={editorRef}>
      {!readOnly && (
        <FloatingToolbarHost bridgeRef={toolbarBridgeRef} onStyleChange={applyStyleFromToolbar} />
      )}

      {hasLegacyBlocks && (
        <Alert
          type="warning"
          showIcon
          title="该合同文档缺少模板定位信息（source_ref）"
          description="不影响网页编辑与 PDF 导出；导入后请在编辑区调整版式，最终以导出 PDF 为准。"
          className="doc-editor__legacy-alert"
        />
      )}

      <Alert
        type="info"
        showIcon
        className="doc-editor__page-hint"
        title="文档已按网页纸张分页，页边界可能与 Word 处理不一致，请以本页预览为准。"
      />

      {!readOnly && (
        <div
          className="doc-editor__fixed-toolbar"
          onMouseDown={(event) => event.preventDefault()}
        >
          <FormatToolbar
            style={fixedToolbarStyle}
            disabled={!fixedToolbarBlockId}
            onChange={applyStyleFromToolbar}
          />
        </div>
      )}

      <div className="doc-editor__pages">
        <div className="doc-page" style={paperSheetStyle} data-page-index={currentPage}>
          {headerText && <div className="doc-page__header">{headerText}</div>}
          <div className="doc-page__body" style={bodyStyle}>
            {readOnly ? (
              renderStaticPageBody(currentPageBlocks, 'export')
            ) : (
              <EditableUnifiedBody
                sessionKey={editSessionKey}
                pageBlocks={currentPageBlocks}
                defaultStyle={defaultStyle}
                scale={scale}
                bodyRef={unifiedBodyRef}
                onFocus={handleUnifiedFocus}
                onBlur={handleUnifiedBlur}
                onSelectionRefresh={refreshSelectionToolbar}
                onInputCommit={handleEditorInput}
                onEditorKeyDown={handleEditorKeyDown}
                renderBlockNode={renderBlockNode}
              />
            )}
          </div>
          {footerText && <div className="doc-page__footer-text">{footerText}</div>}
          <div className="doc-page__page-number">
            第 {currentPage + 1} 页{totalPages > 1 ? ` / 共 ${totalPages} 页` : ''}
          </div>
        </div>
        <PageNavigator
          current={currentPage}
          total={totalPages}
          onChange={handlePageChange}
          disabled={paginating}
        />
      </div>

      <div
        className="doc-editor__measure"
        ref={measureRef}
        aria-hidden
        style={{ width: layout.contentWidthPx }}
      >
        {snapshotBlocks.map((b, i) => renderBlockNode(b, 'measure', i))}
      </div>

      <div className="doc-editor__export-host" ref={exportHostRef} aria-hidden>
        {pageIds.map((ids, pageIndex) => {
          const pageBlocks = ids
            .map((id) => activeBlockMap[id] ?? blockMap[id])
            .filter(Boolean)
          return (
            <div key={`export-page-${pageIndex}`}>
              {renderExportPaperPage(pageIndex, pageBlocks)}
            </div>
          )
        })}
      </div>
    </div>
  )
})
