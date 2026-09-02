package model

import "time"

// 高保真快照实体类型。
const (
	FidelityEntityContract = 0
	FidelityEntityTemplate = 1
)

// FidelitySnapshot 对应 fidelity_snapshot 表。
type FidelitySnapshot struct {
	ID                  int64
	EntityType          int8
	EntityID            int64
	SnapshotNo          int
	SourceVersionNo     int
	DocumentContent     string
	PreviewPdfOssKey    string
	PreviewPdfHash      string
	PreviewPdfPageCount int
	CreatedByUserID     *int64
	CreatedByName       string
	CreateTime          time.Time
}
