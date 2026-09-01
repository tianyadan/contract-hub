package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/lshc/contract-hub/backend/internal/docengine"
	"github.com/lshc/contract-hub/backend/internal/documentdiff"
	"github.com/lshc/contract-hub/backend/internal/model"
	"github.com/lshc/contract-hub/backend/internal/oss"
	"github.com/lshc/contract-hub/backend/internal/repository"
	"github.com/lshc/contract-hub/backend/pkg/pagination"
)

// 分享模块业务错误。
var (
	ErrShareNotFound         = errors.New("分享链接不存在")
	ErrShareDisabled         = errors.New("分享链接已失效")
	ErrShareExpired          = errors.New("分享链接已过期")
	ErrShareMaxAccess        = errors.New("分享链接访问次数已达上限")
	ErrCollaboratorNotFound  = errors.New("协作者不存在，请先输入姓名加入")
	ErrSharePermissionDenied = errors.New("当前分享链接为只读，不允许编辑")
)

// ShareService 分享链接、外部协作者和确认业务逻辑。
type ShareService struct {
	shares      *repository.ShareRepository
	contracts   *repository.ContractRepository
	docEngine   *docengine.Client
	oss         *oss.Client
	contractSvc *ContractService
}

// NewShareService 创建分享服务。
func NewShareService(
	shares *repository.ShareRepository,
	contracts *repository.ContractRepository,
	docEngine *docengine.Client,
	ossClient *oss.Client,
	contractSvc *ContractService,
) *ShareService {
	return &ShareService{
		shares:      shares,
		contracts:   contracts,
		docEngine:   docEngine,
		oss:         ossClient,
		contractSvc: contractSvc,
	}
}

// CreateShareInput 创建分享链接入参。
type CreateShareInput struct {
	ContractID  int64
	UserID      int64
	Permission  int8 // 0只读 1可编辑
	ExpireHours int  // 0 表示不过期
}

// ShareInfoVO 分享概要返回。
type ShareInfoVO struct {
	ShareID        int64      `json:"share_id"`
	Token          string     `json:"token"`
	ContractID     int64      `json:"contract_id"`
	ContractName   string     `json:"contract_name"`
	ContractNo     string     `json:"contract_no"`
	Permission     int8       `json:"permission"`
	PermissionText string     `json:"permission_text"`
	Status         int8       `json:"status"`
	ExpireTime     *time.Time `json:"expire_time,omitempty"`
	CreateTime     time.Time  `json:"create_time"`
}

// ShareContractVO 外部协作者看到的合同内容。
type ShareContractVO struct {
	ContractID       int64                  `json:"contract_id"`
	ContractNo       string                 `json:"contract_no"`
	ContractName     string                 `json:"contract_name"`
	Status           int8                   `json:"status"`
	StatusText       string                 `json:"status_text"`
	CurrentVersionNo int                    `json:"current_version_no"`
	DocumentContent  map[string]interface{} `json:"document_content"`
	Permission       int8                   `json:"permission"`
}

// CollaboratorVO 协作者返回。
type CollaboratorVO struct {
	CollaboratorID int64  `json:"collaborator_id"`
	Name           string `json:"name"`
	Permission     int8   `json:"permission"`
}

// CreateShare 创建分享链接。
func (s *ShareService) CreateShare(ctx context.Context, input CreateShareInput) (*ShareInfoVO, error) {
	// 校验合同属于当前用户
	detail, err := s.contracts.GetDetailByOwner(ctx, input.ContractID, input.UserID)
	if err != nil {
		return nil, err
	}
	if detail == nil {
		return nil, ErrContractNotFound
	}

	token, err := generateShareToken()
	if err != nil {
		return nil, err
	}

	now := time.Now()
	share := &model.ContractShare{
		ID:            nextID(),
		ContractID:    input.ContractID,
		CreatorUserID: input.UserID,
		ShareToken:    token,
		Permission:    input.Permission,
		Status:        1,
		AccessCount:   0,
		CreateTime:    now,
		UpdateTime:    now,
	}
	if input.ExpireHours > 0 {
		t := now.Add(time.Duration(input.ExpireHours) * time.Hour)
		share.ExpireTime = &t
	}

	if err := s.shares.CreateShare(ctx, share); err != nil {
		return nil, err
	}

	// 分享后合同状态变为“已分享”
	if detail.Contract.Status == 0 {
		_ = s.contracts.UpdateContractStatus(ctx, input.ContractID, 1)
	}

	return &ShareInfoVO{
		ShareID:        share.ID,
		Token:          token,
		ContractID:     input.ContractID,
		ContractName:   detail.Contract.ContractName,
		ContractNo:     detail.Contract.ContractNo,
		Permission:     share.Permission,
		PermissionText: sharePermissionText(share.Permission),
		Status:         share.Status,
		ExpireTime:     share.ExpireTime,
		CreateTime:     now,
	}, nil
}

