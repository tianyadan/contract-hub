package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/lshc/contract-hub/backend/internal/model"
	"github.com/lshc/contract-hub/backend/internal/oss"
	"github.com/lshc/contract-hub/backend/internal/repository"
)

// 高保真快照相关常量与错误。
const MaxFidelitySnapshots = 5

var (
	ErrFidelitySnapshotNotFound = errors.New("高保真快照不存在")
	ErrFidelityEntityForbidden  = errors.New("无权访问该资源")
)

// FidelitySnapshotVO 快照列表项。
type FidelitySnapshotVO struct {
	SnapshotID      int64     `json:"snapshot_id"`
	SnapshotNo      int       `json:"snapshot_no"`
	SourceVersionNo int       `json:"source_version_no"`
	PageCount       int       `json:"page_count"`
	CreatedByName   string    `json:"created_by_name"`
	CreateTime      time.Time `json:"create_time"`
	PdfURL          string    `json:"pdf_url,omitempty"`
}

// FidelitySnapshotDetailVO 快照详情（含 PDF 签名 URL）。
type FidelitySnapshotDetailVO struct {
	FidelitySnapshotVO
	Hash string `json:"hash"`
}

// CreateFidelitySnapshotInput 创建快照入参。
type CreateFidelitySnapshotInput struct {
	EntityType      int8
	EntityID        int64
	UserID          int64
	Username        string
	PdfData         []byte
	Hash            string
	PageCount       int
	SourceVersionNo int
	DocumentContent string
}

// RollbackFidelityInput 回退入参。
type RollbackFidelityInput struct {
	EntityType int8
	EntityID   int64
	SnapshotID int64
	UserID     int64
	Username   string
	ClientIP   string
	UserAgent  string
}

// FidelityService 高保真快照业务逻辑。
type FidelityService struct {
	fidelity  *repository.FidelityRepository
	contracts *repository.ContractRepository
	templates *repository.TemplateRepository
	oss       *oss.Client
	contractsSvc *ContractService
	templatesSvc *TemplateService
}

// NewFidelityService 创建高保真快照服务。
func NewFidelityService(
	fidelity *repository.FidelityRepository,
	contracts *repository.ContractRepository,
	templates *repository.TemplateRepository,
	ossClient *oss.Client,
	contractsSvc *ContractService,
	templatesSvc *TemplateService,
) *FidelityService {
	return &FidelityService{
		fidelity:     fidelity,
		contracts:    contracts,
		templates:    templates,
		oss:          ossClient,
		contractsSvc: contractsSvc,
		templatesSvc: templatesSvc,
	}
}

// ListContractSnapshots 合同高保真快照列表。
func (s *FidelityService) ListContractSnapshots(ctx context.Context, contractID, userID int64) ([]FidelitySnapshotVO, error) {
	if err := s.ensureContractOwner(ctx, contractID, userID); err != nil {
		return nil, err
	}
	return s.listSnapshots(ctx, model.FidelityEntityContract, contractID, false)
}

// ListTemplateSnapshots 模板高保真快照列表。
func (s *FidelityService) ListTemplateSnapshots(ctx context.Context, templateID, userID int64) ([]FidelitySnapshotVO, error) {
	if err := s.ensureTemplateOwner(ctx, templateID, userID); err != nil {
		return nil, err
	}
	return s.listSnapshots(ctx, model.FidelityEntityTemplate, templateID, false)
}

// GetContractSnapshot 合同快照详情。
func (s *FidelityService) GetContractSnapshot(ctx context.Context, contractID, snapshotID, userID int64) (*FidelitySnapshotDetailVO, error) {
	if err := s.ensureContractOwner(ctx, contractID, userID); err != nil {
		return nil, err
	}
	return s.getSnapshot(ctx, model.FidelityEntityContract, contractID, snapshotID)
}

// GetTemplateSnapshot 模板快照详情。
func (s *FidelityService) GetTemplateSnapshot(ctx context.Context, templateID, snapshotID, userID int64) (*FidelitySnapshotDetailVO, error) {
	if err := s.ensureTemplateOwner(ctx, templateID, userID); err != nil {
		return nil, err
	}
	return s.getSnapshot(ctx, model.FidelityEntityTemplate, templateID, snapshotID)
}

// CreateContractSnapshot 创建合同高保真快照。
func (s *FidelityService) CreateContractSnapshot(ctx context.Context, input CreateFidelitySnapshotInput) (*FidelitySnapshotDetailVO, error) {
	if err := s.ensureContractOwner(ctx, input.EntityID, input.UserID); err != nil {
		return nil, err
	}
	input.EntityType = model.FidelityEntityContract
	return s.createSnapshot(ctx, input)
}

