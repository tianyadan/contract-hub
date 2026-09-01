package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/lshc/contract-hub/backend/internal/model"
)

// MaxExportPdfSize PDF 归档文件大小上限（10MB，与前端压缩目标一致）。
const MaxExportPdfSize = 10 << 20

// 验真与 PDF 归档相关错误。
var (
	ErrInvalidPdfInput    = errors.New("PDF 参数不合法")
	ErrInvalidPdfHash     = errors.New("PDF 文件哈希校验失败")
	ErrVerifyCodeMismatch = errors.New("验真码与当前版本不匹配")
	ErrVerifyNotFound     = errors.New("验真码不存在")
	ErrNoPdfArchived      = errors.New("该版本暂无 PDF 归档")
	ErrAlreadyConfirmed   = errors.New("合同已确认，请勿重复操作")
	ErrExportPdfTooLarge  = errors.New("PDF 文件大小不能超过 10MB")
)

// ExportPdfInfo PDF 归档元数据。
type ExportPdfInfo struct {
	VersionID  int64     `json:"version_id"`
	VersionNo  int       `json:"version_no"`
	PageCount  int       `json:"page_count"`
	Hash       string    `json:"hash"`
	VerifyCode string    `json:"verify_code,omitempty"`
	ExportedAt time.Time `json:"exported_at"`
	PdfURL     string    `json:"pdf_url"`
	ObjectKey  string    `json:"object_key"`
}

// PrepareFinalExportResult 确认前预分配验真码。
type PrepareFinalExportResult struct {
	VerifyCode      string `json:"verify_code"`
	PublicWebOrigin string `json:"public_web_origin"`
}

// VerifyResult 公开验真接口返回。
type VerifyResult struct {
	Valid        bool     `json:"valid"`
	Reason       string   `json:"reason"`
	ContractNo   string   `json:"contract_no,omitempty"`
	ContractName string   `json:"contract_name,omitempty"`
	VersionNo    int       `json:"version_no,omitempty"`
	Status       int8      `json:"status,omitempty"`
	StatusText   string   `json:"status_text,omitempty"`
	ConfirmedAt  *time.Time `json:"confirmed_at,omitempty"`
	Confirmers   []string `json:"confirmers,omitempty"`
	PageCount    int      `json:"page_count,omitempty"`
	ScannedPage  int      `json:"scanned_page,omitempty"`
	PdfURL       string   `json:"pdf_url,omitempty"`
	PdfHash      string   `json:"pdf_hash,omitempty"`
	ExportedAt   *time.Time `json:"exported_at,omitempty"`
}

// ConfirmPdfInput 确认时携带的 PDF 归档信息。
type ConfirmPdfInput struct {
	PdfData    []byte
	Hash       string
	PageCount  int
	VerifyCode string
}

// PrepareFinalExport 为确认流程预分配验真码（内部用户）。
func (s *ContractService) PrepareFinalExport(ctx context.Context, contractID, userID int64) (*PrepareFinalExportResult, error) {
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return nil, err
	}
	if detail == nil || detail.Version == nil {
		return nil, ErrContractNotFound
	}
	return s.prepareFinalExportForVersion(ctx, detail.Contract, detail.Version)
}

// PrepareFinalExportByContract 分享场景预分配验真码（调用方需先校验分享权限）。
func (s *ContractService) PrepareFinalExportByContract(ctx context.Context, contractID int64) (*PrepareFinalExportResult, error) {
	detail, err := s.contracts.GetDetailByContractID(ctx, contractID)
	if err != nil {
		return nil, err
	}
	if detail == nil || detail.Version == nil {
		return nil, ErrContractNotFound
	}
	return s.prepareFinalExportForVersion(ctx, detail.Contract, detail.Version)
}

// prepareFinalExportForVersion 校验合同状态并为当前版本分配验真码。
func (s *ContractService) prepareFinalExportForVersion(
	ctx context.Context,
	contract model.Contract,
	version *model.ContractVersion,
) (*PrepareFinalExportResult, error) {
	if contract.Status == 3 || contract.Status == 4 {
		return nil, ErrAlreadyConfirmed
	}
	if strings.TrimSpace(version.DocumentContent) == "" {
		return nil, errors.New("合同文档为空，无法确认")
	}
	code := strings.TrimSpace(version.VerifyCode)
	if code == "" {
		var err error
		code, err = s.allocateVerifyCode(ctx, version.ID)
		if err != nil {
			return nil, err
		}
	}
	return &PrepareFinalExportResult{
		VerifyCode:      code,
		PublicWebOrigin: s.publicWebOrigin,
	}, nil
}

// allocateVerifyCode 生成全局唯一验真码并写入版本。
func (s *ContractService) allocateVerifyCode(ctx context.Context, versionID int64) (string, error) {
	for i := 0; i < 8; i++ {
		code, err := generateVerifyCode(20)
		if err != nil {
			return "", err
		}
		if err := s.contracts.SetVersionVerifyCode(ctx, versionID, code); err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
				continue
			}
			return "", err
		}
		return code, nil
	}
	return "", errors.New("生成验真码失败，请重试")
}

