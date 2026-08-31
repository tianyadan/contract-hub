package model

import "time"

// ContractShare 对应 contract_share 表。
type ContractShare struct {
	ID             int64
	ContractID     int64
	CreatorUserID  int64
	ShareToken     string
	Permission     int8 // 0只读 1可编辑
	Status         int8 // 0失效 1有效
	ExpireTime     *time.Time
	AccessCount    int
	MaxAccessCount *int
	LastAccessTime *time.Time
	CreateTime     time.Time
	UpdateTime     time.Time
}

// ContractCollaborator 对应 contract_collaborator 表。
type ContractCollaborator struct {
	ID               int64
	ContractID       int64
	UserID           *int64
	Name             string
	Phone            string
	Email            string
	CollaboratorType int8 // 0内部成员 1外部客户
	Permission       int8 // 0只读 1可编辑
	Status           int8 // 0禁用 1正常
	FirstAccessTime  *time.Time
	LastAccessTime   *time.Time
	CreateTime       time.Time
	UpdateTime       time.Time
}

// ContractConfirmation 对应 contract_confirmation 表。
type ContractConfirmation struct {
	ID             int64     `json:"id"`
	ContractID     int64     `json:"contract_id"`
	VersionID      int64     `json:"version_id"`
	UserID         *int64    `json:"user_id"`
	CollaboratorID *int64    `json:"collaborator_id"`
	ConfirmerName  string    `json:"confirmer_name"`
	ConfirmerType  int8      `json:"confirmer_type"` // 0内部用户 1外部协作者
	ConfirmStatus  int8      `json:"confirm_status"` // 0取消确认 1已确认
	ConfirmIP      string    `json:"confirm_ip"`
	UserAgent      string    `json:"user_agent"`
	ConfirmTime    time.Time `json:"confirm_time"`
	CreateTime     time.Time `json:"create_time"`
}
