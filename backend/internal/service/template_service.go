package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/lshc/contract-hub/backend/internal/docengine"
	"github.com/lshc/contract-hub/backend/internal/model"
	"github.com/lshc/contract-hub/backend/internal/oss"
	"github.com/lshc/contract-hub/backend/internal/repository"
	"github.com/lshc/contract-hub/backend/pkg/pagination"
)

var (
	ErrTemplateNotFound = errors.New("模板不存在或无权访问")
	ErrTemplateInUse    = errors.New("模板已被合同引用，无法删除")
)

// TemplateService 合同模板池业务逻辑。
type TemplateService struct {
	templates *repository.TemplateRepository
	oss       *oss.Client
	docEngine *docengine.Client
}

// NewTemplateService 创建模板服务。
func NewTemplateService(templates *repository.TemplateRepository, ossClient *oss.Client, docEngine *docengine.Client) *TemplateService {
	return &TemplateService{
		templates: templates,
		oss:       ossClient,
		docEngine: docEngine,
	}
}

// UploadTemplateInput 上传模板入参。
type UploadTemplateInput struct {
	UserID      int64
	TemplateName string
	Description string
	FileName    string
	FileData    []byte
}

// UploadTemplateResult 上传模板结果。
type UploadTemplateResult struct {
	TemplateID       int64  `json:"template_id"`
	TemplateName     string `json:"template_name"`
	OriginalFileName string `json:"original_file_name"`
	CurrentVersionID int64  `json:"current_version_id"`
	CurrentVersionNo int    `json:"current_version_no"`
	OssURL           string `json:"oss_url"`
	FileName         string `json:"file_name"`
	FileSize         int64  `json:"file_size"`
}

// Upload 上传 DOCX 到模板池。
func (s *TemplateService) Upload(ctx context.Context, input UploadTemplateInput) (*UploadTemplateResult, error) {
	if err := validateDocxFile(input.FileName, input.FileData); err != nil {
		return nil, err
	}

	name := strings.TrimSpace(input.TemplateName)
	if name == "" {
		name = defaultNameFromFileName(input.FileName)
	}

	fileHash := sha256.Sum256(input.FileData)
	hash := hex.EncodeToString(fileHash[:])

	now := time.Now()
	templateID := nextID()
	versionID := nextID()
	objectKey := fmt.Sprintf("templates/%d/v1/%d.docx", templateID, versionID)

	ossURL, err := s.oss.UploadBytes(ctx, objectKey, input.FileData, docxContentType)
	if err != nil {
		return nil, fmt.Errorf("upload template to oss failed: %w", err)
	}

	parsedData, err := s.docEngine.Parse(ctx, input.FileName, input.FileData)
	if err != nil {
		_ = s.oss.DeleteObject(ctx, objectKey)
		return nil, fmt.Errorf("%w: %v", ErrDocParseFailed, err)
	}
	parsedJSON, err := json.Marshal(parsedData)
	if err != nil {
		_ = s.oss.DeleteObject(ctx, objectKey)
		return nil, err
	}

	tpl := &model.ContractTemplate{
		ID:               templateID,
		OwnerUserID:      input.UserID,
		TemplateName:     name,
		OriginalFileName: input.FileName,
		Status:           1,
		CurrentVersionNo: 1,
		Description:      strings.TrimSpace(input.Description),
		CreateTime:       now,
		UpdateTime:       now,
	}
	version := &model.ContractTemplateVersion{
		ID:              versionID,
		TemplateID:      templateID,
		VersionNo:       1,
		CreatedBy:       input.UserID,
		OssObjectKey:    objectKey,
		OssURL:          ossURL,
		FileName:        input.FileName,
		FileSize:        int64(len(input.FileData)),
		FileHash:        hash,
		DocumentContent: string(parsedJSON),
		CreateTime:      now,
	}
	tpl.CurrentVersionID = &versionID

	if err := s.templates.CreateTemplateWithVersion(ctx, tpl, version); err != nil {
		_ = s.oss.DeleteObject(ctx, objectKey)
		return nil, err
	}

	return &UploadTemplateResult{
		TemplateID:       templateID,
		TemplateName:     name,
		OriginalFileName: input.FileName,
		CurrentVersionID: versionID,
		CurrentVersionNo: 1,
		OssURL:           ossURL,
		FileName:         input.FileName,
		FileSize:         int64(len(input.FileData)),
	}, nil
}

