package service

import (
	"context"
	"fmt"
	"strings"
)

// UploadShareSeal 外部协作者上传合同级电子章（写入本合同 OSS，双方可见）。
func (s *ShareService) UploadShareSeal(
	ctx context.Context,
	token, name string,
	data []byte,
	mimeType string,
) (*ContractSealUploadResult, error) {
	share, contract, err := s.validateShare(ctx, token)
	if err != nil {
		return nil, err
	}
	if share.Permission != 1 {
		return nil, ErrSharePermissionDenied
	}
	if contract.Status >= 3 && contract.Status != 5 {
		return nil, ErrContractLocked
	}
	if _, err := s.getCollaborator(ctx, contract.ID, name); err != nil {
		return nil, err
	}
	return s.contractSvc.uploadContractSealBytes(ctx, contract.ID, data, mimeType)
}

// StreamShareSeal 外部分享链接读取合同级电子章图。
func (s *ShareService) StreamShareSeal(
	ctx context.Context,
	token string,
	ossKey string,
) (data []byte, mimeType string, err error) {
	_, contract, err := s.validateShare(ctx, token)
	if err != nil {
		return nil, "", err
	}
	ossKey = strings.TrimSpace(ossKey)
	if err := validateContractSealKey(contract.ID, ossKey); err != nil {
		return nil, "", err
	}
	if id, ok := parseContractIDFromSealKey(ossKey); !ok || id != contract.ID {
		return nil, "", fmt.Errorf("%w: 无效的印章资源", ErrInvalidInput)
	}
	return s.contractSvc.downloadContractSealBytes(ctx, ossKey)
}
