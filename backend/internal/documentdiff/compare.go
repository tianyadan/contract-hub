package documentdiff

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// CompareJSON 对比两个版本 document_content，返回变更记录列表。
func CompareJSON(oldJSON string, newDoc map[string]interface{}) ([]Record, error) {
	var oldDoc DocumentContent
	if strings.TrimSpace(oldJSON) != "" {
		if err := json.Unmarshal([]byte(oldJSON), &oldDoc); err != nil {
			return nil, fmt.Errorf("parse old document: %w", err)
		}
	}

	newBytes, err := json.Marshal(newDoc)
	if err != nil {
		return nil, fmt.Errorf("marshal new document: %w", err)
	}
	var fresh DocumentContent
	if err := json.Unmarshal(newBytes, &fresh); err != nil {
		return nil, fmt.Errorf("parse new document: %w", err)
	}

	return Compare(&oldDoc, &fresh), nil
}

// Compare 对比两份结构化文档。
func Compare(oldDoc, newDoc *DocumentContent) []Record {
	if oldDoc == nil {
		oldDoc = &DocumentContent{}
	}
	if newDoc == nil {
		newDoc = &DocumentContent{}
	}

	oldMap := indexBlocks(oldDoc.Blocks)
	newMap := indexBlocks(newDoc.Blocks)

	oldIDs := sortedKeys(oldMap)
	newIDs := sortedKeys(newMap)

	records := make([]Record, 0)

	for _, id := range newIDs {
		if _, ok := oldMap[id]; !ok {
			block := newMap[id]
			records = append(records, Record{
				ChangeType:   0,
				BlockID:      id,
				ClauseNo:     clauseNoFromBlock(block),
				NewContent:   blockPreview(block),
				ChangeReason: fmt.Sprintf("新增%s", blockTypeLabel(block.Type)),
				Subtype:      "text",
			})
		}
	}

	for _, id := range oldIDs {
		if _, ok := newMap[id]; !ok {
			block := oldMap[id]
			records = append(records, Record{
				ChangeType:   1,
				BlockID:      id,
				ClauseNo:     clauseNoFromBlock(block),
				OldContent:   blockPreview(block),
				ChangeReason: fmt.Sprintf("删除%s", blockTypeLabel(block.Type)),
				Subtype:      "text",
			})
		}
	}

	for _, id := range newIDs {
		oldBlock, okO := oldMap[id]
		newBlock, okN := newMap[id]
		if !okO || !okN {
			continue
		}
		records = append(records, compareBlock(oldBlock, newBlock)...)
	}

	records = append(records, compareSeals(oldDoc.Seals, newDoc.Seals)...)

	return records
}

// compareSeals 对比电子章增删改，写入编辑记录。
func compareSeals(oldSeals, newSeals []DocumentSeal) []Record {
	oldMap := indexSeals(oldSeals)
	newMap := indexSeals(newSeals)
	oldIDs := sortedSealKeys(oldMap)
	newIDs := sortedSealKeys(newMap)
	records := make([]Record, 0)

	for _, id := range newIDs {
		if _, ok := oldMap[id]; !ok {
			s := newMap[id]
			records = append(records, Record{
				ChangeType:   0,
				BlockID:      "seal:" + id,
				NewContent:   sealPreview(s),
				ChangeReason: fmt.Sprintf("新增电子章（第%d页）", s.PageIndex+1),
				Subtype:      "seal",
			})
		}
	}
	for _, id := range oldIDs {
		if _, ok := newMap[id]; !ok {
			s := oldMap[id]
			records = append(records, Record{
				ChangeType:   1,
				BlockID:      "seal:" + id,
				OldContent:   sealPreview(s),
				ChangeReason: fmt.Sprintf("删除电子章（第%d页）", s.PageIndex+1),
				Subtype:      "seal",
			})
		}
	}
	for _, id := range newIDs {
		o, okO := oldMap[id]
		n, okN := newMap[id]
		if !okO || !okN {
			continue
		}
		if sealsEqual(o, n) {
			continue
		}
		records = append(records, Record{
			ChangeType:   2,
			BlockID:      "seal:" + id,
			OldContent:   sealPreview(o),
			NewContent:   sealPreview(n),
			ChangeReason: fmt.Sprintf("调整电子章（第%d页→第%d页）", o.PageIndex+1, n.PageIndex+1),
			Subtype:      "seal",
		})
	}
	return records
}

