package repository

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/lshc/contract-hub/backend/internal/model"
)

// TemplateRepository 合同模板数据访问。
type TemplateRepository struct {
	db *sql.DB
}

// NewTemplateRepository 创建模板仓库。
func NewTemplateRepository(db *sql.DB) *TemplateRepository {
	return &TemplateRepository{db: db}
}

// TemplateListFilter 模板列表过滤。
type TemplateListFilter struct {
	OwnerUserID int64
	Keyword     string
	Limit       int
	Offset      int
}

// CreateTemplateWithVersion 创建模板及首版本。
func (r *TemplateRepository) CreateTemplateWithVersion(
	ctx context.Context,
	tpl *model.ContractTemplate,
	version *model.ContractTemplateVersion,
) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO contract_template (
			id, owner_user_id, template_name, original_file_name,
			status, current_version_id, current_version_no,
			description, create_time, update_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, tpl.ID, tpl.OwnerUserID, tpl.TemplateName, tpl.OriginalFileName,
		tpl.Status, tpl.CurrentVersionID, tpl.CurrentVersionNo,
		nullString(tpl.Description), tpl.CreateTime, tpl.UpdateTime)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO contract_template_version (
			id, template_id, version_no, created_by,
			oss_object_key, oss_url, file_name, file_size, file_hash,
			document_content, change_summary, create_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, version.ID, version.TemplateID, version.VersionNo, version.CreatedBy,
		version.OssObjectKey, version.OssURL, version.FileName, version.FileSize, version.FileHash,
		nullString(version.DocumentContent), nullString(version.ChangeSummary), version.CreateTime)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE contract_template SET current_version_id = ? WHERE id = ?
	`, version.ID, tpl.ID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// CountTemplates 统计模板数量。
func (r *TemplateRepository) CountTemplates(ctx context.Context, filter TemplateListFilter) (int64, error) {
	where, args := buildTemplateWhere(filter)
	var total int64
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM contract_template "+where, args...).Scan(&total)
	return total, err
}

// ListTemplates 分页查询模板列表。
func (r *TemplateRepository) ListTemplates(ctx context.Context, filter TemplateListFilter) ([]model.ContractTemplate, error) {
	where, args := buildTemplateWhere(filter)
	args = append(args, filter.Limit, filter.Offset)

	rows, err := r.db.QueryContext(ctx, `
		SELECT id, owner_user_id, template_name, original_file_name,
		       status, current_version_id, current_version_no,
		       description, create_time, update_time
		FROM contract_template `+where+`
		ORDER BY update_time DESC, id DESC
		LIMIT ? OFFSET ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]model.ContractTemplate, 0)
	for rows.Next() {
		var t model.ContractTemplate
		var description sql.NullString
		if err := rows.Scan(
			&t.ID, &t.OwnerUserID, &t.TemplateName, &t.OriginalFileName,
			&t.Status, &t.CurrentVersionID, &t.CurrentVersionNo,
			&description, &t.CreateTime, &t.UpdateTime,
		); err != nil {
			return nil, err
		}
		t.Description = description.String
		list = append(list, t)
	}
	return list, rows.Err()
}