// UploadExportPdf 上传草稿或终稿 PDF 到 OSS 并更新版本字段（不触发确认）。
func (s *ContractService) UploadExportPdf(
	ctx context.Context,
	contractID, userID int64,
	pdfData []byte,
	hash string,
	pageCount int,
	verifyCode string,
	draft bool,
) (*ExportPdfInfo, error) {
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return nil, err
	}
	if detail == nil || detail.Version == nil {
		return nil, ErrContractNotFound
	}
	return s.uploadExportPdfForVersion(ctx, contractID, detail.Version, pdfData, hash, pageCount, verifyCode, draft)
}

// UploadExportPdfByContract 分享场景上传 PDF（调用方需先校验分享权限）。
func (s *ContractService) UploadExportPdfByContract(
	ctx context.Context,
	contractID int64,
	pdfData []byte,
	hash string,
	pageCount int,
	verifyCode string,
	draft bool,
) (*ExportPdfInfo, error) {
	detail, err := s.contracts.GetDetailByContractID(ctx, contractID)
	if err != nil {
		return nil, err
	}
	if detail == nil || detail.Version == nil {
		return nil, ErrContractNotFound
	}
	return s.uploadExportPdfForVersion(ctx, contractID, detail.Version, pdfData, hash, pageCount, verifyCode, draft)
}

// uploadExportPdfForVersion 校验 PDF 并写入 OSS。
func (s *ContractService) uploadExportPdfForVersion(
	ctx context.Context,
	contractID int64,
	version *model.ContractVersion,
	pdfData []byte,
	hash string,
	pageCount int,
	verifyCode string,
	draft bool,
) (*ExportPdfInfo, error) {
	if err := validatePdfUpload(pdfData, hash, pageCount); err != nil {
		return nil, err
	}
	objectKey := pdfObjectKey(contractID, version.VersionNo, draft)
	if _, err := s.oss.UploadBytes(ctx, objectKey, pdfData, "application/pdf"); err != nil {
		return nil, err
	}
	exportedAt := time.Now()
	storedVerifyCode := ""
	if !draft {
		storedVerifyCode = strings.TrimSpace(verifyCode)
	}
	if err := s.contracts.UpdateVersionExportPdf(ctx, version.ID, objectKey, hash, pageCount, exportedAt, storedVerifyCode); err != nil {
		return nil, err
	}
	signedURL, err := s.oss.SignURL(objectKey, 900)
	if err != nil {
		signedURL = s.oss.PublicURL(objectKey)
	}
	return &ExportPdfInfo{
		VersionID:  version.ID,
		VersionNo:  version.VersionNo,
		PageCount:  pageCount,
		Hash:       hash,
		VerifyCode: storedVerifyCode,
		ExportedAt: exportedAt,
		PdfURL:     signedURL,
		ObjectKey:  objectKey,
	}, nil
}

// GetExportPdf 获取当前版本 PDF 归档信息与签名下载 URL。
func (s *ContractService) GetExportPdf(ctx context.Context, contractID, userID int64) (*ExportPdfInfo, error) {
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return nil, err
	}
	if detail == nil || detail.Version == nil {
		return nil, ErrContractNotFound
	}
	return s.exportPdfInfoFromVersion(detail.Version)
}

// GetVersionExportPdf 获取指定历史版本 PDF 归档信息。
func (s *ContractService) GetVersionExportPdf(ctx context.Context, contractID, versionID, userID int64) (*ExportPdfInfo, error) {
	if _, err := s.contracts.GetDetailByOwner(ctx, contractID, userID); err != nil {
		return nil, err
	}
	version, err := s.contracts.GetVersionByID(ctx, contractID, versionID)
	if err != nil {
		return nil, err
	}
	if version == nil {
		return nil, ErrVersionNotFound
	}
	return s.exportPdfInfoFromVersion(version)
}

// exportPdfInfoFromVersion 组装 PDF 归档元数据。
func (s *ContractService) exportPdfInfoFromVersion(version *model.ContractVersion) (*ExportPdfInfo, error) {
	if version.ExportPdfPageCount <= 0 || version.ExportPdfOssKey == "" {
		return nil, ErrNoPdfArchived
	}
	signedURL, err := s.oss.SignURL(version.ExportPdfOssKey, 900)
	if err != nil {
		signedURL = s.oss.PublicURL(version.ExportPdfOssKey)
	}
	exportedAt := time.Time{}
	if version.PdfExportedAt != nil {
		exportedAt = *version.PdfExportedAt
	}
	return &ExportPdfInfo{
		VersionID:  version.ID,
		VersionNo:  version.VersionNo,
		PageCount:  version.ExportPdfPageCount,
		Hash:       version.ExportPdfHash,
		VerifyCode: version.VerifyCode,
		ExportedAt: exportedAt,
		PdfURL:     signedURL,
		ObjectKey:  version.ExportPdfOssKey,
	}, nil
}