func indexSeals(seals []DocumentSeal) map[string]*DocumentSeal {
	m := make(map[string]*DocumentSeal, len(seals))
	for i := range seals {
		s := &seals[i]
		id := strings.TrimSpace(s.ID)
		if id == "" {
			continue
		}
		m[id] = s
	}
	return m
}

func sortedSealKeys(m map[string]*DocumentSeal) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func sealsEqual(a, b *DocumentSeal) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.OssKey == b.OssKey &&
		a.PageIndex == b.PageIndex &&
		approxEqual(a.XRatio, b.XRatio) &&
		approxEqual(a.YRatio, b.YRatio) &&
		approxEqual(a.Scale, b.Scale) &&
		approxEqual(a.Rotate, b.Rotate)
}

func approxEqual(a, b float64) bool {
	d := a - b
	if d < 0 {
		d = -d
	}
	return d < 0.0001
}

func sealPreview(s *DocumentSeal) string {
	if s == nil {
		return ""
	}
	who := s.PlacedBy
	if who == "" {
		who = "unknown"
	}
	return truncate(fmt.Sprintf("第%d页 · %s · scale=%.2f", s.PageIndex+1, who, s.Scale), maxContentLen)
}

func compareBlock(oldBlock, newBlock *DocumentBlock) []Record {
	records := make([]Record, 0)
	id := newBlock.ID
	clause := clauseNoFromBlock(newBlock)

	if oldBlock.Type != newBlock.Type {
		records = append(records, Record{
			ChangeType:   2,
			BlockID:      id,
			ClauseNo:     clause,
			OldContent:   oldBlock.Type,
			NewContent:   newBlock.Type,
			ChangeReason: fmt.Sprintf("块类型 %s→%s", blockTypeLabel(oldBlock.Type), blockTypeLabel(newBlock.Type)),
			Subtype:      "structure",
		})
	}

	if oldBlock.PageBreakBefore != newBlock.PageBreakBefore {
		records = append(records, Record{
			ChangeType:   2,
			BlockID:      id,
			ClauseNo:     clause,
			OldContent:   fmt.Sprintf("%v", oldBlock.PageBreakBefore),
			NewContent:   fmt.Sprintf("%v", newBlock.PageBreakBefore),
			ChangeReason: "分页标记变更",
			Subtype:      "structure",
		})
	}

	if newBlock.Type == "table" || oldBlock.Type == "table" {
		if !rowsEqual(oldBlock.Rows, newBlock.Rows) {
			oldJSON, _ := json.Marshal(oldBlock.Rows)
			newJSON, _ := json.Marshal(newBlock.Rows)
			records = append(records, Record{
				ChangeType:   2,
				BlockID:      id,
				ClauseNo:     clause,
				OldContent:   truncate(string(oldJSON), maxContentLen),
				NewContent:   truncate(string(newJSON), maxContentLen),
				ChangeReason: "修改表格内容",
				Subtype:      "table",
			})
		}
		return records
	}

	oldText := blockText(oldBlock)
	newText := blockText(newBlock)
	if oldText != newText {
		records = append(records, Record{
			ChangeType:   2,
			BlockID:      id,
			ClauseNo:     clause,
			OldContent:   truncate(oldText, maxContentLen),
			NewContent:   truncate(newText, maxContentLen),
			ChangeReason: "修改文本",
			Subtype:      "text",
		})
	}

	styleDiff := diffStyleMaps(oldBlock.Style, newBlock.Style)
	if len(styleDiff) > 0 {
		oldJSON, newJSON := marshalStyleDiff(styleDiff)
		records = append(records, Record{
			ChangeType:   2,
			BlockID:      id,
			ClauseNo:     clause,
			OldContent:   oldJSON,
			NewContent:   newJSON,
			ChangeReason: formatStyleDiffReason("块样式：", styleDiff),
			Subtype:      "style_block",
		})
	}

	if oldText == newText && (len(oldBlock.Runs) > 0 || len(newBlock.Runs) > 0) {
		runRecords := compareRuns(oldBlock, newBlock)
		records = append(records, runRecords...)
	}

	return records
}

