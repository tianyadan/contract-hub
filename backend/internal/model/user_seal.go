package model

import "time"

// UserSealAsset 对应用户电子章库表 user_seal_asset。
type UserSealAsset struct {
	ID         int64
	UserID     int64
	Name       string
	OssKey     string
	FileURL    string
	MimeType   string
	FileSize   int
	WidthPx    int
	HeightPx   int
	IsDefault  bool
	Status     int8 // 1 正常 0 软删
	CreateTime time.Time
	UpdateTime time.Time
}
