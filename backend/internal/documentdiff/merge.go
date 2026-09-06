package documentdiff

import (
	"encoding/json"
	"fmt"
	"sort"
)

// BlockConflict 块级三方合并冲突。
type BlockConflict struct {
	BlockID       string          `json:"block_id"`
	Summary       string          `json:"summary"`
	OursPreview   string          `json:"ours_preview"`
	TheirsPreview string          `json:"theirs_preview"`
	OursPresent   bool            `json:"ours_present"`
	TheirsPresent bool            `json:"theirs_present"`
	OursBlock     json.RawMessage `json:"ours_block,omitempty"`
	TheirsBlock   json.RawMessage `json:"theirs_block,omitempty"`
}

// MergeResult 三方合并结果。
type MergeResult struct {
	// Merged 自动合并后的文档（冲突块默认保留 ours）。
	Merged map[string]interface{}
	// Conflicts 需用户选择保留方的块。
	Conflicts []BlockConflict
}

type blockDecisionKind int

const (
	decisionOmit blockDecisionKind = iota
	decisionOurs
	decisionTheirs
	decisionConflict
)

type blockDecision struct {
	kind blockDecisionKind
}

// ThreeWayMergeMaps 对三份文档 JSON 做块级三方合并。
// base：双方共同起点；ours：当前保存方本地稿；theirs：服务端最新稿。
func ThreeWayMergeMaps(
	baseRaw map[string]interface{},
	oursRaw map[string]interface{},
	theirsRaw map[string]interface{},
) (*MergeResult, error) {
	if oursRaw == nil {
		oursRaw = map[string]interface{}{}
	}
	if theirsRaw == nil {
		theirsRaw = map[string]interface{}{}
	}
	if baseRaw == nil {
		baseRaw = map[string]interface{}{}
	}

	baseDoc, err := parseDocumentContent(baseRaw)
	if err != nil {
		return nil, fmt.Errorf("parse base document: %w", err)
	}
	oursDoc, err := parseDocumentContent(oursRaw)
	if err != nil {
		return nil, fmt.Errorf("parse ours document: %w", err)
	}
	theirsDoc, err := parseDocumentContent(theirsRaw)
	if err != nil {
		return nil, fmt.Errorf("parse theirs document: %w", err)
	}

	baseMap := indexBlocks(baseDoc.Blocks)
	oursMap := indexBlocks(oursDoc.Blocks)
	theirsMap := indexBlocks(theirsDoc.Blocks)

	ids := make(map[string]struct{})
	for id := range baseMap {
		ids[id] = struct{}{}
	}
	for id := range oursMap {
		ids[id] = struct{}{}
	}
	for id := range theirsMap {
		ids[id] = struct{}{}
	}

	decisions := make(map[string]blockDecision, len(ids))
	conflicts := make([]BlockConflict, 0)

	for id := range ids {
		b := baseMap[id]
		o := oursMap[id]
		t := theirsMap[id]
		d, c := decideBlock(id, b, o, t)
		decisions[id] = d
		if c != nil {
			conflicts = append(conflicts, *c)
		}
	}

	sort.Slice(conflicts, func(i, j int) bool {
		return conflicts[i].BlockID < conflicts[j].BlockID
	})

	mergedBlocks := buildMergedBlocks(oursDoc.Blocks, theirsDoc.Blocks, oursMap, theirsMap, decisions)
	merged := mergeDocumentShell(baseRaw, oursRaw, theirsRaw)
	merged["blocks"] = blocksToMaps(mergedBlocks)
	// 电子章按 id 并集合并，避免一方盖章被另一方保存覆盖
	merged["seals"] = mergeSealsByID(baseRaw["seals"], oursRaw["seals"], theirsRaw["seals"])

	return &MergeResult{
		Merged:    merged,
		Conflicts: conflicts,
	}, nil
}

// decideBlock 对单个块做三方裁决。
func decideBlock(id string, base, ours, theirs *DocumentBlock) (blockDecision, *BlockConflict) {
	hasB := base != nil
	hasO := ours != nil
	hasT := theirs != nil

	switch {
	case !hasO && !hasT:
		return blockDecision{kind: decisionOmit}, nil

	case hasO && hasT && blocksEqual(ours, theirs):
		return blockDecision{kind: decisionOurs}, nil

	case hasO && hasT && hasB:
		oChanged := !blocksEqual(base, ours)
		tChanged := !blocksEqual(base, theirs)
		if oChanged && tChanged {
			return blockDecision{kind: decisionConflict}, makeConflict(id, ours, theirs, "双方都修改了同一内容块")
		}
		if oChanged {
			return blockDecision{kind: decisionOurs}, nil
		}
		if tChanged {
			return blockDecision{kind: decisionTheirs}, nil
		}
		return blockDecision{kind: decisionOurs}, nil

	case hasO && hasT && !hasB:
		// 双方都新增了同 id
		return blockDecision{kind: decisionConflict}, makeConflict(id, ours, theirs, "双方都新增了同一内容块")

	case hasO && !hasT:
		if !hasB {
			return blockDecision{kind: decisionOurs}, nil // 我方新增
		}
		if blocksEqual(base, ours) {
			return blockDecision{kind: decisionOmit}, nil // 对方删除，我方未改
		}
		return blockDecision{kind: decisionConflict}, makeConflict(id, ours, nil, "我方修改了该块，对方已删除")

	case !hasO && hasT:
		if !hasB {
			return blockDecision{kind: decisionTheirs}, nil // 对方新增
		}
		if blocksEqual(base, theirs) {
			return blockDecision{kind: decisionOmit}, nil // 我方删除，对方未改
		}
		return blockDecision{kind: decisionConflict}, makeConflict(id, nil, theirs, "对方修改了该块，我方已删除")
	}

	return blockDecision{kind: decisionOurs}, nil
}