// FinalizeConfirmWithPdfArchive 上传终稿 PDF 并原子完成确认锁定。
func (s *ContractService) FinalizeConfirmWithPdfArchive(
	ctx context.Context,
	contractID, versionID int64,
	input ConfirmPdfInput,
	confirmation *model.ContractConfirmation,
) error {
	if err := validatePdfUpload(input.PdfData, input.Hash, input.PageCount); err != nil {
		return err
	}
	version, err := s.contracts.GetVersionByID(ctx, contractID, versionID)
	if err != nil {
		return err
	}
	if version == nil {
		return ErrVersionNotFound
	}
	expectedCode := strings.TrimSpace(version.VerifyCode)
	if expectedCode == "" || expectedCode != strings.TrimSpace(input.VerifyCode) {
		return ErrVerifyCodeMismatch
	}

	objectKey := pdfObjectKey(contractID, version.VersionNo, false)
	if _, err := s.oss.UploadBytes(ctx, objectKey, input.PdfData, "application/pdf"); err != nil {
		return err
	}
	exportedAt := time.Now()
	return s.contracts.FinalizeConfirmWithPdf(
		ctx,
		versionID,
		contractID,
		objectKey,
		input.Hash,
		input.PageCount,
		exportedAt,
		expectedCode,
		confirmation,
	)
}

// VerifyByCode 公开验真：根据验真码返回合同元数据与 PDF 签名 URL。
func (s *ContractService) VerifyByCode(ctx context.Context, verifyCode string, scannedPage int) (*VerifyResult, error) {
	code := strings.TrimSpace(verifyCode)
	if code == "" {
		return &VerifyResult{Valid: false, Reason: "验真码不能为空"}, nil
	}
	row, err := s.contracts.GetVersionByVerifyCode(ctx, code)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return &VerifyResult{Valid: false, Reason: "验真码不存在或已失效"}, nil
	}
	if row.ContractStatus != 3 && row.ContractStatus != 4 {
		return &VerifyResult{
			Valid:        false,
			Reason:       "合同尚未确认，无法验真",
			ContractNo:   row.ContractNo,
			ContractName: row.ContractName,
			VersionNo:    row.VersionNo,
			Status:       row.ContractStatus,
			StatusText:   contractStatusText(row.ContractStatus),
		}, nil
	}
	if row.ExportPdfOssKey == "" || row.ExportPdfPageCount <= 0 {
		return &VerifyResult{
			Valid:        false,
			Reason:       "暂无归档 PDF",
			ContractNo:   row.ContractNo,
			ContractName: row.ContractName,
			VersionNo:    row.VersionNo,
			Status:       row.ContractStatus,
			StatusText:   contractStatusText(row.ContractStatus),
		}, nil
	}

	confirmers := make([]string, 0)
	if s.shares != nil {
		items, listErr := s.shares.ListConfirmations(ctx, row.ContractID)
		if listErr == nil {
			for _, item := range items {
				if strings.TrimSpace(item.ConfirmerName) != "" {
					confirmers = append(confirmers, item.ConfirmerName)
				}
			}
		}
	}

	pdfURL, err := s.oss.SignURL(row.ExportPdfOssKey, 900)
	if err != nil {
		pdfURL = s.oss.PublicURL(row.ExportPdfOssKey)
	}

	return &VerifyResult{
		Valid:        true,
		ContractNo:   row.ContractNo,
		ContractName: row.ContractName,
		VersionNo:    row.VersionNo,
		Status:       row.ContractStatus,
		StatusText:   contractStatusText(row.ContractStatus),
		ConfirmedAt:  row.ConfirmedTime,
		Confirmers:   confirmers,
		PageCount:    row.ExportPdfPageCount,
		ScannedPage:  scannedPage,
		PdfURL:       pdfURL,
		PdfHash:      row.ExportPdfHash,
		ExportedAt:   row.PdfExportedAt,
	}, nil
}

// validatePdfUpload 校验 PDF 上传参数。
func validatePdfUpload(pdfData []byte, hash string, pageCount int) error {
	if len(pdfData) == 0 {
		return ErrInvalidPdfInput
	}
	if len(pdfData) > MaxExportPdfSize {
		return ErrExportPdfTooLarge
	}
	if pageCount <= 0 {
		return ErrInvalidPdfInput
	}
	if !matchFileHash(pdfData, hash) {
		return ErrInvalidPdfHash
	}
	return nil
}

// pdfObjectKey 生成 PDF 在 OSS 上的 object key。
func pdfObjectKey(contractID int64, versionNo int, draft bool) string {
	if draft {
		return fmt.Sprintf("contracts/%d/v%d/draft.pdf", contractID, versionNo)
	}
	return fmt.Sprintf("contracts/%d/v%d/final.pdf", contractID, versionNo)
}
