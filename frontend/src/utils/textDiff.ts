/**
 * 简易文本 Diff：按「字」做 LCS，输出 equal / insert / delete 片段。
 * 用于变更定位时的 Git 风格红绿高亮（中文友好）。
 */

export type TextDiffOp = 'equal' | 'insert' | 'delete'

export interface TextDiffPart {
  type: TextDiffOp
  text: string
}

/** 将字符串拆成可对比单元（按 Unicode 码点，适合中文） */
function tokenize(text: string): string[] {
  return Array.from(text ?? '')
}

/**
 * 基于 LCS 的字符级 Diff。
 * @param oldText 变更前文本
 * @param newText 变更后文本
 */
export function diffTextChars(oldText: string, newText: string): TextDiffPart[] {
  const a = tokenize(oldText)
  const b = tokenize(newText)
  const n = a.length
  const m = b.length

  if (n === 0 && m === 0) return []
  if (n === 0) return [{ type: 'insert', text: newText }]
  if (m === 0) return [{ type: 'delete', text: oldText }]

  // DP: lcs[i][j] = LCS length of a[0..i) and b[0..j)
  const lcs: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) lcs[i][j] = lcs[i - 1][j - 1] + 1
      else lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1])
    }
  }

  // 回溯生成片段（从后往前）
  const reversed: TextDiffPart[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      pushPart(reversed, 'equal', a[i - 1])
      i--
      j--
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      pushPart(reversed, 'insert', b[j - 1])
      j--
    } else {
      pushPart(reversed, 'delete', a[i - 1])
      i--
    }
  }

  return reversed.reverse()
}

/**
 * 合并相邻同类型片段。
 * 回溯从字符串末尾向前推进，同段内字符需前插，否则会整段倒序。
 */
function pushPart(parts: TextDiffPart[], type: TextDiffOp, ch: string) {
  const last = parts[parts.length - 1]
  if (last && last.type === type) {
    last.text = ch + last.text
  } else {
    parts.push({ type, text: ch })
  }
}

/**
 * 从变更记录推断高亮类型。
 * 样式类不做假文本 Diff。
 */
export function inferChangeHighlightKind(
  changeReason?: string | null,
  changeType?: number,
): 'text' | 'style' | 'table' | 'structure' {
  const reason = changeReason ?? ''
  if (reason.includes('样式')) return 'style'
  if (reason.includes('表格') || reason.includes('表')) return 'table'
  if (reason.includes('结构') || reason.includes('分页')) return 'structure'
  if (changeType === 0 || changeType === 1) return 'text'
  return 'text'
}
