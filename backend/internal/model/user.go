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
	Status        int8
	LastLoginTime *time.Time
	LastLoginIP   string
	CreateTime    time.Time
	UpdateTime    time.Time
}