// TemplateListQuery 模板列表查询。
type TemplateListQuery struct {
	UserID   int64
	Page     int
	PageSize int
	Keyword  string
}

// TemplateListItem 模板列表项。
type TemplateListItem struct {
	ID               int64     `json:"id"`
	TemplateName     string    `json:"template_name"`
	OriginalFileName string    `json:"original_file_name"`
	CurrentVersionNo int       `json:"current_version_no"`
	Description      string    `json:"description"`
	CreateTime       time.Time `json:"create_time"`
	UpdateTime       time.Time `json:"update_time"`
}

// List 分页查询模板列表。
func (s *TemplateService) List(ctx context.Context, query TemplateListQuery) (*pagination.PageResult[TemplateListItem], error) {
	pageQuery := &pagination.Query{Page: query.Page, PageSize: query.PageSize}
	pageQuery.Normalize()

	filter := repository.TemplateListFilter{
		OwnerUserID: query.UserID,
		Keyword:     strings.TrimSpace(query.Keyword),
		Limit:       pageQuery.Limit(),
		Offset:      pageQuery.Offset(),
	}

	total, err := s.templates.CountTemplates(ctx, filter)
	if err != nil {
		return nil, err
	}

	rows, err := s.templates.ListTemplates(ctx, filter)
	if err != nil {
		return nil, err
	}

	items := make([]TemplateListItem, 0, len(rows))
	for _, t := range rows {
		items = append(items, TemplateListItem{
			ID:               t.ID,
			TemplateName:     t.TemplateName,
			OriginalFileName: t.OriginalFileName,
			CurrentVersionNo: t.CurrentVersionNo,
			Description:      t.Description,
			CreateTime:       t.CreateTime,
			UpdateTime:       t.UpdateTime,
		})
	}
	result := pagination.NewPageResult(items, total, pageQuery.Page, pageQuery.PageSize)
	return &result, nil
}

// TemplateDetailVO 模板详情。
type TemplateDetailVO struct {
	ID               int64                  `json:"id"`
	TemplateName     string                 `json:"template_name"`
	OriginalFileName string                 `json:"original_file_name"`
	CurrentVersionID int64                  `json:"current_version_id"`
	CurrentVersionNo int                    `json:"current_version_no"`
	Description      string                 `json:"description"`
	CreateTime       time.Time              `json:"create_time"`
	UpdateTime       time.Time              `json:"update_time"`
	Version          *TemplateVersionVO     `json:"version,omitempty"`
}

// TemplateVersionVO 模板版本信息。
type TemplateVersionVO struct {
	ID              int64     `json:"id"`
	VersionNo       int       `json:"version_no"`
	OssURL          string    `json:"oss_url"`
	FileName        string    `json:"file_name"`
	FileSize        int64     `json:"file_size"`
	DocumentContent string    `json:"document_content"`
	ChangeSummary   string    `json:"change_summary"`
	CreateTime      time.Time `json:"create_time"`
}

// Detail 查询模板详情。
func (s *TemplateService) Detail(ctx context.Context, templateID, userID int64) (*TemplateDetailVO, error) {
	detail, err := s.templates.GetDetailByOwner(ctx, templateID, userID)
	if err != nil {
		return nil, err
	}
	if detail == nil {
		return nil, ErrTemplateNotFound
	}
	return toTemplateDetailVO(detail), nil
}

// UpdateMetaInput 更新模板元信息。
type UpdateMetaInput struct {
	TemplateID   int64
	UserID       int64
	TemplateName string
	Description  string
}

// UpdateMeta 更新模板名称与说明。
func (s *TemplateService) UpdateMeta(ctx context.Context, input UpdateMetaInput) error {
	name := strings.TrimSpace(input.TemplateName)
	if name == "" {
		return ErrInvalidContractInput
	}
	err := s.templates.UpdateTemplateMeta(ctx, input.TemplateID, input.UserID, name, input.Description)
	if err != nil {
		return ErrTemplateNotFound
	}
	return nil
}

// Delete 软删除模板。
func (s *TemplateService) Delete(ctx context.Context, templateID, userID int64) error {
	count, err := s.templates.CountTemplateUsage(ctx, templateID)
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrTemplateInUse
	}
	if err := s.templates.SoftDeleteTemplate(ctx, templateID, userID); err != nil {
		return ErrTemplateNotFound
	}
	return nil
}