// CreateTemplateSnapshot 创建模板高保真快照。
func (s *FidelityService) CreateTemplateSnapshot(ctx context.Context, input CreateFidelitySnapshotInput) (*FidelitySnapshotDetailVO, error) {
	if err := s.ensureTemplateOwner(ctx, input.EntityID, input.UserID); err != nil {
		return nil, err
	}
	input.EntityType = model.FidelityEntityTemplate
	return s.createSnapshot(ctx, input)
}

// RollbackContractSnapshot 回退合同至快照内容。
func (s *FidelityService) RollbackContractSnapshot(ctx context.Context, input RollbackFidelityInput) (*SaveVersionResult, error) {
	if err := s.ensureContractOwner(ctx, input.EntityID, input.UserID); err != nil {
		return nil, err
	}
	snap, err := s.fidelity.GetByID(ctx, model.FidelityEntityContract, input.EntityID, input.SnapshotID)
	if err != nil {
		return nil, err
	}
	if snap == nil {
		return nil, ErrFidelitySnapshotNotFound
	}
	var doc map[string]interface{}
	if err := json.Unmarshal([]byte(snap.DocumentContent), &doc); err != nil {
		return nil, errors.New("快照文档内容损坏")
	}
	return s.contractsSvc.SaveVersion(ctx, SaveVersionInput{
		ContractID:      input.EntityID,
		UserID:          input.UserID,
		Username:        input.Username,
		DocumentContent: doc,
		ChangeSummary:   fmt.Sprintf("回退至高保真快照 #%d（基于 V%d）", snap.SnapshotNo, snap.SourceVersionNo),
		ClientIP:        input.ClientIP,
		UserAgent:       input.UserAgent,
	})
}

// RollbackTemplateSnapshot 回退模板至快照内容。
func (s *FidelityService) RollbackTemplateSnapshot(ctx context.Context, input RollbackFidelityInput) (*TemplateVersionVO, error) {
	if err := s.ensureTemplateOwner(ctx, input.EntityID, input.UserID); err != nil {
		return nil, err
	}
	snap, err := s.fidelity.GetByID(ctx, model.FidelityEntityTemplate, input.EntityID, input.SnapshotID)
	if err != nil {
		return nil, err
	}
	if snap == nil {
		return nil, ErrFidelitySnapshotNotFound
	}
	var doc map[string]interface{}
	if err := json.Unmarshal([]byte(snap.DocumentContent), &doc); err != nil {
		return nil, errors.New("快照文档内容损坏")
	}
	return s.templatesSvc.SaveContent(ctx, SaveTemplateContentInput{
		TemplateID:      input.EntityID,
		UserID:          input.UserID,
		DocumentContent: doc,
		ChangeSummary:   fmt.Sprintf("回退至高保真快照 #%d（基于 V%d）", snap.SnapshotNo, snap.SourceVersionNo),
	})
}

func (s *FidelityService) listSnapshots(ctx context.Context, entityType int8, entityID int64, withURL bool) ([]FidelitySnapshotVO, error) {
	items, err := s.fidelity.ListByEntity(ctx, entityType, entityID)
	if err != nil {
		return nil, err
	}
	result := make([]FidelitySnapshotVO, 0, len(items))
	for _, item := range items {
		vo := toFidelitySnapshotVO(item, "")
		if withURL {
			vo.PdfURL = s.signPdfURL(item.PreviewPdfOssKey)
		}
		result = append(result, vo)
	}
	return result, nil
}

func (s *FidelityService) getSnapshot(ctx context.Context, entityType int8, entityID, snapshotID int64) (*FidelitySnapshotDetailVO, error) {
	snap, err := s.fidelity.GetByID(ctx, entityType, entityID, snapshotID)
	if err != nil {
		return nil, err
	}
	if snap == nil {
		return nil, ErrFidelitySnapshotNotFound
	}
	vo := toFidelitySnapshotVO(*snap, s.signPdfURL(snap.PreviewPdfOssKey))
	return &FidelitySnapshotDetailVO{
		FidelitySnapshotVO: vo,
		Hash:               snap.PreviewPdfHash,
	}, nil
}

