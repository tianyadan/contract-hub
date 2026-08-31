package model

import "time"

// Customer 对应 customer 表。
type Customer struct {
	ID           int64
	OwnerUserID  int64
	CustomerName string
	Phone        string
	Address      string
	BusinessType string
	Status       int8
	Remark       string
	CreateTime   time.Time
	UpdateTime   time.Time
}

// ContractTemplate 对应 contract_template 表。
type ContractTemplate struct {
	ID               int64
	OwnerUserID      int64
	TemplateName     string
	OriginalFileName string
	Status           int8
	CurrentVersionID *int64
	CurrentVersionNo int
	Description      string
	CreateTime       time.Time
	UpdateTime       time.Time
}

// ContractTemplateVersion 对应 contract_template_version 表。
type ContractTemplateVersion struct {
	ID              int64
	TemplateID      int64
	VersionNo       int
	CreatedBy       int64
	OssObjectKey    string
	OssURL          string
	FileName        string
	FileSize        int64
	FileHash        string
	DocumentContent string
	ChangeSummary   string
	CreateTime      time.Time
}

// ContractTemplateDetail 模板详情，含当前版本。
type ContractTemplateDetail struct {
	Template ContractTemplate
	Version  *ContractTemplateVersion
}