func makeConflict(id string, ours, theirs *DocumentBlock, summary string) *BlockConflict {
	c := &BlockConflict{
		BlockID:       id,
		Summary:       summary,
		OursPresent:   ours != nil,
		TheirsPresent: theirs != nil,
		OursPreview:   conflictPreview(ours),
		TheirsPreview: conflictPreview(theirs),
	}
	if ours != nil {
		c.OursBlock, _ = json.Marshal(ours)
	}
	if theirs != nil {
		c.TheirsBlock, _ = json.Marshal(theirs)
	}
	return c
}

func conflictPreview(block *DocumentBlock) string {
	if block == nil {
		return "（已删除）"
	}
	return truncate(blockPreview(block), 120)
}

// buildMergedBlocks 按我方顺序为主骨架，插入对方独有且自动采纳的块。
func buildMergedBlocks(
	oursBlocks, theirsBlocks []DocumentBlock,
	oursMap, theirsMap map[string]*DocumentBlock,
	decisions map[string]blockDecision,
) []DocumentBlock {
	out := make([]DocumentBlock, 0, len(oursBlocks)+len(theirsBlocks))
	seen := make(map[string]struct{})

	appendChosen := func(id string) {
		if _, ok := seen[id]; ok {
			return
		}
		d := decisions[id]
		switch d.kind {
		case decisionOmit:
			seen[id] = struct{}{}
			return
		case decisionOurs, decisionConflict:
			if b := oursMap[id]; b != nil {
				out = append(out, *b)
				seen[id] = struct{}{}
			} else if d.kind == decisionConflict {
				// 冲突且我方已删：暂不放入，等用户选对方
				seen[id] = struct{}{}
			}
		case decisionTheirs:
			if b := theirsMap[id]; b != nil {
				out = append(out, *b)
				seen[id] = struct{}{}
			}
		}
	}

	for _, b := range oursBlocks {
		if b.ID == "" {
			continue
		}
		appendChosen(b.ID)
	}

	// 对方有、我方顺序中未出现的块（多为对方新增）
	for _, b := range theirsBlocks {
		if b.ID == "" {
			continue
		}
		if _, ok := seen[b.ID]; ok {
			continue
		}
		appendChosen(b.ID)
	}

	// 规范化 order
	for i := range out {
		out[i].Order = i + 1
	}
	return out
}

func blocksEqual(a, b *DocumentBlock) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return len(compareBlock(a, b)) == 0
}

func parseDocumentContent(raw map[string]interface{}) (*DocumentContent, error) {
	bytes, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}
	var doc DocumentContent
	if err := json.Unmarshal(bytes, &doc); err != nil {
		return nil, err
	}
	return &doc, nil
}

// mergeDocumentShell 合并非 blocks 字段：相对 base，我方改了用我方，否则用对方。
func mergeDocumentShell(baseRaw, oursRaw, theirsRaw map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(oursRaw)+len(theirsRaw))
	keys := make(map[string]struct{})
	for k := range baseRaw {
		keys[k] = struct{}{}
	}
	for k := range oursRaw {
		keys[k] = struct{}{}
	}
	for k := range theirsRaw {
		keys[k] = struct{}{}
	}
	for k := range keys {
		if k == "blocks" || k == "seals" {
			continue
		}
		bv, hasB := baseRaw[k]
		ov, hasO := oursRaw[k]
		tv, hasT := theirsRaw[k]
		switch {
		case hasO && (!hasB || !jsonEqual(bv, ov)):
			out[k] = deepCloneJSON(ov)
		case hasT:
			out[k] = deepCloneJSON(tv)
		case hasO:
			out[k] = deepCloneJSON(ov)
		case hasB:
			out[k] = deepCloneJSON(bv)
		}
	}
	return out
}

