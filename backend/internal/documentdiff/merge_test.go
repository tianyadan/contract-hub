package documentdiff

import (
	"testing"
)

func TestThreeWayMerge_NonOverlapping(t *testing.T) {
	base := map[string]interface{}{
		"blocks": []interface{}{
			map[string]interface{}{"id": "a", "type": "paragraph", "text": "A", "order": 1},
			map[string]interface{}{"id": "b", "type": "paragraph", "text": "B", "order": 2},
		},
	}
	ours := map[string]interface{}{
		"blocks": []interface{}{
			map[string]interface{}{"id": "a", "type": "paragraph", "text": "A-ours", "order": 1},
			map[string]interface{}{"id": "b", "type": "paragraph", "text": "B", "order": 2},
		},
	}
	theirs := map[string]interface{}{
		"blocks": []interface{}{
			map[string]interface{}{"id": "a", "type": "paragraph", "text": "A", "order": 1},
			map[string]interface{}{"id": "b", "type": "paragraph", "text": "B-theirs", "order": 2},
		},
	}

	result, err := ThreeWayMergeMaps(base, ours, theirs)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Conflicts) != 0 {
		t.Fatalf("expected no conflicts, got %d", len(result.Conflicts))
	}
	doc, err := parseDocumentContent(result.Merged)
	if err != nil {
		t.Fatal(err)
	}
	m := indexBlocks(doc.Blocks)
	if m["a"].Text != "A-ours" {
		t.Fatalf("block a want A-ours got %q", m["a"].Text)
	}
	if m["b"].Text != "B-theirs" {
		t.Fatalf("block b want B-theirs got %q", m["b"].Text)
	}
}

func TestThreeWayMerge_SameBlockConflict(t *testing.T) {
	base := map[string]interface{}{
		"blocks": []interface{}{
			map[string]interface{}{"id": "a", "type": "paragraph", "text": "A", "order": 1},
		},
	}
	ours := map[string]interface{}{
		"blocks": []interface{}{
			map[string]interface{}{"id": "a", "type": "paragraph", "text": "A-ours", "order": 1},
		},
	}
	theirs := map[string]interface{}{
		"blocks": []interface{}{
			map[string]interface{}{"id": "a", "type": "paragraph", "text": "A-theirs", "order": 1},
		},
	}

	result, err := ThreeWayMergeMaps(base, ours, theirs)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Conflicts) != 1 {
		t.Fatalf("expected 1 conflict, got %d", len(result.Conflicts))
	}
	// 冲突默认保留 ours
	doc, _ := parseDocumentContent(result.Merged)
	if doc.Blocks[0].Text != "A-ours" {
		t.Fatalf("default merged should keep ours, got %q", doc.Blocks[0].Text)
	}

	resolved, err := ApplyConflictResolutions(result.Merged, result.Conflicts, map[string]string{
		"a": "theirs",
	})
	if err != nil {
		t.Fatal(err)
	}
	doc2, _ := parseDocumentContent(resolved)
	if doc2.Blocks[0].Text != "A-theirs" {
		t.Fatalf("want A-theirs after resolve, got %q", doc2.Blocks[0].Text)
	}
}