// GetShareInfo 根据 token 获取分享概要，并校验链接有效性。
func (s *ShareService) GetShareInfo(ctx context.Context, token string) (*ShareInfoVO, error) {
	share, contract, err := s.validateShare(ctx, token)
	if err != nil {
		return nil, err
	}

	return &ShareInfoVO{
		ShareID:        share.ID,
		Token:          share.ShareToken,
		ContractID:     contract.ID,
		ContractName:   contract.ContractName,
		ContractNo:     contract.ContractNo,
		Permission:     share.Permission,
		PermissionText: sharePermissionText(share.Permission),
		Status:         share.Status,
		ExpireTime:     share.ExpireTime,
		CreateTime:     share.CreateTime,
	}, nil
}

// Join 外部协作者输入姓名加入协作。
func (s *ShareService) Join(ctx context.Context, token, name string) (*CollaboratorVO, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrInvalidInput
	}

	share, contract, err := s.validateShare(ctx, token)
	if err != nil {
		return nil, err
	}

	// 查找已有协作者，没有则创建
	collaborator, err := s.shares.GetCollaboratorByContractAndName(ctx, contract.ID, name)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	if collaborator == nil {
		collaborator = &model.ContractCollaborator{
			ID:               nextID(),
			ContractID:       contract.ID,
			Name:             name,
			CollaboratorType: 1, // 外部客户
			Permission:       share.Permission,
			Status:           1,
			FirstAccessTime:  &now,
			LastAccessTime:   &now,
			CreateTime:       now,
			UpdateTime:       now,
		}
		if err := s.shares.CreateCollaborator(ctx, collaborator); err != nil {
			return nil, err
		}
	} else {
		if err := s.shares.UpdateCollaboratorAccess(ctx, collaborator.ID, now); err != nil {
			return nil, err
		}
	}

	return &CollaboratorVO{
		CollaboratorID: collaborator.ID,
		Name:           collaborator.Name,
		Permission:     collaborator.Permission,
	}, nil
}

// GetShareContract 外部协作者获取合同内容。
func (s *ShareService) GetShareContract(ctx context.Context, token, name string) (*ShareContractVO, error) {
	share, contract, err := s.validateShare(ctx, token)
	if err != nil {
		return nil, err
	}
	collaborator, err := s.getCollaborator(ctx, contract.ID, name)
	if err != nil {
		return nil, err
	}
	_ = collaborator

	// 获取当前版本内容
	var doc map[string]interface{}
	if contract.CurrentVersionID != nil {
		version, err := s.contracts.GetVersionByID(ctx, contract.ID, *contract.CurrentVersionID)
		if err != nil {
			return nil, err
		}
		if version != nil {
			doc, err = unmarshalDocument(version.DocumentContent)
			if err != nil {
				doc = map[string]interface{}{}
			}
		}
	}
	if doc == nil {
		doc = map[string]interface{}{}
	}

	return &ShareContractVO{
		ContractID:       contract.ID,
		ContractNo:       contract.ContractNo,
		ContractName:     contract.ContractName,
		Status:           contract.Status,
		StatusText:       contractStatusText(contract.Status),
		CurrentVersionNo: contract.CurrentVersionNo,
		DocumentContent:  doc,
		Permission:       share.Permission,
	}, nil
}

// ShareVersionList 外部协作者分页查看版本列表。
func (s *ShareService) ShareVersionList(ctx context.Context, token, name string, page, pageSize int) (*pagination.PageResult[VersionListItem], error) {
	_, contract, err := s.validateShare(ctx, token)
	if err != nil {
		return nil, err
	}
	if _, err := s.getCollaborator(ctx, contract.ID, name); err != nil {
		return nil, err
	}

	pageQuery := &pagination.Query{Page: page, PageSize: pageSize}
	pageQuery.Normalize()

	total, err := s.contracts.CountVersions(ctx, contract.ID)
	if err != nil {
		return nil, err
	}
	versions, err := s.contracts.ListVersions(ctx, contract.ID, pageQuery.Limit(), pageQuery.Offset())
	if err != nil {
		return nil, err
	}

	items := make([]VersionListItem, 0, len(versions))
	for i := range versions {
		v := &versions[i]
		items = append(items, VersionListItem{
			VersionID:     v.ID,
			VersionNo:     v.VersionNo,
			ChangeSummary: v.ChangeSummary,
			CreatedBy:     v.CreatedBy,
			CreatedByName: v.CreatedByName,
			CreateTime:    v.CreateTime,
		})
	}
	result := pagination.NewPageResult(items, total, pageQuery.Page, pageQuery.PageSize)
	return &result, nil
}

