package model

import "time"

// Contract 对应 contract 表。
type Contract struct {
	ID               int64
	ContractNo       string
	ContractName     string
	OwnerUserID      int64
	CustomerID       *int64
	TemplateID       *int64
	CustomerName     string
	CustomerContact  string
	CustomerPhone    string
	CustomerAddress  string
	Status           int8
	CurrentVersionID *int64
	CurrentVersionNo int
	Description      string
	ConfirmedTime    *time.Time
	CompletedTime    *time.Time
	CreateTime       time.Time
	UpdateTime       time.Time
}

// ContractVersion 对应 contract_version 表。
type ContractVersion struct {
	ID              int64
	ContractID      int64
	VersionNo       int
	CreatedBy       int64
	CreatedByName   string // 非表字段，列表查询时通过 join 填充
	CollaboratorID  *int64
	OssObjectKey    string
	OssURL          string
	FileName        string
	FileSize        int64
	FileHash        string
	DocumentContent string
	ChangeSummary   string
	ExportPngOssPrefix string
	ExportPngPageCount int
	ExportPngHash      string
	ExportedAt         *time.Time
	ExportPdfOssKey    string
	ExportPdfHash      string
	ExportPdfPageCount int
	PdfExportedAt      *time.Time
	VerifyCode         string
	CreateTime         time.Time
}

// VerifyContractRow 扫码验真查询结果（版本 + 合同主信息）。
type VerifyContractRow struct {
	ContractID       int64
	ContractNo       string
	ContractName     string
	ContractStatus   int8
	ConfirmedTime    *time.Time
	VersionID        int64
	VersionNo        int
	ExportPdfOssKey  string
	ExportPdfHash    string
	ExportPdfPageCount int
	PdfExportedAt    *time.Time
	VerifyCode       string
}

// ContractDetail 合同详情，包含合同主信息及其当前版本信息。
type ContractDetail struct {
	Contract Contract
	Version  *ContractVersion
}

// ContractChange 对应 contract_change 表，记录版本之间的变更。
type ContractChange struct {
	ID             int64
	ContractID     int64
	FromVersionID  int64
	ToVersionID    int64
	OperatorUserID int64
	CollaboratorID *int64
	OperatorName   string // 非表字段，列表查询时通过 join 填充
	ChangeType     int8
	BlockID        string
	ClauseNo       string
	OldContent     string
	NewContent     string
	ChangeReason   string
	CreateTime     time.Time
}

// ContractAuditLog 对应 contract_audit_log 表，用于记录创建合同等关键操作。
type ContractAuditLog struct {
	ID             int64
	ContractID     int64
	UserID         int64
	CollaboratorID *int64
	OperatorName   string
	OperationType  string
	OperationDesc  string
	VersionID      int64
	IPAddress      string
	UserAgent      string
	CreateTime     time.Time
}
