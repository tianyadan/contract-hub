package service

import (
	"context"
	"errors"

	"github.com/lshc/contract-hub/backend/internal/model"
)

// 双方确认相关错误。
var (
	ErrAlreadyConfirmedByUser = errors.New("您已确认过当前版本，请勿重复操作")
	ErrPdfRequiredForFinalize = errors.New("双方均已确认，请提交终稿 PDF 完成锁定")
)

// ConfirmOutcome 确认操作结果。
type ConfirmOutcome struct {
	Status         string   `json:"status"` // pending | completed
	Message        string   `json:"message"`
	PendingParties []string `json:"pending_parties,omitempty"`
}

// ProcessConfirmation 处理确认：未满足双方确认时仅记录；满足时归档 PDF 并锁定合同。
func (s *ContractService) ProcessConfirmation(
	ctx context.Context,
	contractID, versionID int64,
	confirmation *model.ContractConfirmation,
	input ConfirmPdfInput,
) (*ConfirmOutcome, error) {
	detail, err := s.contracts.GetDetailByContractID(ctx, contractID)
	if err != nil {
		return nil, err
	}
	if detail == nil {
		return nil, ErrContractNotFound
	}
	if detail.Contract.Status == 3 || detail.Contract.Status == 4 {
		return nil, ErrAlreadyConfirmed
	}

	existing, err := s.shares.ListConfirmationsForVersion(ctx, contractID, versionID)
	if err != nil {
		return nil, err
	}
	if hasConfirmedVersion(existing, confirmation) {
		return nil, ErrAlreadyConfirmedByUser
	}

	requiresDual, err := s.shares.HasExternalCollaborators(ctx, contractID)
	if err != nil {
		return nil, err
	}

	willComplete := willCompleteAfterConfirm(existing, confirmation, requiresDual)
	if !willComplete {
		if err := s.shares.CreateConfirmation(ctx, confirmation); err != nil {
			return nil, err
		}
		pending := pendingPartiesAfterConfirm(existing, confirmation, requiresDual)
		return &ConfirmOutcome{
			Status:         "pending",
			Message:        "您已确认当前版本，等待对方确认后可生成终稿并锁定合同",
			PendingParties: pending,
		}, nil
	}

	if len(input.PdfData) == 0 {
		return nil, ErrPdfRequiredForFinalize
	}
	if err := s.FinalizeConfirmWithPdfArchive(ctx, contractID, versionID, input, confirmation); err != nil {
		return nil, err
	}
	return &ConfirmOutcome{
		Status:  "completed",
		Message: "双方已确认，终稿 PDF 已归档，合同已锁定",
	}, nil
}

// hasConfirmedVersion 判断当前用户/协作者是否已确认该版本。
func hasConfirmedVersion(existing []model.ContractConfirmation, next *model.ContractConfirmation) bool {
	for _, c := range existing {
		if c.VersionID != next.VersionID || c.ConfirmStatus != 1 {
			continue
		}
		if next.ConfirmerType == 0 && c.ConfirmerType == 0 &&
			next.UserID != nil && c.UserID != nil && *next.UserID == *c.UserID {
			return true
		}
		if next.ConfirmerType == 1 && c.ConfirmerType == 1 &&
			next.CollaboratorID != nil && c.CollaboratorID != nil &&
			*next.CollaboratorID == *c.CollaboratorID {
			return true
		}
	}
	return false
}

// willCompleteAfterConfirm 判断本次确认后是否满足终局条件。
func willCompleteAfterConfirm(
	existing []model.ContractConfirmation,
	next *model.ContractConfirmation,
	requiresDual bool,
) bool {
	if !requiresDual {
		return true
	}
	hasInternal, hasExternal := confirmationCoverage(existing, next.VersionID)
	if next.ConfirmerType == 0 {
		hasInternal = true
	} else {
		hasExternal = true
	}
	return hasInternal && hasExternal
}

// pendingPartiesAfterConfirm 返回仍待确认的一方描述。
func pendingPartiesAfterConfirm(
	existing []model.ContractConfirmation,
	next *model.ContractConfirmation,
	requiresDual bool,
) []string {
	if !requiresDual {
		return nil
	}
	hasInternal, hasExternal := confirmationCoverage(existing, next.VersionID)
	if next.ConfirmerType == 0 {
		hasInternal = true
	} else {
		hasExternal = true
	}
	pending := make([]string, 0, 2)
	if !hasInternal {
		pending = append(pending, "内部用户（合同发起方）")
	}
	if !hasExternal {
		pending = append(pending, "外部协作者")
	}
	return pending
}

// confirmationCoverage 统计当前版本内外部确认情况。
func confirmationCoverage(existing []model.ContractConfirmation, versionID int64) (hasInternal, hasExternal bool) {
	for _, c := range existing {
		if c.VersionID != versionID || c.ConfirmStatus != 1 {
			continue
		}
		switch c.ConfirmerType {
		case 0:
			hasInternal = true
		case 1:
			hasExternal = true
		}
	}
	return hasInternal, hasExternal
}

// ConfirmProgress 当前版本确认进度（供前端展示）。
type ConfirmProgress struct {
	RequiresDualConfirm bool     `json:"requires_dual_confirm"`
	HasInternalConfirm  bool     `json:"has_internal_confirm"`
	HasExternalConfirm  bool     `json:"has_external_confirm"`
	PendingParties      []string `json:"pending_parties"`
	WillFinalizeOnNext  bool     `json:"will_finalize_on_next"`
}

// GetConfirmProgress 查询合同当前版本的双方确认进度。
func (s *ContractService) GetConfirmProgress(ctx context.Context, contractID, versionID int64) (*ConfirmProgress, error) {
	requiresDual, err := s.shares.HasExternalCollaborators(ctx, contractID)
	if err != nil {
		return nil, err
	}
	existing, err := s.shares.ListConfirmationsForVersion(ctx, contractID, versionID)
	if err != nil {
		return nil, err
	}
	hasInternal, hasExternal := confirmationCoverage(existing, versionID)
	pending := make([]string, 0, 2)
	if requiresDual {
		if !hasInternal {
			pending = append(pending, "内部用户（合同发起方）")
		}
		if !hasExternal {
			pending = append(pending, "外部协作者")
		}
	}
	willFinalizeOnNext := requiresDual && ((hasInternal && !hasExternal) || (!hasInternal && hasExternal))

	return &ConfirmProgress{
		RequiresDualConfirm: requiresDual,
		HasInternalConfirm:  hasInternal,
		HasExternalConfirm:  hasExternal,
		PendingParties:      pending,
		WillFinalizeOnNext:  willFinalizeOnNext,
	}, nil
}
