package documentdiff

// DocumentContent 与前端 V3 document_content 对齐（diff 所需字段）。
type DocumentContent struct {
	Blocks []DocumentBlock `json:"blocks"`
	Seals  []DocumentSeal  `json:"seals"`
}

// DocumentSeal 合同纸面电子章（diff 用）。
type DocumentSeal struct {
	ID        string  `json:"id"`
	OssKey    string  `json:"oss_key"`
	PageIndex int     `json:"page_index"`
	XRatio    float64 `json:"x_ratio"`
	YRatio    float64 `json:"y_ratio"`
	Scale     float64 `json:"scale"`
	Rotate    float64 `json:"rotate"`
	PlacedBy  string  `json:"placed_by"`
}

// DocumentBlock 文档块。
type DocumentBlock struct {
	ID              string        `json:"id"`
	Type            string        `json:"type"`
	Text            string        `json:"text"`
	Order           int           `json:"order"`
	Level           int           `json:"level"`
	Style           *BlockStyle   `json:"style"`
	Runs            []DocumentRun `json:"runs"`
	Rows            [][]string    `json:"rows"`
	PageBreakBefore bool          `json:"page_break_before"`
	SourceRef       *SourceRef    `json:"source_ref"`
}

// DocumentRun 段落内 run。
type DocumentRun struct {
	Text  string      `json:"text"`
	Style *BlockStyle `json:"style"`
}

// SourceRef 原 DOCX 模板定位。
type SourceRef struct {
	Kind  string `json:"kind"`
	Index int    `json:"index"`
}

// BlockStyle 块/run 样式（字段与前端 BlockStyle 一致）。
type BlockStyle struct {
	Alignment        *string  `json:"alignment,omitempty"`
	LineSpacing        *float64 `json:"line_spacing,omitempty"`
	LineSpacingRule  *string  `json:"line_spacing_rule,omitempty"`
	SpaceBefore      *float64 `json:"space_before,omitempty"`
	SpaceAfter       *float64 `json:"space_after,omitempty"`
	IndentFirstLine  *float64 `json:"indent_first_line,omitempty"`
	IndentLeft       *float64 `json:"indent_left,omitempty"`
	IndentRight      *float64 `json:"indent_right,omitempty"`
	FontSize         *float64 `json:"font_size,omitempty"`
	FontName         *string  `json:"font_name,omitempty"`
	EastAsiaFont     *string  `json:"east_asia_font,omitempty"`
	Bold             *bool    `json:"bold,omitempty"`
	Italic           *bool    `json:"italic,omitempty"`
	Underline        *bool    `json:"underline,omitempty"`
	Strike           *bool    `json:"strike,omitempty"`
	Color            *string  `json:"color,omitempty"`
	Highlight        *string  `json:"highlight,omitempty"`
	Shadow           *bool    `json:"shadow,omitempty"`
	Shading          *string  `json:"shading,omitempty"`
}

// Record diff 结果（待写入 contract_change）。
type Record struct {
	ChangeType   int8
	BlockID      string
	ClauseNo     string
	OldContent   string
	NewContent   string
	ChangeReason string
	Subtype      string
}