// PreviewDocx 下载当前版本 DOCX 用于预览。
func (s *TemplateService) PreviewDocx(ctx context.Context, templateID, userID int64) ([]byte, string, error) {
	detail, err := s.templates.GetDetailByOwner(ctx, templateID, userID)
	if err != nil {
		return nil, "", err
	}
	if detail == nil || detail.Version == nil || detail.Version.OssObjectKey == "" {
		return nil, "", ErrTemplateNotFound
	}
	data, err := s.oss.Download(ctx, detail.Version.OssObjectKey)
	if err != nil {
		return nil, "", err
	}
	return data, detail.Version.FileName, nil
}

// SaveTemplateContentInput 保存模板内容。
type SaveTemplateContentInput struct {
	TemplateID      int64
	UserID          int64
	DocumentContent map[string]interface{}
	ChangeSummary   string
}

// SaveContent 保存模板结构化内容并生成新版本（仅更新 JSON，OSS 原件保留供渲染）。
func (s *TemplateService) SaveContent(ctx context.Context, input SaveTemplateContentInput) (*TemplateVersionVO, error) {
	detail, err := s.templates.GetDetailByOwner(ctx, input.TemplateID, input.UserID)
	if err != nil {
		return nil, err
	}
	if detail == nil || detail.Version == nil {
		return nil, ErrTemplateNotFound
	}

	now := time.Now()
	newVersionNo := detail.Template.CurrentVersionNo + 1
	newVersionID := nextID()
	docJSON, err := json.Marshal(input.DocumentContent)
	if err != nil {
		return nil, err
	}

	version := &model.ContractTemplateVersion{
		ID:              newVersionID,
		TemplateID:      input.TemplateID,
		VersionNo:       newVersionNo,
		CreatedBy:       input.UserID,
		OssObjectKey:    detail.Version.OssObjectKey,
		OssURL:          detail.Version.OssURL,
		FileName:        detail.Version.FileName,
		FileSize:        detail.Version.FileSize,
		FileHash:        detail.Version.FileHash,
		DocumentContent: string(docJSON),
		ChangeSummary:   strings.TrimSpace(input.ChangeSummary),
		CreateTime:      now,
	}

	if err := s.templates.CreateTemplateVersion(ctx, input.TemplateID, version, newVersionNo); err != nil {
		return nil, err
	}

	return &TemplateVersionVO{
		ID:              newVersionID,
		VersionNo:       newVersionNo,
		OssURL:          version.OssURL,
		FileName:        version.FileName,
		FileSize:        version.FileSize,
		DocumentContent: version.DocumentContent,
		ChangeSummary:   version.ChangeSummary,
		CreateTime:      now,
	}, nil
}

func toTemplateDetailVO(detail *model.ContractTemplateDetail) *TemplateDetailVO {
	t := detail.Template
	vo := &TemplateDetailVO{
		ID:               t.ID,
		TemplateName:     t.TemplateName,
		OriginalFileName: t.OriginalFileName,
		CurrentVersionNo: t.CurrentVersionNo,
		Description:      t.Description,
		CreateTime:       t.CreateTime,
		UpdateTime:       t.UpdateTime,
	}
	if t.CurrentVersionID != nil {
		vo.CurrentVersionID = *t.CurrentVersionID
	}
	if detail.Version != nil {
		v := detail.Version
		vo.Version = &TemplateVersionVO{
			ID:              v.ID,
			VersionNo:       v.VersionNo,
			OssURL:          v.OssURL,
			FileName:        v.FileName,
			FileSize:        v.FileSize,
			DocumentContent: v.DocumentContent,
			ChangeSummary:   v.ChangeSummary,
			CreateTime:      v.CreateTime,
		}
	}
	return vo
}

func validateDocxFile(fileName string, data []byte) error {
	if len(data) == 0 {
		return ErrEmptyFile
	}
	if len(data) > MaxUploadFileSize {
		return ErrFileTooLarge
	}
	ext := strings.ToLower(filepath.Ext(fileName))
	if ext != ".docx" {
		return ErrInvalidFileType
	}
	return nil
}

func defaultNameFromFileName(fileName string) string {
	base := strings.TrimSuffix(fileName, filepath.Ext(fileName))
	return strings.TrimSpace(base)
}

const docxContentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
