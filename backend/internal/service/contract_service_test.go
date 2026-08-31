package service

import (
	"context"
	"errors"
	"testing"
)

func TestDeleteRejectsInvalidContractID(t *testing.T) {
	svc := NewContractService(nil, nil, nil, nil, nil)

	err := svc.Delete(context.Background(), 0, 1001, "owner", "127.0.0.1", "go-test")

	if !errors.Is(err, ErrInvalidContractInput) {
		t.Fatalf("expected ErrInvalidContractInput, got %v", err)
	}
}

func TestBatchDeleteRejectsEmptyContractIDs(t *testing.T) {
	svc := NewContractService(nil, nil, nil, nil, nil)

	err := svc.BatchDelete(context.Background(), BatchDeleteContractsInput{
		ContractIDs: []int64{},
		UserID:      1001,
		Username:    "owner",
		ClientIP:    "127.0.0.1",
		UserAgent:   "go-test",
	})

	if !errors.Is(err, ErrInvalidContractInput) {
		t.Fatalf("expected ErrInvalidContractInput, got %v", err)
	}
}

func TestBatchDeleteRejectsInvalidContractID(t *testing.T) {
	svc := NewContractService(nil, nil, nil, nil, nil)

	err := svc.BatchDelete(context.Background(), BatchDeleteContractsInput{
		ContractIDs: []int64{10001, -1},
		UserID:      1001,
		Username:    "owner",
		ClientIP:    "127.0.0.1",
		UserAgent:   "go-test",
	})

	if !errors.Is(err, ErrInvalidContractInput) {
		t.Fatalf("expected ErrInvalidContractInput, got %v", err)
	}
}
