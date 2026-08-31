package service

import (
	"time"

	"github.com/lshc/contract-hub/backend/internal/documentdiff"
	"github.com/lshc/contract-hub/backend/internal/model"
)

// buildContractChangesFromDiff 将 diff 结果转为 contract_change 记录。
func buildContractChangesFromDiff(
	contractID, fromVersionID, toVersionID, operatorUserID int64,
	collaboratorID *int64,
	records []documentdiff.Record,
	now time.Time,
) []model.ContractChange {
	changes := make([]model.ContractChange, 0, len(records))
	for _, rec := range records {
		changes = append(changes, model.ContractChange{
			ID:             nextID(),
			ContractID:     contractID,
			FromVersionID:  fromVersionID,
			ToVersionID:    toVersionID,
			OperatorUserID: operatorUserID,
			CollaboratorID: collaboratorID,
			ChangeType:     rec.ChangeType,
			BlockID:        rec.BlockID,
			ClauseNo:       rec.ClauseNo,
			OldContent:     rec.OldContent,
			NewContent:     rec.NewContent,
			ChangeReason:   rec.ChangeReason,
			CreateTime:     now,
		})
	}
	return changes
}
