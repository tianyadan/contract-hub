package model

import "time"

// UserWatermarkSetting 对应用户导出水印设置表。
type UserWatermarkSetting struct {
	UserID     int64
	Enabled    bool
	Content    string
	Density    int // 1-10
	FontSize   int // 12-48 px
	Rotate     int // -60~0 度
	Opacity    int // 5-40 百分比
	CreateTime time.Time
	UpdateTime time.Time
}
