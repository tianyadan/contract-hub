package documentdiff

import (
	"encoding/json"
	"fmt"
	"strings"
)

const maxContentLen = 500

var styleKeyLabels = map[string]string{
	"alignment":           "对齐",
	"line_spacing":        "行距",
	"line_spacing_rule":   "行距规则",
	"space_before":        "段前距",
	"space_after":         "段后距",
	"indent_first_line":   "首行缩进",
	"indent_left":         "左缩进",
	"indent_right":        "右缩进",
	"font_size":           "字号",
	"font_name":           "字体",
	"east_asia_font":      "中文字体",
	"bold":                "加粗",
	"italic":              "斜体",
	"underline":           "下划线",
	"strike":              "删除线",
	"color":               "字体颜色",
	"highlight":           "高亮",
	"shadow":              "阴影",
	"shading":             "底纹",
}

// truncate 截断展示用文本。
func truncate(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max]) + "…"
}

// blockPreview 生成块内容摘要。
func blockPreview(block *DocumentBlock) string {
	if block == nil {
		return ""
	}
	if block.Type == "table" {
		if len(block.Rows) == 0 {
			return "（空表格）"
		}
		var cells []string
		for _, row := range block.Rows {
			cells = append(cells, strings.Join(row, " | "))
		}
		return truncate(strings.Join(cells, " / "), maxContentLen)
	}
	text := blockText(block)
	if text == "" {
		return "（空段落）"
	}
	return truncate(text, maxContentLen)
}

// clauseNoFromBlock 从 source_ref 推导条款编号占位。
func clauseNoFromBlock(block *DocumentBlock) string {
	if block == nil || block.SourceRef == nil {
		return ""
	}
	return fmt.Sprintf("§%d", block.SourceRef.Index+1)
}

// formatStyleDiffReason 将样式键级 diff 格式化为中文说明。
func formatStyleDiffReason(prefix string, diff map[string][2]interface{}) string {
	if len(diff) == 0 {
		return ""
	}
	parts := make([]string, 0, len(diff))
	for key, pair := range diff {
		label := styleKeyLabels[key]
		if label == "" {
			label = key
		}
		parts = append(parts, fmt.Sprintf("%s %s→%s", label, formatStyleValue(pair[0]), formatStyleValue(pair[1])))
	}
	return prefix + strings.Join(parts, "；")
}

func formatStyleValue(v interface{}) string {
	if v == nil {
		return "无"
	}
	switch val := v.(type) {
	case bool:
		if val {
			return "是"
		}
		return "否"
	case float64:
		if keyLooksLikeFontSize(val) {
			return fmt.Sprintf("%.1fpt", val)
		}
		return fmt.Sprintf("%v", val)
	case string:
		if val == "" {
			return "无"
		}
		if len(val) == 6 && !strings.Contains(val, " ") {
			return "#" + val
		}
		return val
	default:
		b, _ := json.Marshal(val)
		return string(b)
	}
}

func keyLooksLikeFontSize(v float64) bool {
	return v > 0 && v < 100
}

// diffStyleMaps 比较两个样式对象，返回变更键及 old/new。
func diffStyleMaps(oldStyle, newStyle *BlockStyle) map[string][2]interface{} {
	oldMap := styleToMap(oldStyle)
	newMap := styleToMap(newStyle)
	diff := make(map[string][2]interface{})

	keys := make(map[string]struct{})
	for k := range oldMap {
		keys[k] = struct{}{}
	}
	for k := range newMap {
		keys[k] = struct{}{}
	}

	for k := range keys {
		ov, okO := oldMap[k]
		nv, okN := newMap[k]
		if !okO && !okN {
			continue
		}
		if !okO {
			diff[k] = [2]interface{}{nil, nv}
			continue
		}
		if !okN {
			diff[k] = [2]interface{}{ov, nil}
			continue
		}
		if jsonEqual(ov, nv) {
			continue
		}
		diff[k] = [2]interface{}{ov, nv}
	}
	return diff
}

func styleToMap(style *BlockStyle) map[string]interface{} {
	if style == nil {
		return map[string]interface{}{}
	}
	b, err := json.Marshal(style)
	if err != nil {
		return map[string]interface{}{}
	}
	var m map[string]interface{}
	if err := json.Unmarshal(b, &m); err != nil {
		return map[string]interface{}{}
	}
	return m
}

func jsonEqual(a, b interface{}) bool {
	ab, _ := json.Marshal(a)
	bb, _ := json.Marshal(b)
	return string(ab) == string(bb)
}

func marshalStyleDiff(diff map[string][2]interface{}) (string, string) {
	oldPart := make(map[string]interface{})
	newPart := make(map[string]interface{})
	for k, pair := range diff {
		if pair[0] != nil {
			oldPart[k] = pair[0]
		}
		if pair[1] != nil {
			newPart[k] = pair[1]
		}
	}
	ob, _ := json.Marshal(oldPart)
	nb, _ := json.Marshal(newPart)
	return string(ob), string(nb)
}
