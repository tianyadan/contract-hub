package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"path/filepath"
	"strings"
	"time"

	"github.com/lshc/contract-hub/backend/internal/collab"
	"github.com/lshc/contract-hub/backend/internal/docengine"
	"github.com/lshc/contract-hub/backend/internal/documentdiff"
	"github.com/lshc/contract-hub/backend/internal/model"
	"github.com/lshc/contract-hub/backend/internal/oss"
	"github.com/lshc/contract-hub/backend/internal/repository"
	"github.com/lshc/contract-hub/backend/pkg/pagination"
)

// 合同模块业务错误。
var (
	ErrInvalidContractInput = errors.New("请求参数不合法")
	ErrInvalidFileType      = errors.New("仅支持 .docx 文件")
	ErrEmptyFile            = errors.New("文件不能为空")
	ErrFileTooLarge         = errors.New("文件大小不能超过 20MB")
	ErrContractNotFound     = errors.New("合同不存在或无权访问")
	ErrContractLocked       = errors.New("合同已确认锁定，无法继续编辑")
	ErrDocParseFailed       = errors.New("文档解析失败，请检查 DOCX 内容")
	ErrVersionNotFound      = errors.New("版本不存在")
)

// MaxUploadFileSize 限制上传文件最大 20MB。
const MaxUploadFileSize = 20 << 20

// ContractService 合同创建等业务逻辑。
type ContractService struct {
	contracts       *repository.ContractRepository
	templates       *repository.TemplateRepository
	customers       *repository.CustomerRepository
	shares          *repository.ShareRepository
	oss             *oss.Client
	docEngine       *docengine.Client
	publicWebOrigin string
	broadcaster     collab.Broadcaster
}

// NewContractService 创建合同服务。
func NewContractService(
	contracts *repository.ContractRepository,
	templates *repository.TemplateRepository,
	customers *repository.CustomerRepository,
	shares *repository.ShareRepository,
	ossClient *oss.Client,
	docEngine *docengine.Client,
	publicWebOrigin string,
) *ContractService {
	return &ContractService{
		contracts:       contracts,
		templates:       templates,
		customers:       customers,
		shares:          shares,
		oss:             ossClient,
		docEngine:       docEngine,
		publicWebOrigin: publicWebOrigin,
	}
}

// SetBroadcaster 注入协作事件广播器。
func (s *ContractService) SetBroadcaster(b collab.Broadcaster) {
	s.broadcaster = b
}

// CreateContractInput 创建合同入参。
type CreateContractInput struct {
	Name            string
	Description     string
	CustomerName    string
	CustomerContact string
	CustomerPhone   string
	UserID          int64
	Username        string
	FileName        string
	FileData        []byte
	ClientIP        string
	UserAgent       string
}

// CreateContractResult 创建合同成功后的返回结果。
type CreateContractResult struct {
	ContractID       int64  `json:"contract_id"`
	ContractNo       string `json:"contract_no"`
	ContractName     string `json:"contract_name"`
	Status           int8   `json:"status"`
	StatusText       string `json:"status_text"`
	CurrentVersionID int64  `json:"current_version_id"`
	CurrentVersionNo int    `json:"current_version_no"`
	OssURL           string `json:"oss_url"`
	FileName         string `json:"file_name"`
	FileSize         int64  `json:"file_size"`
	FileHash         string `json:"file_hash"`
}

