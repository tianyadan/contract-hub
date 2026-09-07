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
	"unicode/utf8"

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
	ErrVersionConflict      = errors.New("文档版本冲突，请选择冲突区域保留内容")
	ErrVersionRace          = errors.New("保存时版本已被他人更新，请重试")
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
	// BaseVersionID 客户端加载时的当前版本 ID；用于乐观锁与三方合并。
	BaseVersionID int64
}

// SaveVersionResult 保存新版本返回结果。
type SaveVersionResult struct {
	ContractID  int64     `json:"contract_id"`
	VersionID   int64     `json:"version_id"`
	VersionNo   int       `json:"version_no"`
	ChangeCount int       `json:"change_count"`
	CreateTime  time.Time `json:"create_time"`
	AutoMerged  bool      `json:"auto_merged,omitempty"`
}

// VersionConflictPayload 版本冲突详情（HTTP 409 / code 40901）。
type VersionConflictPayload struct {
	CurrentVersionID int64                         `json:"current_version_id"`
	CurrentVersionNo int                           `json:"current_version_no"`
	BaseVersionID    int64                         `json:"base_version_id"`
	MergedDocument   map[string]interface{}        `json:"merged_document"`
	Conflicts        []documentdiff.BlockConflict  `json:"conflicts"`
}

// VersionConflictError 带冲突载荷的业务错误。
type VersionConflictError struct {
	Payload VersionConflictPayload
}

func (e *VersionConflictError) Error() string {
	return ErrVersionConflict.Error()
}

func (e *VersionConflictError) Unwrap() error {
	return ErrVersionConflict
}

// SaveVersion 保存新版本：乐观锁 + 块级三方合并（无冲突自动合并，有冲突返回 409）。
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

	normalizeWebCanvasDocument(input.DocumentContent)
	normalizeDocumentSeals(input.DocumentContent, input.ContractID)

	currentVersionID := int64(0)
	currentVersionNo := detail.Contract.CurrentVersionNo
	oldDocJSON := ""
	if detail.Version != nil {
		currentVersionID = detail.Version.ID
		oldDocJSON = detail.Version.DocumentContent
	}

	docToSave := input.DocumentContent
	autoMerged := false
	baseID := input.BaseVersionID

	// 客户端声明了基础版本且与服务端当前不一致 → 三方合并
	if baseID > 0 && currentVersionID > 0 && baseID != currentVersionID {
		merged, conflictErr := s.buildVersionConflictOrMerge(
			ctx, input.ContractID, baseID, currentVersionID, currentVersionNo, input.DocumentContent, oldDocJSON,
		)
		if conflictErr != nil {
			return nil, conflictErr
		}
		docToSave = merged
		autoMerged = true
		normalizeWebCanvasDocument(docToSave)
		normalizeDocumentSeals(docToSave, input.ContractID)
	} else if baseID == 0 && currentVersionID > 0 {
		// 兼容旧客户端：不强制 base，但仍 CAS 到当前版本
		baseID = currentVersionID
	}
	normalizeDocumentSeals(docToSave, input.ContractID)

	return s.persistNewVersion(
		ctx,
		persistVersionParams{
			ContractID:           input.ContractID,
			UserID:               input.UserID,
			CollaboratorID:       nil,
			OperatorName:         input.Username,
			DocumentContent:      docToSave,
			OldDocJSON:           oldDocJSON,
			ExpectedCurrentID:    currentVersionID,
			CurrentVersionNo:     currentVersionNo,
			SourceVersionID:      baseID,
			ChangeSummary:        input.ChangeSummary,
			ClientIP:             input.ClientIP,
			UserAgent:            input.UserAgent,
			PreviousVersion:      detail.Version,
			SavedByRole:          "owner",
			AutoMerged:           autoMerged,
		},
	)
}

