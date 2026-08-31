package documentdiff

import "testing"

func boolPtr(v bool) *bool       { return &v }
func floatPtr(v float64) *float64 { return &v }
func strPtr(v string) *string    { return &v }

func TestCompareAddDeleteModifyText(t *testing.T) {
	old := &DocumentContent{Blocks: []DocumentBlock{
		{ID: "b1", Type: "paragraph", Text: "甲方", Order: 0},
		{ID: "b2", Type: "paragraph", Text: "乙方", Order: 1},
	}}
	newDoc := &DocumentContent{Blocks: []DocumentBlock{
		{ID: "b1", Type: "paragraph", Text: "甲方（修订）", Order: 0},
		{ID: "b3", Type: "paragraph", Text: "新增段", Order: 1},
	}}

	records := Compare(old, newDoc)
	if len(records) != 3 {
		t.Fatalf("expected 3 records, got %d: %+v", len(records), records)
	}

	types := map[int8]int{}
	for _, r := range records {
		types[r.ChangeType]++
	}
	if types[0] != 1 || types[1] != 1 || types[2] != 1 {
		t.Fatalf("unexpected change types: %+v", types)
	}
}

func TestCompareStyleBlock(t *testing.T) {
	old := &DocumentContent{Blocks: []DocumentBlock{
		{ID: "b1", Type: "paragraph", Text: "同文", Style: &BlockStyle{Bold: boolPtr(true)}},
	}}
	newDoc := &DocumentContent{Blocks: []DocumentBlock{
		{ID: "b1", Type: "paragraph", Text: "同文", Style: &BlockStyle{Bold: boolPtr(false)}},
	}}

	records := Compare(old, newDoc)
	if len(records) != 1 {
		for i, r := range records {
			t.Logf("record %d: type=%d subtype=%s reason=%s", i, r.ChangeType, r.Subtype, r.ChangeReason)
		}
		t.Fatalf("expected 1 style record, got %d", len(records))
	}
	if records[0].Subtype != "style_block" {
		t.Fatalf("expected style_block, got %s", records[0].Subtype)
	}
	if records[0].ChangeReason == "" {
		t.Fatal("expected non-empty change reason")
	}
}

func TestCompareStyleRun(t *testing.T) {
	old := &DocumentContent{Blocks: []DocumentBlock{
		{
			ID: "b1", Type: "paragraph", Text: "AB",
			Runs: []DocumentRun{
				{Text: "A", Style: &BlockStyle{}},
				{Text: "B", Style: &BlockStyle{Underline: boolPtr(true)}},
			},
		},
	}}
	newDoc := &DocumentContent{Blocks: []DocumentBlock{
		{
			ID: "b1", Type: "paragraph", Text: "AB",
			Runs: []DocumentRun{
				{Text: "A", Style: &BlockStyle{}},
				{Text: "B", Style: &BlockStyle{Underline: boolPtr(false)}},
			},
		},
	}}

	records := Compare(old, newDoc)
	if len(records) != 1 {
		t.Fatalf("expected 1 run style record, got %d: %+v", len(records), records)
	}
	if records[0].Subtype != "style_run" {
		t.Fatalf("expected style_run, got %s", records[0].Subtype)
	}
}

func TestCompareNoChange(t *testing.T) {
	doc := &DocumentContent{Blocks: []DocumentBlock{
		{ID: "b1", Type: "paragraph", Text: "不变"},
	}}
	records := Compare(doc, doc)
	if len(records) != 0 {
		t.Fatalf("expected 0 records, got %d", len(records))
	}
}

func TestCompareJSON(t *testing.T) {
	oldJSON := `{"blocks":[{"id":"b1","type":"paragraph","text":"旧"}]}`
	newDoc := map[string]interface{}{
		"blocks": []map[string]interface{}{
			{"id": "b1", "type": "paragraph", "text": "新"},
		},
	}
	records, err := CompareJSON(oldJSON, newDoc)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 1 || records[0].Subtype != "text" {
		t.Fatalf("unexpected records: %+v", records)
	}
}

func TestCompareFontSizeStyle(t *testing.T) {
	old := &DocumentContent{Blocks: []DocumentBlock{
		{ID: "b1", Type: "paragraph", Text: "x", Style: &BlockStyle{FontSize: floatPtr(10.5)}},
	}}
	newDoc := &DocumentContent{Blocks: []DocumentBlock{
		{ID: "b1", Type: "paragraph", Text: "x", Style: &BlockStyle{FontSize: floatPtr(12)}},
	}}
	records := Compare(old, newDoc)
	if len(records) != 1 {
		t.Fatalf("expected 1 record, got %d", len(records))
	}
	if !contains(records[0].ChangeReason, "字号") {
		t.Fatalf("expected font size in reason: %s", records[0].ChangeReason)
	}
}

func contains(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && stringContains(s, sub))
}

func stringContains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func TestCompareTable(t *testing.T) {
	old := &DocumentContent{Blocks: []DocumentBlock{
		{ID: "t1", Type: "table", Rows: [][]string{{"a"}}},
	}}
	newDoc := &DocumentContent{Blocks: []DocumentBlock{
		{ID: "t1", Type: "table", Rows: [][]string{{"b"}}},
	}}
	records := Compare(old, newDoc)
	if len(records) != 1 || records[0].Subtype != "table" {
		t.Fatalf("unexpected: %+v", records)
	}
}