func (s *FidelityService) createSnapshot(ctx context.Context, input CreateFidelitySnapshotInput) (*FidelitySnapshotDetailVO, error) {
	if err := validatePdfUpload(input.PdfData, input.Hash, input.PageCount); err != nil {
		return nil, err
	}
	docJSON := strings.TrimSpace(input.DocumentContent)
	if docJSON == "" {
		return nil, errors.New("document_content 不能为空")
	}
	if !json.Valid([]byte(docJSON)) {
		return nil, errors.New("document_content 不是合法 JSON")
	}
	if input.SourceVersionNo <= 0 {
		return nil, errors.New("source_version_no 不合法")
	}

	// FIFO 淘汰：超过上限时删除最旧快照及 OSS 文件。
	count, err := s.fidelity.CountByEntity(ctx, input.EntityType, input.EntityID)
	if err != nil {
		return nil, err
	}
	for count >= MaxFidelitySnapshots {
		oldest, err := s.fidelity.GetOldestByEntity(ctx, input.EntityType, input.EntityID)
		if err != nil {
			return nil, err
		}
		if oldest == nil {
			break
		}
		_ = s.oss.DeleteObject(ctx, oldest.PreviewPdfOssKey)
		if err := s.fidelity.DeleteByID(ctx, oldest.ID); err != nil {
			return nil, err
		}
		count--
	}

	snapshotID := nextID()
	objectKey := fidelityPdfObjectKey(input.EntityType, input.EntityID, snapshotID)
	if _, err := s.oss.UploadBytes(ctx, objectKey, input.PdfData, "application/pdf"); err != nil {
		return nil, err
	}

	snapshotNo, err := s.fidelity.NextSnapshotNo(ctx, input.EntityType, input.EntityID)
	if err != nil {
		_ = s.oss.DeleteObject(ctx, objectKey)
		return nil, err
	}

	now := time.Now()
	userID := input.UserID
	snap := &model.FidelitySnapshot{
		ID:                  snapshotID,
		EntityType:          input.EntityType,
		EntityID:            input.EntityID,
		SnapshotNo:          snapshotNo,
		SourceVersionNo:     input.SourceVersionNo,
		DocumentContent:     docJSON,
		PreviewPdfOssKey:    objectKey,
		PreviewPdfHash:      strings.TrimSpace(input.Hash),
		PreviewPdfPageCount: input.PageCount,
		CreatedByUserID:     &userID,
		CreatedByName:       strings.TrimSpace(input.Username),
		CreateTime:          now,
	}
	if snap.CreatedByName == "" {
		snap.CreatedByName = "用户"
	}
	if err := s.fidelity.Create(ctx, snap); err != nil {
		_ = s.oss.DeleteObject(ctx, objectKey)
		return nil, err
	}

	vo := toFidelitySnapshotVO(*snap, s.signPdfURL(objectKey))
	return &FidelitySnapshotDetailVO{
		FidelitySnapshotVO: vo,
		Hash:               snap.PreviewPdfHash,
	}, nil
}

func (s *FidelityService) signPdfURL(objectKey string) string {
	url, err := s.oss.SignURL(objectKey, 900)
	if err != nil {
		return s.oss.PublicURL(objectKey)
	}
	return url
}

func toFidelitySnapshotVO(item model.FidelitySnapshot, pdfURL string) FidelitySnapshotVO {
	return FidelitySnapshotVO{
		SnapshotID:      item.ID,
		SnapshotNo:      item.SnapshotNo,
		SourceVersionNo: item.SourceVersionNo,
		PageCount:       item.PreviewPdfPageCount,
		CreatedByName:   item.CreatedByName,
		CreateTime:      item.CreateTime,
		PdfURL:          pdfURL,
	}
}

func fidelityPdfObjectKey(entityType int8, entityID, snapshotID int64) string {
	if entityType == model.FidelityEntityTemplate {
		return fmt.Sprintf("templates/%d/fidelity/%d.pdf", entityID, snapshotID)
	}
	return fmt.Sprintf("contracts/%d/fidelity/%d.pdf", entityID, snapshotID)
}

func (s *FidelityService) ensureContractOwner(ctx context.Context, contractID, userID int64) error {
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return err
	}
	if detail == nil {
		return ErrContractNotFound
	}
	return nil
}

func (s *FidelityService) ensureTemplateOwner(ctx context.Context, templateID, userID int64) error {
	detail, err := s.templates.GetDetailByOwner(ctx, templateID, userID)
	if err != nil {
		return err
	}
	if detail == nil {
		return ErrTemplateNotFound
	}
	return nil
}
