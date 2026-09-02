package repository

import (
	"context"
	"database/sql"
	"errors"

	"github.com/lshc/contract-hub/backend/internal/model"
)

// FidelityRepository 高保真快照数据访问。
type FidelityRepository struct {
	db *sql.DB
}

// NewFidelityRepository 创建高保真快照仓库。
func NewFidelityRepository(db *sql.DB) *FidelityRepository {
	return &FidelityRepository{db: db}
}

// ListByEntity 按实体查询快照列表（时间倒序）。
func (r *FidelityRepository) ListByEntity(ctx context.Context, entityType int8, entityID int64) ([]model.FidelitySnapshot, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, entity_type, entity_id, snapshot_no, source_version_no,
		       document_content, preview_pdf_oss_key, preview_pdf_hash, preview_pdf_page_count,
		       created_by_user_id, created_by_name, create_time
		FROM fidelity_snapshot
		WHERE entity_type = ? AND entity_id = ?
		ORDER BY create_time DESC, id DESC
	`, entityType, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]model.FidelitySnapshot, 0)
	for rows.Next() {
		var item model.FidelitySnapshot
		var createdBy sql.NullInt64
		if err := rows.Scan(
			&item.ID, &item.EntityType, &item.EntityID, &item.SnapshotNo, &item.SourceVersionNo,
			&item.DocumentContent, &item.PreviewPdfOssKey, &item.PreviewPdfHash, &item.PreviewPdfPageCount,
			&createdBy, &item.CreatedByName, &item.CreateTime,
		); err != nil {
			return nil, err
		}
		if createdBy.Valid {
			v := createdBy.Int64
			item.CreatedByUserID = &v
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// GetByID 按 ID 与实体查询单条快照。
func (r *FidelityRepository) GetByID(ctx context.Context, entityType int8, entityID, snapshotID int64) (*model.FidelitySnapshot, error) {
	var item model.FidelitySnapshot
	var createdBy sql.NullInt64
	err := r.db.QueryRowContext(ctx, `
		SELECT id, entity_type, entity_id, snapshot_no, source_version_no,
		       document_content, preview_pdf_oss_key, preview_pdf_hash, preview_pdf_page_count,
		       created_by_user_id, created_by_name, create_time
		FROM fidelity_snapshot
		WHERE id = ? AND entity_type = ? AND entity_id = ?
	`, snapshotID, entityType, entityID).Scan(
		&item.ID, &item.EntityType, &item.EntityID, &item.SnapshotNo, &item.SourceVersionNo,
		&item.DocumentContent, &item.PreviewPdfOssKey, &item.PreviewPdfHash, &item.PreviewPdfPageCount,
		&createdBy, &item.CreatedByName, &item.CreateTime,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if createdBy.Valid {
		v := createdBy.Int64
		item.CreatedByUserID = &v
	}
	return &item, nil
}

// CountByEntity 统计实体下快照数量。
func (r *FidelityRepository) CountByEntity(ctx context.Context, entityType int8, entityID int64) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM fidelity_snapshot WHERE entity_type = ? AND entity_id = ?
	`, entityType, entityID).Scan(&count)
	return count, err
}

// GetOldestByEntity 获取最旧一条快照（FIFO 淘汰用）。
func (r *FidelityRepository) GetOldestByEntity(ctx context.Context, entityType int8, entityID int64) (*model.FidelitySnapshot, error) {
	var item model.FidelitySnapshot
	var createdBy sql.NullInt64
	err := r.db.QueryRowContext(ctx, `
		SELECT id, entity_type, entity_id, snapshot_no, source_version_no,
		       document_content, preview_pdf_oss_key, preview_pdf_hash, preview_pdf_page_count,
		       created_by_user_id, created_by_name, create_time
		FROM fidelity_snapshot
		WHERE entity_type = ? AND entity_id = ?
		ORDER BY create_time ASC, id ASC
		LIMIT 1
	`, entityType, entityID).Scan(
		&item.ID, &item.EntityType, &item.EntityID, &item.SnapshotNo, &item.SourceVersionNo,
		&item.DocumentContent, &item.PreviewPdfOssKey, &item.PreviewPdfHash, &item.PreviewPdfPageCount,
		&createdBy, &item.CreatedByName, &item.CreateTime,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if createdBy.Valid {
		v := createdBy.Int64
		item.CreatedByUserID = &v
	}
	return &item, nil
}

// DeleteByID 删除快照记录。
func (r *FidelityRepository) DeleteByID(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM fidelity_snapshot WHERE id = ?`, id)
	return err
}

// NextSnapshotNo 获取实体内下一个快照序号。
func (r *FidelityRepository) NextSnapshotNo(ctx context.Context, entityType int8, entityID int64) (int, error) {
	var maxNo sql.NullInt64
	err := r.db.QueryRowContext(ctx, `
		SELECT MAX(snapshot_no) FROM fidelity_snapshot WHERE entity_type = ? AND entity_id = ?
	`, entityType, entityID).Scan(&maxNo)
	if err != nil {
		return 0, err
	}
	if !maxNo.Valid {
		return 1, nil
	}
	return int(maxNo.Int64) + 1, nil
}

// Create 插入快照记录。
func (r *FidelityRepository) Create(ctx context.Context, snap *model.FidelitySnapshot) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO fidelity_snapshot (
			id, entity_type, entity_id, snapshot_no, source_version_no,
			document_content, preview_pdf_oss_key, preview_pdf_hash, preview_pdf_page_count,
			created_by_user_id, created_by_name, create_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, snap.ID, snap.EntityType, snap.EntityID, snap.SnapshotNo, snap.SourceVersionNo,
		snap.DocumentContent, snap.PreviewPdfOssKey, snap.PreviewPdfHash, snap.PreviewPdfPageCount,
		nullInt64(snap.CreatedByUserID), snap.CreatedByName, snap.CreateTime)
	return err
}

func nullInt64(v *int64) sql.NullInt64 {
	if v == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: *v, Valid: true}
}