func compareRuns(oldBlock, newBlock *DocumentBlock) []Record {
	oldRuns := normalizeRuns(oldBlock)
	newRuns := normalizeRuns(newBlock)

	oldJSON, _ := json.Marshal(oldRuns)
	newJSON, _ := json.Marshal(newRuns)
	if string(oldJSON) == string(newJSON) {
		return nil
	}

	// 文本相同但 runs 不同：按有效样式 diff 汇总
	diff := diffRunStyles(oldRuns, newRuns, oldBlock.Style, newBlock.Style)
	if len(diff) == 0 {
		return nil
	}

	oldPart, newPart := marshalStyleDiff(diff)
	return []Record{{
		ChangeType:   2,
		BlockID:      newBlock.ID,
		ClauseNo:     clauseNoFromBlock(newBlock),
		OldContent:   oldPart,
		NewContent:   newPart,
		ChangeReason: formatStyleDiffReason("局部样式：", diff),
		Subtype:      "style_run",
	}}
}

// diffRunStyles 在文本不变时比较 run 级有效样式差异（简化：合并全部 run 样式键）。
func diffRunStyles(oldRuns, newRuns []DocumentRun, oldBlockStyle, newBlockStyle *BlockStyle) map[string][2]interface{} {
	oldEffective := effectiveRunStyleMap(oldRuns, oldBlockStyle)
	newEffective := effectiveRunStyleMap(newRuns, newBlockStyle)
	diff := make(map[string][2]interface{})
	for k, ov := range oldEffective {
		nv, ok := newEffective[k]
		if !ok || !jsonEqual(ov, nv) {
			diff[k] = [2]interface{}{ov, nv}
		}
	}
	for k, nv := range newEffective {
		if _, ok := oldEffective[k]; !ok {
			diff[k] = [2]interface{}{nil, nv}
		}
	}
	return diff
}

func effectiveRunStyleMap(runs []DocumentRun, blockStyle *BlockStyle) map[string]interface{} {
	merged := styleToMap(blockStyle)
	for _, run := range runs {
		for k, v := range styleToMap(run.Style) {
			merged[k] = v
		}
	}
	return merged
}

func normalizeRuns(block *DocumentBlock) []DocumentRun {
	text := blockText(block)
	runs := block.Runs
	if len(runs) > 0 {
		runText := strings.Join(runTexts(runs), "")
		if runText == text {
			out := make([]DocumentRun, len(runs))
			copy(out, runs)
			return out
		}
	}
	if text == "" {
		return nil
	}
	return []DocumentRun{{Text: text, Style: block.Style}}
}

func runTexts(runs []DocumentRun) []string {
	out := make([]string, len(runs))
	for i, r := range runs {
		out[i] = r.Text
	}
	return out
}

func blockText(block *DocumentBlock) string {
	if block == nil {
		return ""
	}
	if block.Text != "" {
		return block.Text
	}
	return strings.Join(runTexts(block.Runs), "")
}

func indexBlocks(blocks []DocumentBlock) map[string]*DocumentBlock {
	m := make(map[string]*DocumentBlock, len(blocks))
	for i := range blocks {
		b := &blocks[i]
		if b.ID == "" {
			continue
		}
		m[b.ID] = b
	}
	return m
}

func sortedKeys(m map[string]*DocumentBlock) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func rowsEqual(a, b [][]string) bool {
	aj, _ := json.Marshal(a)
	bj, _ := json.Marshal(b)
	return string(aj) == string(bj)
}

func blockTypeLabel(t string) string {
	switch t {
	case "heading":
		return "标题"
	case "table":
		return "表格"
	case "formula":
		return "公式"
	default:
		return "段落"
	}
}