// buildVersionConflictOrMerge 加载 base，与 ours/theirs 合并；有冲突则返回 VersionConflictError。
func (s *ContractService) buildVersionConflictOrMerge(
	ctx context.Context,
	contractID, baseVersionID, currentVersionID int64,
	currentVersionNo int,
	oursDoc map[string]interface{},
	theirsJSON string,
) (map[string]interface{}, error) {
	baseVersion, err := s.contracts.GetVersionByID(ctx, contractID, baseVersionID)
	if err != nil {
		return nil, err
	}
	if baseVersion == nil {
		return nil, ErrVersionNotFound
	}

	var baseRaw map[string]interface{}
	if strings.TrimSpace(baseVersion.DocumentContent) != "" {
		if err := json.Unmarshal([]byte(baseVersion.DocumentContent), &baseRaw); err != nil {
			return nil, fmt.Errorf("parse base document: %w", err)
		}
	}
	var theirsRaw map[string]interface{}
	if strings.TrimSpace(theirsJSON) != "" {
		if err := json.Unmarshal([]byte(theirsJSON), &theirsRaw); err != nil {
			return nil, fmt.Errorf("parse server document: %w", err)
		}
	}

	mergeResult, err := documentdiff.ThreeWayMergeMaps(baseRaw, oursDoc, theirsRaw)
	if err != nil {
		return nil, fmt.Errorf("three-way merge: %w", err)
	}
	if len(mergeResult.Conflicts) > 0 {
		return nil, &VersionConflictError{
			Payload: VersionConflictPayload{
				CurrentVersionID: currentVersionID,
				CurrentVersionNo: currentVersionNo,
				BaseVersionID:    baseVersionID,
				MergedDocument:   mergeResult.Merged,
				Conflicts:        mergeResult.Conflicts,
			},
		}
	}
	return mergeResult.Merged, nil
}

type persistVersionParams struct {
	ContractID        int64
	UserID            int64
	CollaboratorID    *int64
	OperatorName      string
	DocumentContent   map[string]interface{}
	OldDocJSON        string
	ExpectedCurrentID int64
	CurrentVersionNo  int
	SourceVersionID   int64
	ChangeSummary     string
	ClientIP          string
	UserAgent         string
	PreviousVersion   *model.ContractVersion
	SavedByRole       string
	AutoMerged        bool
}