// Create 创建合同：校验 DOCX -> 上传 OSS -> 创建 contract + V1 version + 审计日志。
func (s *ContractService) Create(ctx context.Context, input CreateContractInput) (*CreateContractResult, error) {
	if err := validateCreateContractInput(input); err != nil {
		return nil, err
	}

	// 计算文件 SHA256，用于文件唯一性校验和后续审计
	fileHash := sha256.Sum256(input.FileData)
	hash := hex.EncodeToString(fileHash[:])

	now := time.Now()
	contractID := nextID()
	versionID := nextID()

	// 生成 OSS 存储路径：contracts/{contract_id}/v1/{version_id}.docx
	objectKey := fmt.Sprintf("contracts/%d/v1/%d.docx", contractID, versionID)

	// 1. 上传 DOCX 到阿里云 OSS
	ossURL, err := s.oss.UploadBytes(ctx, objectKey, input.FileData, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	if err != nil {
		return nil, fmt.Errorf("upload docx to oss failed: %w", err)
	}

	// 2. 调用 Python Document Engine 解析 DOCX 为结构化 JSON
	parsedData, err := s.docEngine.Parse(ctx, input.FileName, input.FileData)
	if err != nil {
		_ = s.oss.DeleteObject(ctx, objectKey)
		return nil, fmt.Errorf("%w: %v", ErrDocParseFailed, err)
	}
	parsedJSON, err := json.Marshal(parsedData)
	if err != nil {
		_ = s.oss.DeleteObject(ctx, objectKey)
		return nil, fmt.Errorf("%w: %v", ErrDocParseFailed, err)
	}

	contract := &model.Contract{
		ID:               contractID,
		ContractNo:       generateContractNo(),
		ContractName:     strings.TrimSpace(input.Name),
		OwnerUserID:      input.UserID,
		CustomerName:     strings.TrimSpace(input.CustomerName),
		CustomerContact:  strings.TrimSpace(input.CustomerContact),
		CustomerPhone:    strings.TrimSpace(input.CustomerPhone),
		Status:           0, // 0=已导入
		CurrentVersionNo: 1,
		Description:      strings.TrimSpace(input.Description),
		CreateTime:       now,
		UpdateTime:       now,
	}

	version := &model.ContractVersion{
		ID:              versionID,
		ContractID:      contractID,
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

	audit := &model.ContractAuditLog{
		ID:            nextID(),
		ContractID:    contractID,
		UserID:        input.UserID,
		OperatorName:  input.Username,
		OperationType: "CREATE_CONTRACT",
		OperationDesc: fmt.Sprintf("创建合同「%s」，上传文件：%s", contract.ContractName, input.FileName),
		VersionID:     versionID,
		IPAddress:     input.ClientIP,
		UserAgent:     input.UserAgent,
		CreateTime:    now,
	}

	// 2. 写数据库
	if err := s.contracts.CreateContractWithVersion(ctx, contract, version, audit); err != nil {
		// 数据库失败时尽量清理刚上传的 OSS 文件，避免产生孤儿文件
		_ = s.oss.DeleteObject(ctx, objectKey)
		return nil, fmt.Errorf("save contract failed: %w", err)
	}

	return &CreateContractResult{
		ContractID:       contractID,
		ContractNo:       contract.ContractNo,
		ContractName:     contract.ContractName,
		Status:           contract.Status,
		StatusText:       "已导入",
		CurrentVersionID: versionID,
		CurrentVersionNo: 1,
		OssURL:           ossURL,
		FileName:         input.FileName,
		FileSize:         int64(len(input.FileData)),
		FileHash:         hash,
	}, nil
}

// ContractListQuery 合同列表查询条件。
type ContractListQuery struct {
	UserID       int64
	CustomerID   *int64
	Page         int
	PageSize     int
	Keyword      string
	Status       *int8
	CustomerName string
}

// ContractListItem 合同列表返回项。
type ContractListItem struct {
	ID               int64     `json:"id"`
	ContractNo       string    `json:"contract_no"`
	ContractName     string    `json:"contract_name"`
	CustomerName     string    `json:"customer_name"`
	Status           int8      `json:"status"`
	StatusText       string    `json:"status_text"`
	CurrentVersionNo int       `json:"current_version_no"`
	CreateTime       time.Time `json:"create_time"`
	UpdateTime       time.Time `json:"update_time"`
}

// List 分页查询当前用户的合同列表。
func (s *ContractService) List(ctx context.Context, query ContractListQuery) (*pagination.PageResult[ContractListItem], error) {
	pageQuery := &pagination.Query{Page: query.Page, PageSize: query.PageSize}
	pageQuery.Normalize()

	filter := repository.ContractListFilter{
		OwnerUserID:  query.UserID,
		CustomerID:   query.CustomerID,
		Status:       query.Status,
		Keyword:      strings.TrimSpace(query.Keyword),
		CustomerName: strings.TrimSpace(query.CustomerName),
		Limit:        pageQuery.Limit(),
		Offset:       pageQuery.Offset(),
	}

	total, err := s.contracts.CountContracts(ctx, filter)
	if err != nil {
		return nil, err
	}

	contracts, err := s.contracts.ListContracts(ctx, filter)
	if err != nil {
		return nil, err
	}

	items := make([]ContractListItem, 0, len(contracts))
	for i := range contracts {
		c := &contracts[i]
		items = append(items, ContractListItem{
			ID:               c.ID,
			ContractNo:       c.ContractNo,
			ContractName:     c.ContractName,
			CustomerName:     c.CustomerName,
			Status:           c.Status,
			StatusText:       contractStatusText(c.Status),
			CurrentVersionNo: c.CurrentVersionNo,
			CreateTime:       c.CreateTime,
			UpdateTime:       c.UpdateTime,
		})
	}

	result := pagination.NewPageResult(items, total, pageQuery.Page, pageQuery.PageSize)
	return &result, nil
}

// ContractVersionVO 合同版本详情返回结构。
type ContractVersionVO struct {
	ID              int64     `json:"id"`
	VersionNo       int       `json:"version_no"`
	OssURL          string    `json:"oss_url"`
	FileName        string    `json:"file_name"`
	FileSize        int64     `json:"file_size"`
	FileHash        string    `json:"file_hash"`
	DocumentContent string    `json:"document_content"`
	ChangeSummary   string    `json:"change_summary"`
	CreateTime      time.Time `json:"create_time"`
}

// ContractDetailVO 合同详情返回结构。
type ContractDetailVO struct {
	ID               int64              `json:"id"`
	ContractNo       string             `json:"contract_no"`
	ContractName     string             `json:"contract_name"`
	CustomerName     string             `json:"customer_name"`
	CustomerContact  string             `json:"customer_contact"`
	CustomerPhone    string             `json:"customer_phone"`
	Status           int8               `json:"status"`
	StatusText       string             `json:"status_text"`
	CurrentVersionID int64              `json:"current_version_id"`
	CurrentVersionNo int                `json:"current_version_no"`
	Description      string             `json:"description"`
	CreateTime       time.Time          `json:"create_time"`
	UpdateTime       time.Time          `json:"update_time"`
	Version          *ContractVersionVO `json:"version,omitempty"`
}

// Detail 查询当前用户创建的合同详情。
func (s *ContractService) Detail(ctx context.Context, contractID, userID int64) (*ContractDetailVO, error) {
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return nil, err
	}
	if detail == nil {
		return nil, ErrContractNotFound
	}

	c := &detail.Contract
	vo := &ContractDetailVO{
		ID:               c.ID,
		ContractNo:       c.ContractNo,
		ContractName:     c.ContractName,
		CustomerName:     c.CustomerName,
		CustomerContact:  c.CustomerContact,
		CustomerPhone:    c.CustomerPhone,
		Status:           c.Status,
		StatusText:       contractStatusText(c.Status),
		CurrentVersionID: 0,
		CurrentVersionNo: c.CurrentVersionNo,
		Description:      c.Description,
		CreateTime:       c.CreateTime,
		UpdateTime:       c.UpdateTime,
	}
	if c.CurrentVersionID != nil {
		vo.CurrentVersionID = *c.CurrentVersionID
	}

	if detail.Version != nil {
		v := detail.Version
		vo.Version = &ContractVersionVO{
			ID:              v.ID,
			VersionNo:       v.VersionNo,
			OssURL:          v.OssURL,
			FileName:        v.FileName,
			FileSize:        v.FileSize,
			FileHash:        v.FileHash,
			DocumentContent: v.DocumentContent,
			ChangeSummary:   v.ChangeSummary,
			CreateTime:      v.CreateTime,
		}
	}

	return vo, nil
}

// SaveVersionInput 保存新版本入参。
type SaveVersionInput struct {
	ContractID      int64
	UserID          int64
	Username        string
	DocumentContent map[string]interface{}
	ChangeSummary   string
	ClientIP        string
	UserAgent       string
}

// SaveVersionResult 保存新版本返回结果。
type SaveVersionResult struct {
	ContractID  int64     `json:"contract_id"`
	VersionID   int64     `json:"version_id"`
	VersionNo   int       `json:"version_no"`
	ChangeCount int       `json:"change_count"`
	CreateTime  time.Time `json:"create_time"`
}

// SaveVersion 保存新版本：写入网页编辑快照并生成块级/样式 diff 变更记录。
func (s *ContractService) SaveVersion(ctx context.Context, input SaveVersionInput) (*SaveVersionResult, error) {
	detail, err := s.contracts.GetDetailByOwner(ctx, input.ContractID, input.UserID)
	if err != nil {
		return nil, err
	}
	if detail == nil {
		return nil, ErrContractNotFound
	}
	if detail.Contract.Status >= 3 && detail.Contract.Status != 5 {
		return nil, ErrContractLocked
	}

	now := time.Now()
	fromVersionID := int64(0)
	oldDocJSON := ""
	if detail.Version != nil {
		fromVersionID = detail.Version.ID
		oldDocJSON = detail.Version.DocumentContent
	}

	normalizeWebCanvasDocument(input.DocumentContent)

	diffRecords, err := documentdiff.CompareJSON(oldDocJSON, input.DocumentContent)
	if err != nil {
		return nil, fmt.Errorf("compare document versions: %w", err)
	}

	newVersionNo := detail.Contract.CurrentVersionNo + 1
	newVersionID := nextID()
	newDocJSON, err := json.Marshal(input.DocumentContent)
	if err != nil {
		return nil, err
	}

	version := &model.ContractVersion{
		ID:              newVersionID,
		ContractID:      input.ContractID,
		VersionNo:       newVersionNo,
		CreatedBy:       input.UserID,
		DocumentContent: string(newDocJSON),
		ChangeSummary:   strings.TrimSpace(input.ChangeSummary),
		CreateTime:      now,
	}
	// 新版本继承上一版的 DOCX 归档信息，供「导入原文件参考」预览使用。
	inheritVersionFileMeta(version, detail.Version)

	audit := &model.ContractAuditLog{
		ID:            nextID(),
		ContractID:    input.ContractID,
		UserID:        input.UserID,
		OperatorName:  input.Username,
		OperationType: "CREATE_VERSION",
		OperationDesc: fmt.Sprintf("创建合同版本 V%d", newVersionNo),
		VersionID:     newVersionID,
		IPAddress:     input.ClientIP,
		UserAgent:     input.UserAgent,
		CreateTime:    now,
	}

	changes := buildContractChangesFromDiff(
		input.ContractID, fromVersionID, newVersionID, input.UserID, nil, diffRecords, now,
	)

	if err := s.contracts.CreateVersionWithChanges(ctx, input.ContractID, version, changes, audit); err != nil {
		return nil, err
	}

	if s.broadcaster != nil {
		savedBy := strings.TrimSpace(input.Username)
		if savedBy == "" {
			savedBy = "内部用户"
		}
		s.broadcaster.BroadcastVersionSaved(input.ContractID, collab.VersionSavedPayload{
			VersionID:   newVersionID,
			VersionNo:   newVersionNo,
			SavedBy:     savedBy,
			SavedByRole: "owner",
		})
	}

	return &SaveVersionResult{
		ContractID:  input.ContractID,
		VersionID:   newVersionID,
		VersionNo:   newVersionNo,
		ChangeCount: len(changes),
		CreateTime:  now,
	}, nil
}

// normalizeWebCanvasDocument 将文档快照规范为 V3 网页画布模式。
func normalizeWebCanvasDocument(doc map[string]interface{}) {
	if doc == nil {
		return
	}
	doc["schema_version"] = 3
	doc["render_mode"] = "web_canvas"
}

// VersionListItem 版本列表返回项。
type VersionListItem struct {
	VersionID     int64     `json:"version_id"`
	VersionNo     int       `json:"version_no"`
	ChangeSummary string    `json:"change_summary"`
	CreatedBy     int64     `json:"created_by"`
	CreatedByName string    `json:"created_by_name"`
	CreateTime    time.Time `json:"create_time"`
}

// VersionList 分页查询版本列表。
func (s *ContractService) VersionList(ctx context.Context, contractID, userID int64, page, pageSize int) (*pagination.PageResult[VersionListItem], error) {
	// 校验合同权限
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return nil, err
	}
	if detail == nil {
		return nil, ErrContractNotFound
	}

	pageQuery := &pagination.Query{Page: page, PageSize: pageSize}
	pageQuery.Normalize()

	total, err := s.contracts.CountVersions(ctx, contractID)
	if err != nil {
		return nil, err
	}
	versions, err := s.contracts.ListVersions(ctx, contractID, pageQuery.Limit(), pageQuery.Offset())
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

// VersionDetailVO 版本详情返回结构。
type VersionDetailVO struct {
	VersionID       int64                  `json:"version_id"`
	VersionNo       int                    `json:"version_no"`
	DocumentContent map[string]interface{} `json:"document_content"`
	ChangeSummary   string                 `json:"change_summary"`
	CreatedBy       int64                  `json:"created_by"`
	CreatedByName   string                 `json:"created_by_name"`
	CreateTime      time.Time              `json:"create_time"`
}

// VersionDetail 查询指定版本详情。
func (s *ContractService) VersionDetail(ctx context.Context, contractID, versionID, userID int64) (*VersionDetailVO, error) {
	// 校验合同权限
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return nil, err
	}
	if detail == nil {
		return nil, ErrContractNotFound
	}

	version, err := s.contracts.GetVersionByID(ctx, contractID, versionID)
	if err != nil {
		return nil, err
	}
	if version == nil {
		return nil, ErrVersionNotFound
	}

	doc, err := unmarshalDocument(version.DocumentContent)
	if err != nil {
		// 旧数据可能没有内容，返回空对象而不是报错
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

// ChangeListItem 变更记录列表返回项。
type ChangeListItem struct {
	ID             int64     `json:"id"`
	FromVersionID  int64     `json:"from_version_id"`
	ToVersionID    int64     `json:"to_version_id"`
	ChangeType     int8      `json:"change_type"`
	ChangeTypeText string    `json:"change_type_text"`
	BlockID        string    `json:"block_id"`
	ClauseNo       string    `json:"clause_no"`
	OldContent     string    `json:"old_content"`
	NewContent     string    `json:"new_content"`
	ChangeReason   string    `json:"change_reason"`
	OperatorName   string    `json:"operator_name"`
	CreateTime     time.Time `json:"create_time"`
}

// ChangeList 分页查询变更记录。
func (s *ContractService) ChangeList(ctx context.Context, contractID, userID int64, page, pageSize int) (*pagination.PageResult[ChangeListItem], error) {
	// 校验合同权限
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return nil, err
	}
	if detail == nil {
		return nil, ErrContractNotFound
	}

	pageQuery := &pagination.Query{Page: page, PageSize: pageSize}
	pageQuery.Normalize()

	total, err := s.contracts.CountChanges(ctx, contractID)
	if err != nil {
		return nil, err
	}
	changes, err := s.contracts.ListChanges(ctx, contractID, pageQuery.Limit(), pageQuery.Offset())
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

// BatchDeleteContractsInput 批量删除合同入参。
type BatchDeleteContractsInput struct {
	ContractIDs []int64
	UserID      int64
	Username    string
	ClientIP    string
	UserAgent   string
}

// Delete 删除当前用户名下的单个合同。
func (s *ContractService) Delete(ctx context.Context, contractID, userID int64, username, clientIP, userAgent string) error {
	return s.BatchDelete(ctx, BatchDeleteContractsInput{
		ContractIDs: []int64{contractID},
		UserID:      userID,
		Username:    username,
		ClientIP:    clientIP,
		UserAgent:   userAgent,
	})
}

// BatchDelete 批量删除当前用户名下的合同。
func (s *ContractService) BatchDelete(ctx context.Context, input BatchDeleteContractsInput) error {
	contractIDs, err := normalizeContractIDs(input.ContractIDs)
	if err != nil {
		return err
	}
	if input.UserID <= 0 {
		return ErrInvalidContractInput
	}

	now := time.Now()
	audits := make([]model.ContractAuditLog, 0, len(contractIDs))
	for _, contractID := range contractIDs {
		audits = append(audits, model.ContractAuditLog{
			ID:            nextID(),
			ContractID:    contractID,
			UserID:        input.UserID,
			OperatorName:  input.Username,
			OperationType: "DELETE_CONTRACT",
			OperationDesc: fmt.Sprintf("删除合同，合同ID：%d", contractID),
			IPAddress:     input.ClientIP,
			UserAgent:     input.UserAgent,
			CreateTime:    now,
		})
	}

	objectKeys, deletedCount, err := s.contracts.DeleteContractsByOwner(ctx, input.UserID, contractIDs, audits)
	if err != nil {
		return err
	}
	if deletedCount != int64(len(contractIDs)) {
		return ErrContractNotFound
	}

	// 数据库删除成功后再清理 OSS，避免先删文件导致数据库回滚后合同不可下载。
	// OSS 删除失败只记录日志：合同数据已删除，接口不因外部存储短暂失败回滚主流程。
	if s.oss != nil {
		for _, objectKey := range objectKeys {
			if strings.TrimSpace(objectKey) == "" {
				continue
			}
			if err := s.oss.DeleteObject(ctx, objectKey); err != nil {
				log.Printf("delete contract oss object failed, object_key=%s, err=%v", objectKey, err)
			}
		}
	}

	return nil
}

// normalizeContractIDs 校验并去重合同 ID，避免批量删除重复 ID 导致删除数量判断失真。
func normalizeContractIDs(ids []int64) ([]int64, error) {
	if len(ids) == 0 {
		return nil, ErrInvalidContractInput
	}

	seen := make(map[int64]struct{}, len(ids))
	normalized := make([]int64, 0, len(ids))
	for _, id := range ids {
		if id <= 0 {
			return nil, ErrInvalidContractInput
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		normalized = append(normalized, id)
	}
	if len(normalized) == 0 {
		return nil, ErrInvalidContractInput
	}
	return normalized, nil
}

// unmarshalDocument 把数据库中的 JSON 字符串解析为 map。
func unmarshalDocument(content string) (map[string]interface{}, error) {
	if strings.TrimSpace(content) == "" {
		return map[string]interface{}{}, nil
	}
	var doc map[string]interface{}
	if err := json.Unmarshal([]byte(content), &doc); err != nil {
		return nil, err
	}
	return doc, nil
}

// changeTypeText 变更类型数字转中文。
func changeTypeText(changeType int8) string {
	switch changeType {
	case 0:
		return "新增"
	case 1:
		return "删除"
	case 2:
		return "修改"
	default:
		return "未知"
	}
}

// contractStatusText 合同状态数字转中文描述。
func contractStatusText(status int8) string {
	switch status {
	case 0:
		return "已导入"
	case 1:
		return "已分享"
	case 2:
		return "协作中"
	case 3:
		return "已确认"
	case 4:
		return "已完成"
	case 5:
		return "已取消"
	default:
		return "未知"
	}
}

// validateCreateContractInput 校验创建合同参数。
func validateCreateContractInput(input CreateContractInput) error {
	if strings.TrimSpace(input.Name) == "" {
		return ErrInvalidContractInput
	}
	if len(input.Name) > 255 {
		return ErrInvalidContractInput
	}

	// 只允许 .docx
	ext := strings.ToLower(filepath.Ext(input.FileName))
	if ext != ".docx" {
		return ErrInvalidFileType
	}

	if len(input.FileData) == 0 {
		return ErrEmptyFile
	}
	if len(input.FileData) > MaxUploadFileSize {
		return ErrFileTooLarge
	}

	// DOCX 本质是 ZIP 文件，检查文件头是否为 PK\x03\x04
	if len(input.FileData) < 4 || input.FileData[0] != 'P' || input.FileData[1] != 'K' || input.FileData[2] != 0x03 || input.FileData[3] != 0x04 {
		return ErrInvalidFileType
	}

	return nil
}

// CreateFromTemplateInput 从模板为客户创建合同入参。
type CreateFromTemplateInput struct {
	CustomerID   int64
	TemplateID   int64
	ContractName string
	UserID       int64
	Username     string
	ClientIP     string
	UserAgent    string
}

// CreateFromTemplate 从模板池复制 DOCX，为客户创建合同实例。
func (s *ContractService) CreateFromTemplate(ctx context.Context, input CreateFromTemplateInput) (*CreateContractResult, error) {
	customer, err := s.customers.GetByOwner(ctx, input.CustomerID, input.UserID)
	if err != nil {
		return nil, err
	}
	if customer == nil {
		return nil, ErrCustomerNotFound
	}

	tplDetail, err := s.templates.GetDetailByOwner(ctx, input.TemplateID, input.UserID)
	if err != nil {
		return nil, err
	}
	if tplDetail == nil || tplDetail.Version == nil {
		return nil, ErrTemplateNotFound
	}

	contractName := strings.TrimSpace(input.ContractName)
	if contractName == "" {
		contractName = fmt.Sprintf("%s - %s", tplDetail.Template.TemplateName, customer.CustomerName)
	}

	templateVersion := tplDetail.Version
	fileData, err := s.oss.Download(ctx, templateVersion.OssObjectKey)
	if err != nil {
		return nil, fmt.Errorf("copy template docx failed: %w", err)
	}

	now := time.Now()
	contractID := nextID()
	versionID := nextID()
	customerID := customer.ID
	templateID := tplDetail.Template.ID
	objectKey := fmt.Sprintf("contracts/%d/v1/%d.docx", contractID, versionID)

	ossURL, err := s.oss.UploadBytes(ctx, objectKey, fileData, docxContentType)
	if err != nil {
		return nil, fmt.Errorf("upload contract docx failed: %w", err)
	}

	parsedJSON := templateVersion.DocumentContent
	if strings.TrimSpace(parsedJSON) == "" {
		parsedData, parseErr := s.docEngine.Parse(ctx, templateVersion.FileName, fileData)
		if parseErr != nil {
			_ = s.oss.DeleteObject(ctx, objectKey)
			return nil, fmt.Errorf("%w: %v", ErrDocParseFailed, parseErr)
		}
		bytes, marshalErr := json.Marshal(parsedData)
		if marshalErr != nil {
			_ = s.oss.DeleteObject(ctx, objectKey)
			return nil, marshalErr
		}
		parsedJSON = string(bytes)
	}

	fileHash := sha256.Sum256(fileData)
	hash := hex.EncodeToString(fileHash[:])

	contract := &model.Contract{
		ID:              contractID,
		ContractNo:      generateContractNo(),
		ContractName:    contractName,
		OwnerUserID:     input.UserID,
		CustomerID:      &customerID,
		TemplateID:      &templateID,
		CustomerName:    customer.CustomerName,
		CustomerPhone:   customer.Phone,
		CustomerAddress: customer.Address,
		Status:          0,
		CurrentVersionNo: 1,
		Description:     fmt.Sprintf("由模板「%s」创建", tplDetail.Template.TemplateName),
		CreateTime:      now,
		UpdateTime:      now,
	}

	version := &model.ContractVersion{
		ID:              versionID,
		ContractID:      contractID,
		VersionNo:       1,
		CreatedBy:       input.UserID,
		OssObjectKey:    objectKey,
		OssURL:          ossURL,
		FileName:        templateVersion.FileName,
		FileSize:        int64(len(fileData)),
		FileHash:        hash,
		DocumentContent: parsedJSON,
		ChangeSummary:   "从模板创建",
		CreateTime:      now,
	}

	audit := &model.ContractAuditLog{
		ID:            nextID(),
		ContractID:    contractID,
		UserID:        input.UserID,
		OperatorName:  input.Username,
		OperationType: "CREATE_FROM_TEMPLATE",
		OperationDesc: fmt.Sprintf("为客户「%s」从模板「%s」创建合同", customer.CustomerName, tplDetail.Template.TemplateName),
		VersionID:     versionID,
		IPAddress:     input.ClientIP,
		UserAgent:     input.UserAgent,
		CreateTime:    now,
	}

	if err := s.contracts.CreateContractWithVersion(ctx, contract, version, audit); err != nil {
		_ = s.oss.DeleteObject(ctx, objectKey)
		return nil, fmt.Errorf("save contract failed: %w", err)
	}

	return &CreateContractResult{
		ContractID:       contractID,
		ContractNo:       contract.ContractNo,
		ContractName:     contract.ContractName,
		Status:           contract.Status,
		StatusText:       contractStatusText(contract.Status),
		CurrentVersionID: versionID,
		CurrentVersionNo: 1,
		OssURL:           ossURL,
		FileName:         templateVersion.FileName,
		FileSize:         int64(len(fileData)),
		FileHash:         hash,
	}, nil
}

// PreviewDocx 下载合同 DOCX 用于高保真预览（优先当前版本，回退至 V1 导入文件）。
func (s *ContractService) PreviewDocx(ctx context.Context, contractID, userID int64) ([]byte, string, error) {
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return nil, "", err
	}
	if detail == nil {
		return nil, "", ErrContractNotFound
	}

	objectKey, fileName := resolvePreviewDocxSource(ctx, s.contracts, contractID, detail.Version)
	if objectKey == "" {
		return nil, "", ErrVersionNotFound
	}

	data, err := s.oss.Download(ctx, objectKey)
	if err != nil {
		return nil, "", err
	}
	if fileName == "" {
		fileName = "contract.docx"
	}
	return data, fileName, nil
}

// ExportPngPageItem 单页 PNG 归档信息。
type ExportPngPageItem struct {
	PageNo    int    `json:"page_no"`
	URL       string `json:"url"`
	ObjectKey string `json:"object_key"`
}

// ExportPngInfo PNG 导出归档结果。
type ExportPngInfo struct {
	VersionID  int64               `json:"version_id"`
	VersionNo  int                   `json:"version_no"`
	PageCount  int                   `json:"page_count"`
	Hash       string              `json:"hash"`
	ExportedAt time.Time           `json:"exported_at"`
	Pages      []ExportPngPageItem `json:"pages"`
}

// UploadExportPng 上传浏览器导出的 PNG 并归档到 OSS。
func (s *ContractService) UploadExportPng(
	ctx context.Context,
	contractID, userID int64,
	files [][]byte,
	hash string,
) (*ExportPngInfo, error) {
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return nil, err
	}
	if detail == nil || detail.Version == nil {
		return nil, ErrContractNotFound
	}
	if len(files) == 0 {
		return nil, ErrInvalidContractInput
	}

	version := detail.Version
	prefix := fmt.Sprintf("contracts/%d/v%d/export", contractID, version.VersionNo)
	pages := make([]ExportPngPageItem, 0, len(files))
	for i, data := range files {
		objectKey := fmt.Sprintf("%s/page-%03d.png", prefix, i+1)
		url, err := s.oss.UploadBytes(ctx, objectKey, data, "image/png")
		if err != nil {
			return nil, err
		}
		pages = append(pages, ExportPngPageItem{
			PageNo:    i + 1,
			URL:       url,
			ObjectKey: objectKey,
		})
	}

	exportedAt := time.Now()
	if err := s.contracts.UpdateVersionExportPng(ctx, version.ID, prefix, len(files), hash, exportedAt); err != nil {
		return nil, err
	}

	return &ExportPngInfo{
		VersionID:  version.ID,
		VersionNo:  version.VersionNo,
		PageCount:  len(files),
		Hash:       hash,
		ExportedAt: exportedAt,
		Pages:      pages,
	}, nil
}

// GetExportPng 获取当前版本已归档的 PNG 列表。
func (s *ContractService) GetExportPng(ctx context.Context, contractID, userID int64) (*ExportPngInfo, error) {
	detail, err := s.contracts.GetDetailByOwner(ctx, contractID, userID)
	if err != nil {
		return nil, err
	}
	if detail == nil || detail.Version == nil {
		return nil, ErrContractNotFound
	}
	version := detail.Version
	if version.ExportPngPageCount <= 0 || version.ExportPngOssPrefix == "" {
		return nil, ErrVersionNotFound
	}

	pages := make([]ExportPngPageItem, 0, version.ExportPngPageCount)
	for i := 1; i <= version.ExportPngPageCount; i++ {
		objectKey := fmt.Sprintf("%s/page-%03d.png", version.ExportPngOssPrefix, i)
		pages = append(pages, ExportPngPageItem{
			PageNo:    i,
			URL:       s.oss.PublicURL(objectKey),
			ObjectKey: objectKey,
		})
	}

	exportedAt := time.Time{}
	if version.ExportedAt != nil {
		exportedAt = *version.ExportedAt
	}

	return &ExportPngInfo{
		VersionID:  version.ID,
		VersionNo:  version.VersionNo,
		PageCount:  version.ExportPngPageCount,
		Hash:       version.ExportPngHash,
		ExportedAt: exportedAt,
		Pages:      pages,
	}, nil
}

// generateContractNo 生成合同编号，V1 使用 LSHC + 唯一 ID，保证不重复。
func generateContractNo() string {
	return fmt.Sprintf("LSHC%d", nextID())
}