// ShareVersionDetail 外部协作者查看版本详情。
func (s *ShareService) ShareVersionDetail(ctx context.Context, token, name string, versionID int64) (*VersionDetailVO, error) {
	_, contract, err := s.validateShare(ctx, token)
	if err != nil {
		return nil, err
	}
	if _, err := s.getCollaborator(ctx, contract.ID, name); err != nil {
		return nil, err
	}

	version, err := s.contracts.GetVersionByID(ctx, contract.ID, versionID)
	if err != nil {
		return nil, err
	}
	if version == nil {
		return nil, ErrVersionNotFound
	}

	doc, err := unmarshalDocument(version.DocumentContent)
	if err != nil {
		doc = map[string]interface{}{}
	}

	return &VersionDetailVO{
		VersionID:       version.ID,
		VersionNo:       version.VersionNo,
		DocumentContent: doc,
		ChangeSummary:   version.ChangeSummary,
		CreatedBy:       version.CreatedBy,
		CreatedByName:   version.CreatedByName,
		CreateTime:      version.CreateTime,
	}, nil
}

// ShareChangeList 外部协作者查看变更记录。
func (s *ShareService) ShareChangeList(ctx context.Context, token, name string, page, pageSize int) (*pagination.PageResult[ChangeListItem], error) {
	_, contract, err := s.validateShare(ctx, token)
	if err != nil {
		return nil, err
	}
	if _, err := s.getCollaborator(ctx, contract.ID, name); err != nil {
		return nil, err
	}

	pageQuery := &pagination.Query{Page: page, PageSize: pageSize}
	pageQuery.Normalize()

	total, err := s.contracts.CountChanges(ctx, contract.ID)
	if err != nil {
		return nil, err
	}
	changes, err := s.contracts.ListChanges(ctx, contract.ID, pageQuery.Limit(), pageQuery.Offset())
	if err != nil {
		return nil, err
	}

	items := make([]ChangeListItem, 0, len(changes))
	for i := range changes {
		c := &changes[i]
		items = append(items, ChangeListItem{
			ID:             c.ID,
			FromVersionID:  c.FromVersionID,
			ToVersionID:    c.ToVersionID,
			ChangeType:     c.ChangeType,
			ChangeTypeText: changeTypeText(c.ChangeType),
			BlockID:        c.BlockID,
			ClauseNo:       c.ClauseNo,
			OldContent:     c.OldContent,
			NewContent:     c.NewContent,
			ChangeReason:   c.ChangeReason,
			OperatorName:   c.OperatorName,
			CreateTime:     c.CreateTime,
		})
	}
	result := pagination.NewPageResult(items, total, pageQuery.Page, pageQuery.PageSize)
	return &result, nil
}