// GetDetailByOwner 查询模板详情（含当前版本）。
func (r *TemplateRepository) GetDetailByOwner(ctx context.Context, templateID, ownerUserID int64) (*model.ContractTemplateDetail, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT
			t.id, t.owner_user_id, t.template_name, t.original_file_name,
			t.status, t.current_version_id, t.current_version_no,
			t.description, t.create_time, t.update_time,
			v.id, v.version_no, v.created_by,
			v.oss_object_key, v.oss_url, v.file_name, v.file_size, v.file_hash,
			v.document_content, v.change_summary, v.create_time
		FROM contract_template t
		LEFT JOIN contract_template_version v ON v.id = t.current_version_id
		WHERE t.id = ? AND t.owner_user_id = ? AND t.status = 1
	`, templateID, ownerUserID)

	var (
		detail      model.ContractTemplateDetail
		t           model.ContractTemplate
		v           model.ContractTemplateVersion
		description sql.NullString
		versionID   sql.NullInt64
		versionNo   sql.NullInt64
		createdBy   sql.NullInt64
		ossKey      sql.NullString
		ossURL      sql.NullString
		fileName    sql.NullString
		fileSize    sql.NullInt64
		fileHash    sql.NullString
		docContent  sql.NullString
		changeSum   sql.NullString
		versionTime sql.NullTime
	)

	err := row.Scan(
		&t.ID, &t.OwnerUserID, &t.TemplateName, &t.OriginalFileName,
		&t.Status, &t.CurrentVersionID, &t.CurrentVersionNo,
		&description, &t.CreateTime, &t.UpdateTime,
		&versionID, &versionNo, &createdBy,
		&ossKey, &ossURL, &fileName, &fileSize, &fileHash,
		&docContent, &changeSum, &versionTime,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	t.Description = description.String
	detail.Template = t

	if versionID.Valid {
		v.ID = versionID.Int64
		v.TemplateID = t.ID
		v.VersionNo = int(versionNo.Int64)
		v.CreatedBy = createdBy.Int64
		v.OssObjectKey = ossKey.String
		v.OssURL = ossURL.String
		v.FileName = fileName.String
		v.FileSize = fileSize.Int64
		v.FileHash = fileHash.String
		v.DocumentContent = docContent.String
		v.ChangeSummary = changeSum.String
		if versionTime.Valid {
			v.CreateTime = versionTime.Time
		}
		detail.Version = &v
	}
	return &detail, nil
}

// UpdateTemplateMeta 更新模板名称与说明。
func (r *TemplateRepository) UpdateTemplateMeta(ctx context.Context, templateID, ownerUserID int64, name, description string) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE contract_template
		SET template_name = ?, description = ?
		WHERE id = ? AND owner_user_id = ? AND status = 1
	`, name, nullString(description), templateID, ownerUserID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// SoftDeleteTemplate 软删除模板。
func (r *TemplateRepository) SoftDeleteTemplate(ctx context.Context, templateID, ownerUserID int64) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE contract_template SET status = 0
		WHERE id = ? AND owner_user_id = ? AND status = 1
	`, templateID, ownerUserID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// CountTemplateUsage 统计引用该模板的合同数量。
func (r *TemplateRepository) CountTemplateUsage(ctx context.Context, templateID int64) (int64, error) {
	var total int64
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM contract WHERE template_id = ?
	`, templateID).Scan(&total)
	return total, err
}

// CreateTemplateVersion 保存模板新版本并更新当前版本指针。
func (r *TemplateRepository) CreateTemplateVersion(
	ctx context.Context,
	templateID int64,
	version *model.ContractTemplateVersion,
	newVersionNo int,
) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO contract_template_version (
			id, template_id, version_no, created_by,
			oss_object_key, oss_url, file_name, file_size, file_hash,
			document_content, change_summary, create_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, version.ID, version.TemplateID, version.VersionNo, version.CreatedBy,
		version.OssObjectKey, version.OssURL, version.FileName, version.FileSize, version.FileHash,
		nullString(version.DocumentContent), nullString(version.ChangeSummary), version.CreateTime)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE contract_template
		SET current_version_id = ?, current_version_no = ?
		WHERE id = ?
	`, version.ID, newVersionNo, templateID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func buildTemplateWhere(filter TemplateListFilter) (string, []interface{}) {
	sb := strings.Builder{}
	sb.WriteString("WHERE owner_user_id = ? AND status = 1")
	args := []interface{}{filter.OwnerUserID}
	if filter.Keyword != "" {
		sb.WriteString(" AND (template_name LIKE ? OR original_file_name LIKE ?)")
		like := "%" + filter.Keyword + "%"
		args = append(args, like, like)
	}
	return sb.String(), args
}
