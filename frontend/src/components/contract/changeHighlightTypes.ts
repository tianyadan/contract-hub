/** 编辑器变更高亮状态（Git 风格红绿） */
export interface ChangeHighlightState {
  blockId: string
  changeType: 0 | 1 | 2
  oldText: string
  newText: string
  kind?: 'text' | 'style' | 'table' | 'structure'
}