// mergeSealsByID 三方合并电子章：按 id 并集；同 id 优先采纳相对 base 有改动的一方。
func mergeSealsByID(baseRaw, oursRaw, theirsRaw interface{}) []interface{} {
	baseMap := sealMapFromRaw(baseRaw)
	oursMap := sealMapFromRaw(oursRaw)
	theirsMap := sealMapFromRaw(theirsRaw)

	ids := make(map[string]struct{})
	for id := range baseMap {
		ids[id] = struct{}{}
	}
	for id := range oursMap {
		ids[id] = struct{}{}
	}
	for id := range theirsMap {
		ids[id] = struct{}{}
	}

	out := make([]interface{}, 0, len(ids))
	ordered := make([]string, 0, len(ids))
	for id := range ids {
		ordered = append(ordered, id)
	}
	sort.Strings(ordered)

	for _, id := range ordered {
		b := baseMap[id]
		o := oursMap[id]
		t := theirsMap[id]
		switch {
		case o != nil && t != nil:
			if jsonEqual(o, t) {
				out = append(out, deepCloneJSON(o))
				continue
			}
			oChanged := b == nil || !jsonEqual(b, o)
			tChanged := b == nil || !jsonEqual(b, t)
			if oChanged {
				out = append(out, deepCloneJSON(o))
			} else if tChanged {
				out = append(out, deepCloneJSON(t))
			} else {
				out = append(out, deepCloneJSON(o))
			}
		case o != nil && t == nil:
			// 对方删除：若我方未改相对 base，则采纳删除；否则保留我方
			if b != nil && jsonEqual(b, o) {
				continue
			}
			out = append(out, deepCloneJSON(o))
		case o == nil && t != nil:
			if b != nil && jsonEqual(b, t) {
				continue
			}
			out = append(out, deepCloneJSON(t))
		}
	}
	return out
}

func sealMapFromRaw(raw interface{}) map[string]interface{} {
	list, ok := raw.([]interface{})
	if !ok {
		return map[string]interface{}{}
	}
	m := make(map[string]interface{}, len(list))
	for _, item := range list {
		obj, ok := item.(map[string]interface{})
		if !ok || obj == nil {
			continue
		}
		id, _ := obj["id"].(string)
		if id == "" {
			continue
		}
		m[id] = obj
	}
	return m
}

func blocksToMaps(blocks []DocumentBlock) []interface{} {
	out := make([]interface{}, 0, len(blocks))
	for i := range blocks {
		raw, err := json.Marshal(blocks[i])
		if err != nil {
			continue
		}
		var m map[string]interface{}
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}
		out = append(out, m)
	}
	return out
}

func deepCloneJSON(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return v
	}
	var out interface{}
	if err := json.Unmarshal(b, &out); err != nil {
		return v
	}
	return out
}

// ApplyConflictResolutions 按用户选择把冲突块写回合并稿。
// choices: block_id -> "ours" | "theirs"
func ApplyConflictResolutions(
	merged map[string]interface{},
	conflicts []BlockConflict,
	choices map[string]string,
) (map[string]interface{}, error) {
	if merged == nil {
		return nil, fmt.Errorf("merged document is nil")
	}
	outBytes, err := json.Marshal(merged)
	if err != nil {
		return nil, err
	}
	var out map[string]interface{}
	if err := json.Unmarshal(outBytes, &out); err != nil {
		return nil, err
	}

	doc, err := parseDocumentContent(out)
	if err != nil {
		return nil, err
	}
	blockMap := indexBlocks(doc.Blocks)

	for _, c := range conflicts {
		side := choices[c.BlockID]
		if side == "" {
			side = "ours"
		}
		var chosen *DocumentBlock
		switch side {
		case "theirs":
			if !c.TheirsPresent {
				delete(blockMap, c.BlockID)
				continue
			}
			var b DocumentBlock
			if err := json.Unmarshal(c.TheirsBlock, &b); err != nil {
				return nil, err
			}
			chosen = &b
		default:
			if !c.OursPresent {
				delete(blockMap, c.BlockID)
				continue
			}
			var b DocumentBlock
			if err := json.Unmarshal(c.OursBlock, &b); err != nil {
				return nil, err
			}
			chosen = &b
		}
		blockMap[c.BlockID] = chosen
	}

	// 重建 blocks：尽量保持原 merged 顺序，再补缺失
	ordered := make([]DocumentBlock, 0, len(blockMap))
	seen := make(map[string]struct{})
	for _, b := range doc.Blocks {
		nb, ok := blockMap[b.ID]
		if !ok {
			continue
		}
		ordered = append(ordered, *nb)
		seen[b.ID] = struct{}{}
	}
	for id, b := range blockMap {
		if _, ok := seen[id]; ok {
			continue
		}
		ordered = append(ordered, *b)
	}
	for i := range ordered {
		ordered[i].Order = i + 1
	}
	out["blocks"] = blocksToMaps(ordered)
	return out, nil
}
