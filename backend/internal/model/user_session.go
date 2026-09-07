package model

import "time"

// UserSession 对应 user_session 表。
type UserSession struct {
	ID           int64
	UserID       int64
	SessionToken string
	LoginIP      string
	UserAgent    string
	DeviceLabel  string
	Status       int8 // 1有效 0失效
	LoginTime    time.Time
	LastSeenTime *time.Time
	RevokeTime   *time.Time
	RevokeReason string
}

// 会话状态。
const (
	SessionStatusActive  int8 = 1
	SessionStatusRevoked int8 = 0
)

// 会话失效原因。
const (
	SessionRevokeReplaced = "replaced"
	SessionRevokeLogout   = "logout"
	SessionRevokeBan      = "ban"
)

// UserLoginLog 对应 user_login_log 表。
type UserLoginLog struct {
	ID          int64
	UserID      int64
	SessionID   *int64
	LoginIP     string
	UserAgent   string
	DeviceLabel string
	LoginTime   time.Time
	Result      int8 // 1成功 0失败
	FailReason  string
}
