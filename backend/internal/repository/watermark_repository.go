package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/lshc/contract-hub/backend/internal/model"
)

// WatermarkRepository 负责 user_watermark_setting 表访问。
type WatermarkRepository struct {
	db *sql.DB
}

// NewWatermarkRepository 创建水印设置仓库。
func NewWatermarkRepository(db *sql.DB) *WatermarkRepository {
	return &WatermarkRepository{db: db}
}

// GetByUserID 查询用户水印设置；无记录返回 nil。
func (r *WatermarkRepository) GetByUserID(ctx context.Context, userID int64) (*model.UserWatermarkSetting, error) {
	row := r.db.QueryRowContext(ctx, `
SELECT user_id, enabled, content, density, font_size, rotate, opacity, create_time, update_time
FROM user_watermark_setting
WHERE user_id = ?
`, userID)

	var (
		s       model.UserWatermarkSetting
		enabled int8
	)
	err := row.Scan(
		&s.UserID, &enabled, &s.Content,
		&s.Density, &s.FontSize, &s.Rotate, &s.Opacity,
		&s.CreateTime, &s.UpdateTime,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	s.Enabled = enabled == 1
	return &s, nil
}

// Upsert 插入或更新用户水印设置。
func (r *WatermarkRepository) Upsert(ctx context.Context, setting *model.UserWatermarkSetting) error {
	enabled := int8(0)
	if setting.Enabled {
		enabled = 1
	}
	now := time.Now()
	setting.UpdateTime = now
	if setting.CreateTime.IsZero() {
		setting.CreateTime = now
	}
	_, err := r.db.ExecContext(ctx, `
INSERT INTO user_watermark_setting (
  user_id, enabled, content, density, font_size, rotate, opacity, create_time, update_time
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  enabled = VALUES(enabled),
  content = VALUES(content),
  density = VALUES(density),
  font_size = VALUES(font_size),
  rotate = VALUES(rotate),
  opacity = VALUES(opacity),
  update_time = VALUES(update_time)
`, setting.UserID, enabled, setting.Content,
		setting.Density, setting.FontSize, setting.Rotate, setting.Opacity,
		setting.CreateTime, setting.UpdateTime)
	return err
}
