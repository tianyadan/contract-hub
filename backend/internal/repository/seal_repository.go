package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/lshc/contract-hub/backend/internal/model"
)

// SealRepository 负责 user_seal_asset 表访问。
type SealRepository struct {
	db *sql.DB
}

// NewSealRepository 创建电子章仓库。
func NewSealRepository(db *sql.DB) *SealRepository {
	return &SealRepository{db: db}
}

// ListByUser 列出用户未删除的电子章（默认章优先）。
func (r *SealRepository) ListByUser(ctx context.Context, userID int64) ([]model.UserSealAsset, error) {
	rows, err := r.db.QueryContext(ctx, `
SELECT id, user_id, name, oss_key, file_url, mime_type, file_size,
       width_px, height_px, is_default, status, create_time, update_time
FROM user_seal_asset
WHERE user_id = ? AND status = 1
ORDER BY is_default DESC, id DESC
`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []model.UserSealAsset
	for rows.Next() {
		item, scanErr := scanSealAsset(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		list = append(list, *item)
	}
	return list, rows.Err()
}

// CountByUser 统计用户有效章数量。
func (r *SealRepository) CountByUser(ctx context.Context, userID int64) (int64, error) {
	var n int64
	err := r.db.QueryRowContext(ctx, `
SELECT COUNT(1) FROM user_seal_asset WHERE user_id = ? AND status = 1
`, userID).Scan(&n)
	return n, err
}

// GetByIDForUser 按 ID + 用户查询有效章。
func (r *SealRepository) GetByIDForUser(ctx context.Context, id, userID int64) (*model.UserSealAsset, error) {
	row := r.db.QueryRowContext(ctx, `
SELECT id, user_id, name, oss_key, file_url, mime_type, file_size,
       width_px, height_px, is_default, status, create_time, update_time
FROM user_seal_asset
WHERE id = ? AND user_id = ? AND status = 1
`, id, userID)
	return scanSealAsset(row)
}

// Insert 插入电子章并返回 ID。
func (r *SealRepository) Insert(ctx context.Context, asset *model.UserSealAsset) (int64, error) {
	now := time.Now()
	asset.CreateTime = now
	asset.UpdateTime = now
	if asset.Status == 0 {
		asset.Status = 1
	}
	isDefault := int8(0)
	if asset.IsDefault {
		isDefault = 1
	}
	res, err := r.db.ExecContext(ctx, `
INSERT INTO user_seal_asset (
  user_id, name, oss_key, file_url, mime_type, file_size,
  width_px, height_px, is_default, status, create_time, update_time
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, asset.UserID, asset.Name, asset.OssKey, asset.FileURL, asset.MimeType, asset.FileSize,
		asset.WidthPx, asset.HeightPx, isDefault, asset.Status, asset.CreateTime, asset.UpdateTime)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// UpdateMeta 更新名称 / 默认标记。
func (r *SealRepository) UpdateMeta(ctx context.Context, id, userID int64, name string, isDefault bool) error {
	def := int8(0)
	if isDefault {
		def = 1
	}
	_, err := r.db.ExecContext(ctx, `
UPDATE user_seal_asset
SET name = ?, is_default = ?, update_time = ?
WHERE id = ? AND user_id = ? AND status = 1
`, name, def, time.Now(), id, userID)
	return err
}

// ClearDefault 清除用户其他默认章。
func (r *SealRepository) ClearDefault(ctx context.Context, userID int64, exceptID int64) error {
	_, err := r.db.ExecContext(ctx, `
UPDATE user_seal_asset
SET is_default = 0, update_time = ?
WHERE user_id = ? AND status = 1 AND id <> ? AND is_default = 1
`, time.Now(), userID, exceptID)
	return err
}

// SoftDelete 软删除电子章。
func (r *SealRepository) SoftDelete(ctx context.Context, id, userID int64) error {
	_, err := r.db.ExecContext(ctx, `
UPDATE user_seal_asset
SET status = 0, is_default = 0, update_time = ?
WHERE id = ? AND user_id = ? AND status = 1
`, time.Now(), id, userID)
	return err
}

// UpdateFileLocation 更新 OSS 路径与 URL。
func (r *SealRepository) UpdateFileLocation(ctx context.Context, id, userID int64, ossKey, fileURL string) error {
	_, err := r.db.ExecContext(ctx, `
UPDATE user_seal_asset
SET oss_key = ?, file_url = ?, update_time = ?
WHERE id = ? AND user_id = ? AND status = 1
`, ossKey, fileURL, time.Now(), id, userID)
	return err
}

type sealScanner interface {
	Scan(dest ...any) error
}

func scanSealAsset(s sealScanner) (*model.UserSealAsset, error) {
	var (
		a         model.UserSealAsset
		isDefault int8
	)
	err := s.Scan(
		&a.ID, &a.UserID, &a.Name, &a.OssKey, &a.FileURL, &a.MimeType, &a.FileSize,
		&a.WidthPx, &a.HeightPx, &isDefault, &a.Status, &a.CreateTime, &a.UpdateTime,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	a.IsDefault = isDefault == 1
	return &a, nil
}