// persistNewVersion 写入新版本（含 CAS）。
func (s *ContractService) persistNewVersion(ctx context.Context, p persistVersionParams) (*SaveVersionResult, error) {
	now := time.Now()
	fromVersionID := p.ExpectedCurrentID

	diffRecords, err := documentdiff.CompareJSON(p.OldDocJSON, p.DocumentContent)
	if err != nil {
		return nil, fmt.Errorf("compare document versions: %w", err)
	}

	newVersionNo := p.CurrentVersionNo + 1
	newVersionID := nextID()
	newDocJSON, err := json.Marshal(p.DocumentContent)
	if err != nil {
		return nil, err
	}

	var sourceID *int64
	if p.SourceVersionID > 0 {
		id := p.SourceVersionID
		sourceID = &id
	}

	version := &model.ContractVersion{
		ID:              newVersionID,
		ContractID:      p.ContractID,
		VersionNo:       newVersionNo,
		CreatedBy:       p.UserID,
		CollaboratorID:  p.CollaboratorID,
		SourceVersionID: sourceID,
		DocumentContent: string(newDocJSON),
		ChangeSummary:   strings.TrimSpace(p.ChangeSummary),
		CreateTime:      now,
	}
	inheritVersionFileMeta(version, p.PreviousVersion)

	operatorName := strings.TrimSpace(p.OperatorName)
	if operatorName == "" {
		operatorName = "用户"
	}

	audit := &model.ContractAuditLog{
		ID:             nextID(),
		ContractID:     p.ContractID,
		UserID:         p.UserID,
		CollaboratorID: p.CollaboratorID,
		OperatorName:   operatorName,
		OperationType:  "CREATE_VERSION",
		OperationDesc:  fmt.Sprintf("创建合同版本 V%d", newVersionNo),
		VersionID:      newVersionID,
		IPAddress:      p.ClientIP,
		UserAgent:      p.UserAgent,
		CreateTime:     now,
	}

	changes := buildContractChangesFromDiff(
		p.ContractID, fromVersionID, newVersionID, p.UserID, p.CollaboratorID, diffRecords, now,
	)

	if err := s.contracts.CreateVersionWithChanges(
		ctx, p.ContractID, version, changes, audit, p.ExpectedCurrentID,
	); err != nil {
		if errors.Is(err, repository.ErrVersionCASFailed) {
			return nil, ErrVersionRace
		}
		return nil, err
	}

	if s.broadcaster != nil {
		s.broadcaster.BroadcastVersionSaved(p.ContractID, collab.VersionSavedPayload{
			VersionID:   newVersionID,
			VersionNo:   newVersionNo,
			SavedBy:     operatorName,
			SavedByRole: p.SavedByRole,
		})
	}

	return &SaveVersionResult{
		ContractID:  p.ContractID,
		VersionID:   newVersionID,
		VersionNo:   newVersionNo,
		ChangeCount: len(changes),
		CreateTime:  now,
		AutoMerged:  p.AutoMerged,
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

// stripDocumentSeals 移除文档中的电子章配置（确认锁定后清理；协作期保留）。
func stripDocumentSeals(doc map[string]interface{}) {
	if doc == nil {
		return
	}
	delete(doc, "seals")
}

// normalizeDocumentSeals 持久化前清洗 seals：仅保留合同级 oss_key，去掉 token/blob 直链。
func normalizeDocumentSeals(doc map[string]interface{}, contractID int64) {
	if doc == nil {
		return
	}
	raw, ok := doc["seals"]
	if !ok || raw == nil {
		return
	}
	list, ok := raw.([]interface{})
	if !ok {
		delete(doc, "seals")
		return
	}
	prefix := contractSealKeyPrefix(contractID)
	out := make([]interface{}, 0, len(list))
	for _, item := range list {
		m, ok := item.(map[string]interface{})
		if !ok || m == nil {
			continue
		}
		ossKey, _ := m["oss_key"].(string)
		ossKey = strings.TrimSpace(ossKey)
		if ossKey == "" || !strings.HasPrefix(ossKey, prefix) {
			continue
		}
		if err := validateContractSealKey(contractID, ossKey); err != nil {
			continue
		}
		cleaned := map[string]interface{}{
			"id":         stringifySealField(m["id"]),
			"oss_key":    ossKey,
			"page_index": toIntSeal(m["page_index"]),
			"x_ratio":    toFloatSeal(m["x_ratio"], 0.5),
			"y_ratio":    toFloatSeal(m["y_ratio"], 0.5),
			"scale":      toFloatSeal(m["scale"], 1),
			"image_url":  "", // 展示时由前后端按 oss_key 拼代理地址
		}
		if id := cleaned["id"].(string); id == "" {
			cleaned["id"] = fmt.Sprintf("seal-%d", time.Now().UnixNano())
		}
		if v, ok := m["rotate"]; ok {
			cleaned["rotate"] = v
		}
		if v, ok := m["placed_by"].(string); ok && v != "" {
			cleaned["placed_by"] = v
		}
		if v, ok := m["placed_at"].(string); ok && v != "" {
			cleaned["placed_at"] = v
		}
		out = append(out, cleaned)
	}
	if len(out) == 0 {
		delete(doc, "seals")
		return
	}
	doc["seals"] = out
}

func stringifySealField(v interface{}) string {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case float64:
		return fmt.Sprintf("%.0f", t)
	default:
		return ""
	}
}

func toIntSeal(v interface{}) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case int:
		return t
	case int64:
		return int(t)
	case json.Number:
		i, _ := t.Int64()
		return int(i)
	default:
		return 0
	}
}

func toFloatSeal(v interface{}, fallback float64) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case int:
		return float64(t)
	case int64:
		return float64(t)
	case json.Number:
		f, err := t.Float64()
		if err == nil {
			return f
		}
	}
	return fallback
}

// StripSealsFromContractVersions 确认锁定后清除各版本 document_content.seals，防章泄露。
func (s *ContractService) StripSealsFromContractVersions(ctx context.Context, contractID int64) error {
	return s.contracts.StripSealsFromAllVersions(ctx, contractID)
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

// RenameContract 重命名合同（仅元数据）。
func (s *ContractService) RenameContract(ctx context.Context, contractID, userID int64, name, username, clientIP, userAgent string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("%w: 合同名称不能为空", ErrInvalidContractInput)
	}
	if utf8.RuneCountInString(name) > 128 {
		return fmt.Errorf("%w: 合同名称不能超过 128 字", ErrInvalidContractInput)
	}
	affected, err := s.contracts.UpdateContractNameByOwner(ctx, contractID, userID, name)
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrContractNotFound
	}
	now := time.Now()
	_ = s.contracts.InsertAuditLog(ctx, &model.ContractAuditLog{
		ID:            nextID(),
		ContractID:    contractID,
		UserID:        userID,
		OperatorName:  username,
		OperationType: "RENAME_CONTRACT",
		OperationDesc: fmt.Sprintf("重命名合同为「%s」", name),
		IPAddress:     clientIP,
		UserAgent:     userAgent,
		CreateTime:    now,
	})
	return nil
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
