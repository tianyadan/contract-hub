package model

import "time"

// SysUser 对应 sys_user 表。
type SysUser struct {
	ID            int64
	Username      string
	Password      string
	Nickname      string
	Phone         string
	Email         string
	AvatarURL     string
	Status        int8 // 0封禁 1正常 2软删除
	Role          int8 // 0普通 1管理员
	LastLoginTime   *time.Time
	LastLoginIP     string
	LastLoginDevice string
	CreateTime      time.Time
	UpdateTime      time.Time
}

// 用户状态常量。
const (
	UserStatusBanned  int8 = 0
	UserStatusActive  int8 = 1
	UserStatusDeleted int8 = 2
)

// 用户角色常量。
const (
	UserRoleNormal int8 = 0
	UserRoleAdmin  int8 = 1
)

// InviteCode 对应 invite_code 表。
type InviteCode struct {
	ID           int64
	Code         string
	CreatedBy    int64
	ExpireAt     time.Time
	UsedAt       *time.Time
	UsedByUserID *int64
	CreateTime   time.Time
}