// ShareSaveVersion 外部协作者保存新版本（含块级/样式 diff）。
func (s *ShareService) ShareSaveVersion(ctx context.Context, token, name string, documentContent map[string]interface{}, changeSummary, ip, userAgent string) (*SaveVersionResult, error) {
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
	collaborator, err := s.getCollaborator(ctx, contract.ID, name)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	fromVersionID := int64(0)
	oldDocJSON := ""
	if contract.CurrentVersionID != nil {
		fromVersionID = *contract.CurrentVersionID
		currentVersion, err := s.contracts.GetVersionByID(ctx, contract.ID, fromVersionID)
		if err != nil {
			return nil, err
		}
		if currentVersion != nil {
			oldDocJSON = currentVersion.DocumentContent
		}
	}

	normalizeWebCanvasDocument(documentContent)

	diffRecords, err := documentdiff.CompareJSON(oldDocJSON, documentContent)
	if err != nil {
		return nil, fmt.Errorf("compare document versions: %w", err)
	}

	newVersionNo := contract.CurrentVersionNo + 1
	newVersionID := nextID()
	newDocJSON, err := json.Marshal(documentContent)
	if err != nil {
		return nil, err
	}

	collaboratorID := collaborator.ID
	version := &model.ContractVersion{
		ID:              newVersionID,
		ContractID:      contract.ID,
		VersionNo:       newVersionNo,
		CreatedBy:       0,
		CollaboratorID:  &collaboratorID,
		DocumentContent: string(newDocJSON),
		ChangeSummary:   strings.TrimSpace(changeSummary),
		CreateTime:      now,
	}

	audit := &model.ContractAuditLog{
		ID:             nextID(),
		ContractID:     contract.ID,
		CollaboratorID: &collaboratorID,
		OperatorName:   collaborator.Name,
		OperationType:  "CREATE_VERSION",
		OperationDesc:  fmt.Sprintf("外部协作者 %s 创建合同版本 V%d", collaborator.Name, newVersionNo),
		VersionID:      newVersionID,
		IPAddress:      ip,
		UserAgent:      userAgent,
		CreateTime:     now,
	}

	changes := buildContractChangesFromDiff(
		contract.ID, fromVersionID, newVersionID, 0, &collaboratorID, diffRecords, now,
	)

	if err := s.contracts.CreateVersionWithChanges(ctx, contract.ID, version, changes, audit); err != nil {
		return nil, err
	}

	_ = s.contracts.UpdateContractStatus(ctx, contract.ID, 2)

	return &SaveVersionResult{
		ContractID:  contract.ID,
		VersionID:   newVersionID,
		VersionNo:   newVersionNo,
		ChangeCount: len(changes),
		CreateTime:  now,
	}, nil
}

// ConfirmWithPdf 内部用户确认当前版本并归档终稿 PDF。
func (s *ShareService) ConfirmWithPdf(
	ctx context.Context,
	contractID, userID int64,
	name string,
	ip, userAgent string,
	input ConfirmPdfInput,
) error {
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return err
	}
	if detail == nil {
		return ErrContractNotFound
	}
	if detail.Contract.Status == 3 || detail.Contract.Status == 4 {
		return ErrAlreadyConfirmed
	}
	if detail.Contract.CurrentVersionID == nil {
		return errors.New("合同还没有版本")
	}

	now := time.Now()
	userIDVal := userID
	confirmation := &model.ContractConfirmation{
		ID:            nextID(),
		ContractID:    contractID,
		VersionID:     *detail.Contract.CurrentVersionID,
		UserID:        &userIDVal,
		ConfirmerName: name,
		ConfirmerType: 0,
		ConfirmStatus: 1,
		ConfirmIP:     ip,
		UserAgent:     userAgent,
		ConfirmTime:   now,
		CreateTime:    now,
	}
	return s.contractSvc.FinalizeConfirmWithPdfArchive(ctx, contractID, *detail.Contract.CurrentVersionID, input, confirmation)
}

// ShareConfirmWithPdf 外部协作者确认当前版本并归档终稿 PDF。
func (s *ShareService) ShareConfirmWithPdf(
	ctx context.Context,
	token, name, ip, userAgent string,
	input ConfirmPdfInput,
) error {
	_, contract, err := s.validateShare(ctx, token)
	if err != nil {
		return err
	}
	collaborator, err := s.getCollaborator(ctx, contract.ID, name)
	if err != nil {
		return err
	}
	if contract.Status == 3 || contract.Status == 4 {
		return ErrAlreadyConfirmed
	}
	if contract.CurrentVersionID == nil {
		return errors.New("合同还没有版本")
	}

	now := time.Now()
	collaboratorID := collaborator.ID
	confirmation := &model.ContractConfirmation{
		ID:             nextID(),
		ContractID:     contract.ID,
		VersionID:      *contract.CurrentVersionID,
		CollaboratorID: &collaboratorID,
		ConfirmerName:  collaborator.Name,
		ConfirmerType:  1,
		ConfirmStatus:  1,
		ConfirmIP:      ip,
		UserAgent:      userAgent,
		ConfirmTime:    now,
		CreateTime:     now,
	}
	return s.contractSvc.FinalizeConfirmWithPdfArchive(ctx, contract.ID, *contract.CurrentVersionID, input, confirmation)
}

