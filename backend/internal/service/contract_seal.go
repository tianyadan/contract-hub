package service

import (
	"context"
	"fmt"
	"path"
	"strconv"
	"strings"
	"time"
)

// ContractSealUploadResult 合同级电子章上传结果（写入 document_content.seals.oss_key）。
type ContractSealUploadResult struct {
	OssKey   string `json:"oss_key"`
	MimeType string `json:"mime_type"`
}

// contractSealKeyPrefix 合同印章对象键前缀。
func contractSealKeyPrefix(contractID int64) string {
	return fmt.Sprintf("contracts/%d/seals/", contractID)
}

// validateContractSealKey 校验 oss_key 是否属于本合同印章目录。
func validateContractSealKey(contractID int64, ossKey string) error {
	ossKey = strings.TrimSpace(ossKey)
	prefix := contractSealKeyPrefix(contractID)
	if ossKey == "" || !strings.HasPrefix(ossKey, prefix) {
		return fmt.Errorf("%w: 无效的印章资源", ErrInvalidInput)
	}
	// 禁止路径穿越
	if strings.Contains(ossKey, "..") || strings.Contains(ossKey, "\\") {
		return fmt.Errorf("%w: 无效的印章资源", ErrInvalidInput)
	}
	base := path.Base(ossKey)
	if base == "" || base == "." || base == "/" {
		return fmt.Errorf("%w: 无效的印章资源", ErrInvalidInput)
	}
	return nil
}

// UploadContractSeal 内部用户上传合同级电子章图（双方可经代理读取）。
func (s *ContractService) UploadContractSeal(
	ctx context.Context,
	contractID, userID int64,
	data []byte,
	mimeType string,
) (*ContractSealUploadResult, error) {
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return nil, err
	}
	if detail == nil {
		return nil, ErrContractNotFound
	}
	if detail.Contract.Status >= 3 && detail.Contract.Status != 5 {
		return nil, ErrContractLocked
	}
	return s.uploadContractSealBytes(ctx, contractID, data, mimeType)
}

// StreamContractSeal 内部用户读取合同级电子章图。
func (s *ContractService) StreamContractSeal(
	ctx context.Context,
	contractID, userID int64,
	ossKey string,
) (data []byte, mimeType string, err error) {
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return nil, "", err
	}
	if detail == nil {
		return nil, "", ErrContractNotFound
	}
	if err := validateContractSealKey(contractID, ossKey); err != nil {
		return nil, "", err
	}
	return s.downloadContractSealBytes(ctx, ossKey)
}

func (s *ContractService) uploadContractSealBytes(
	ctx context.Context,
	contractID int64,
	data []byte,
	mimeType string,
) (*ContractSealUploadResult, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("%w: 请上传印章图片", ErrInvalidInput)
	}
	if len(data) > maxSealFileBytes {
		return nil, fmt.Errorf("%w: 印章图片不能超过 2MB", ErrInvalidInput)
	}
	mimeType = strings.ToLower(strings.TrimSpace(mimeType))
	if mimeType == "image/jpg" {
		mimeType = "image/jpeg"
	}
	if !isAllowedSealMime(mimeType) {
		return nil, fmt.Errorf("%w: 仅支持 PNG / JPEG / WebP", ErrInvalidInput)
	}
	ext := mimeToExt(mimeType)
	objectKey := fmt.Sprintf("%s%d%s", contractSealKeyPrefix(contractID), time.Now().UnixNano(), ext)
	if _, err := s.oss.UploadBytes(ctx, objectKey, data, mimeType); err != nil {
		return nil, err
	}
	return &ContractSealUploadResult{OssKey: objectKey, MimeType: mimeType}, nil
}

func (s *ContractService) downloadContractSealBytes(ctx context.Context, ossKey string) ([]byte, string, error) {
	data, err := s.oss.Download(ctx, ossKey)
	if err != nil {
		return nil, "", err
	}
	mime := "image/png"
	switch strings.ToLower(path.Ext(ossKey)) {
	case ".jpg", ".jpeg":
		mime = "image/jpeg"
	case ".webp":
		mime = "image/webp"
	}
	return data, mime, nil
}

// parseContractIDFromSealKey 从印章 key 解析合同 ID（分享侧二次校验用）。
func parseContractIDFromSealKey(ossKey string) (int64, bool) {
	// contracts/{id}/seals/...
	parts := strings.Split(ossKey, "/")
	if len(parts) < 4 || parts[0] != "contracts" || parts[2] != "seals" {
		return 0, false
	}
	id, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}
