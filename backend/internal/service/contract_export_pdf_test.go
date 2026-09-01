package service

import (
	"context"
	"testing"
)

func TestVerifyByCodeRejectsEmptyCode(t *testing.T) {
	svc := NewContractService(nil, nil, nil, nil, nil, nil, "http://localhost:5173")
	result, err := svc.VerifyByCode(context.Background(), "", 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Valid {
		t.Fatal("expected invalid result for empty code")
	}
}

func TestValidatePdfUploadRejectsEmptyData(t *testing.T) {
	err := validatePdfUpload(nil, "abc", 1)
	if err != ErrInvalidPdfInput {
		t.Fatalf("expected ErrInvalidPdfInput, got %v", err)
	}
}

func TestMatchFileHash(t *testing.T) {
	data := []byte("hello pdf")
	hash := sha256Hex(data)
	if !matchFileHash(data, hash) {
		t.Fatal("expected hash to match")
	}
	if matchFileHash(data, "deadbeef") {
		t.Fatal("expected hash mismatch")
	}
}