// PrepareShareFinalExport 外部分享页预分配验真码。
func (s *ShareService) PrepareShareFinalExport(ctx context.Context, token, name string) (*PrepareFinalExportResult, error) {
	_, contract, err := s.validateShare(ctx, token)
	if err != nil {
		return nil, err
	}
	if _, err := s.getCollaborator(ctx, contract.ID, name); err != nil {
		return nil, err
	}
	return s.contractSvc.PrepareFinalExportByContract(ctx, contract.ID)
}

// ShareUploadExportPdf 外部分享页上传 PDF 草稿归档。
func (s *ShareService) ShareUploadExportPdf(
	ctx context.Context,
	token, name string,
	pdfData []byte,
	hash string,
	pageCount int,
	verifyCode string,
	draft bool,
) (*ExportPdfInfo, error) {
	_, contract, err := s.validateShare(ctx, token)
	if err != nil {
		return nil, err
	}
	if _, err := s.getCollaborator(ctx, contract.ID, name); err != nil {
		return nil, err
	}
	return s.contractSvc.UploadExportPdfByContract(ctx, contract.ID, pdfData, hash, pageCount, verifyCode, draft)
}

// ListConfirmations 查询确认记录（内部用户，带 owner 权限校验）。
func (s *ShareService) ListConfirmations(ctx context.Context, contractID, userID int64) ([]model.ContractConfirmation, error) {
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return nil, err
	}
	if detail == nil {
		return nil, ErrContractNotFound
	}
	return s.shares.ListConfirmations(ctx, contractID)
}

// ShareListConfirmations 外部协作者查询确认记录。
func (s *ShareService) ShareListConfirmations(ctx context.Context, token, name string) ([]model.ContractConfirmation, error) {
	_, contract, err := s.validateShare(ctx, token)
	if err != nil {
		return nil, err
	}
	if _, err := s.getCollaborator(ctx, contract.ID, name); err != nil {
		return nil, err
	}
	return s.shares.ListConfirmations(ctx, contract.ID)
}

// ValidateShareAccess 供 WebSocket 等场景校验外部协作者访问权限。
func (s *ShareService) ValidateShareAccess(ctx context.Context, token, name string) (int64, int8, error) {
	share, contract, err := s.validateShare(ctx, token)
	if err != nil {
		return 0, 0, err
	}
	if _, err := s.getCollaborator(ctx, contract.ID, name); err != nil {
		return 0, 0, err
	}
	return contract.ID, share.Permission, nil
}

// DisableShare 使分享链接失效。
func (s *ShareService) DisableShare(ctx context.Context, shareID, contractID, userID int64) error {
	// 校验合同权限
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return err
	}
	if detail == nil {
		return ErrContractNotFound
	}
	return s.shares.DisableShare(ctx, shareID, contractID)
}

// validateShare 校验分享链接有效性，并累加访问次数。
func (s *ShareService) validateShare(ctx context.Context, token string) (*model.ContractShare, *model.Contract, error) {
	share, err := s.shares.GetShareByToken(ctx, token)
	if err != nil {
		return nil, nil, err
	}
	if share == nil {
		return nil, nil, ErrShareNotFound
	}
	if share.Status != 1 {
		return nil, nil, ErrShareDisabled
	}
	if share.ExpireTime != nil && time.Now().After(*share.ExpireTime) {
		return nil, nil, ErrShareExpired
	}
	if share.MaxAccessCount != nil && share.AccessCount >= *share.MaxAccessCount {
		return nil, nil, ErrShareMaxAccess
	}

	contract, err := s.shares.GetContractByID(ctx, share.ContractID)
	if err != nil {
		return nil, nil, err
	}
	if contract == nil {
		return nil, nil, ErrContractNotFound
	}

	// 累加访问次数
	now := time.Now()
	if err := s.shares.UpdateShareAccess(ctx, share.ID, now); err != nil {
		return nil, nil, err
	}
	share.AccessCount++

	return share, contract, nil
}

// getCollaborator 根据合同和姓名获取协作者。
func (s *ShareService) getCollaborator(ctx context.Context, contractID int64, name string) (*model.ContractCollaborator, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrCollaboratorNotFound
	}
	collaborator, err := s.shares.GetCollaboratorByContractAndName(ctx, contractID, name)
	if err != nil {
		return nil, err
	}
	if collaborator == nil {
		return nil, ErrCollaboratorNotFound
	}
	return collaborator, nil
}

// generateShareToken 生成安全随机分享 token。
func generateShareToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// sharePermissionText 权限数字转中文。
func sharePermissionText(permission int8) string {
	if permission == 0 {
		return "只读"
	}
	return "可编辑"
}
