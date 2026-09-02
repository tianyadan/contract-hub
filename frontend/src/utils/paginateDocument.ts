import type { DocumentBlock, PageSetup } from '../types/contract'

/** twips → px（96dpi） */
export const twipsToPx = (tw: number) => (tw / 1440) * 96

/** 编辑区最大纸张显示宽度 */
export const MAX_PAPER_WIDTH = 760

/** 页脚「第 n 页」预留高度（px，未缩放前按显示坐标） */
export const PAGE_NUMBER_RESERVE_PX = 28

/** 缺省 A4 纵向 + 1 英寸边距（twips） */
export const DEFAULT_A4_PAGE: PageSetup = {
  width: 11906,
  height: 16838,
  orientation: 'portrait',
  margin_top: 1440,
  margin_right: 1440,
  margin_bottom: 1440,
  margin_left: 1440,
}

/** 页面布局（已含缩放后的 px） */
export interface PaperLayout {
  pageWidthPx: number
  pageHeightPx: number
  marginTopPx: number
  marginBottomPx: number
  marginLeftPx: number
  marginRightPx: number
  contentWidthPx: number
  /** 正文可用高度（已扣除页码区） */
  bodyHeightPx: number
  scale: number
}

/** 解析页面设置，缺省回退 A4 */
export function resolvePageSetup(page?: PageSetup | null): PageSetup {
  if (page && page.width > 0 && page.height > 0) return page
  return DEFAULT_A4_PAGE
}

/** 根据 PageSetup 计算纸面布局 */
export function computePaperLayout(page?: PageSetup | null, maxWidth = MAX_PAPER_WIDTH): PaperLayout {
  const setup = resolvePageSetup(page)
  const rawWidth = twipsToPx(setup.width)
  const scale = Math.min(1, maxWidth / rawWidth)
  const pageWidthPx = rawWidth * scale
  const pageHeightPx = twipsToPx(setup.height) * scale
  const marginTopPx = twipsToPx(setup.margin_top) * scale
  const marginBottomPx = twipsToPx(setup.margin_bottom) * scale
  const marginLeftPx = twipsToPx(setup.margin_left) * scale
  const marginRightPx = twipsToPx(setup.margin_right) * scale
  const pageNumberReserve = PAGE_NUMBER_RESERVE_PX * scale
  const bodyHeightPx = Math.max(
    80,
    pageHeightPx - marginTopPx - marginBottomPx - pageNumberReserve,
  )
  return {
    pageWidthPx,
    pageHeightPx,
    marginTopPx,
    marginBottomPx,
    marginLeftPx,
    marginRightPx,
    contentWidthPx: pageWidthPx - marginLeftPx - marginRightPx,
    bodyHeightPx,
    scale,
  }
}

/**
 * 按块高度做 Web 流式分页。
 * @param orderedIds 按阅读顺序的块 ID
 * @param heights 各块测量高度（px）
 * @param bodyHeightPx 单页正文可用高度
 * @param forceBreakBefore 块前强制断页
 */
export function paginateByHeights(
  orderedIds: string[],
  heights: Record<string, number>,
  bodyHeightPx: number,
  forceBreakBefore: Record<string, boolean> = {},
): string[][] {
  if (orderedIds.length === 0) return [[]]

  const pages: string[][] = []
  let current: string[] = []
  let used = 0
  const maxH = Math.max(40, bodyHeightPx)

  for (const id of orderedIds) {
    const h = Math.max(1, heights[id] ?? 24)
    const needBreak = Boolean(forceBreakBefore[id]) && current.length > 0
    const overflow = current.length > 0 && used + h > maxH + 0.5

    if (needBreak || overflow) {
      pages.push(current)
      current = []
      used = 0
    }

    current.push(id)
    used += h
  }

  if (current.length > 0) pages.push(current)
  return pages.length > 0 ? pages : [[]]
}

/** 查找块所在页索引，找不到返回 -1 */
export function findPageIndex(pageIds: string[][], blockId: string): number {
  return pageIds.findIndex((ids) => ids.includes(blockId))
}

/** 按 id 去重，保留首次出现（避免 React key 冲突导致白屏） */
export function dedupeBlocksById(blocks: DocumentBlock[]): DocumentBlock[] {
  const seen = new Set<string>()
  const out: DocumentBlock[] = []
  for (const block of blocks) {
    if (!block?.id || seen.has(block.id)) continue
    seen.add(block.id)
    out.push(block)
  }
  return out
}

/**
 * 根据当前页编辑区 DOM 的实时高度，为第一个溢出的块打上强制换页。
 * 解决「回车多次才换页、删除却很快回流」的不对称：以可视区高度为准，而非隐藏测量延迟。
 */
export function applyLivePageOverflowBreaks(
  blocks: DocumentBlock[],
  liveChildren: HTMLElement[],
  bodyHeightPx: number,
  /** 仅清除这些 id 上的自动换页标记（保留导入时的强制分页） */
  autoBreakIds: Set<string>,
): { blocks: DocumentBlock[]; autoBreakIds: Set<string> } {
  const nextAutoBreakIds = new Set<string>()
  const maxH = Math.max(40, bodyHeightPx)

  const domIds = new Set(
    liveChildren.map((el) => el.dataset.blockId).filter((id): id is string => Boolean(id)),
  )

  let cleared = blocks.map((b) =>
    autoBreakIds.has(b.id) ? { ...b, page_break_before: false } : b,
  )

  if (liveChildren.length === 0) {
    return { blocks: cleared, autoBreakIds: nextAutoBreakIds }
  }

  let used = 0
  let overflowBlockId: string | null = null

  for (let i = 0; i < liveChildren.length; i++) {
    const el = liveChildren[i]
    const h = Math.max(1, el.offsetHeight)
    const id = el.dataset.blockId
    if (used + h > maxH + 0.5 && i > 0 && id && domIds.has(id)) {
      overflowBlockId = id
      break
    }
    used += h
  }

  if (overflowBlockId) {
    nextAutoBreakIds.add(overflowBlockId)
    cleared = cleared.map((b) =>
      b.id === overflowBlockId ? { ...b, page_break_before: true } : b,
    )
  }

  return { blocks: cleared, autoBreakIds: nextAutoBreakIds }
}
