package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/lshc/contract-hub/backend/internal/model"
)

// ErrVersionCASFailed 并发保存时 current_version_id 已变化。
var ErrVersionCASFailed = errors.New("version cas failed")

// ContractRepository 负责合同相关表的数据访问。
type ContractRepository struct {
	db *sql.DB
}

// NewContractRepository 创建合同仓库。
func NewContractRepository(db *sql.DB) *ContractRepository {
	return &ContractRepository{db: db}
}

// CreateContractWithVersion 在同一个事务中创建合同主记录、V1 版本和审计日志。
func (r *ContractRepository) CreateContractWithVersion(
	ctx context.Context,
	contract *model.Contract,
	version *model.ContractVersion,
	audit *model.ContractAuditLog,
) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. 插入合同主记录，current_version_id 先留空，等版本插入后再回填
	_, err = tx.ExecContext(ctx, `
		INSERT INTO contract (
			id, contract_no, contract_name, owner_user_id,
			customer_id, template_id,
			customer_name, customer_contact, customer_phone, customer_address,
			status, current_version_id, current_version_no,
			description, confirmed_time, completed_time,
			create_time, update_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, contract.ID, contract.ContractNo, contract.ContractName, contract.OwnerUserID,
		contract.CustomerID, contract.TemplateID,
		nullString(contract.CustomerName), nullString(contract.CustomerContact), nullString(contract.CustomerPhone), nullString(contract.CustomerAddress),
		contract.Status, contract.CurrentVersionID, contract.CurrentVersionNo,
		nullString(contract.Description), nil, nil,
		contract.CreateTime, contract.UpdateTime)
	if err != nil {
		return err
	}

	// 2. 插入 V1 合同版本
	_, err = tx.ExecContext(ctx, `
		INSERT INTO contract_version (
			id, contract_id, version_no, created_by,
			collaborator_id, source_version_id,
			oss_object_key, oss_url, file_name, file_size, file_hash,
			document_content, change_summary, create_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, version.ID, version.ContractID, version.VersionNo, version.CreatedBy,
		version.CollaboratorID, nil,
		version.OssObjectKey, version.OssURL, version.FileName, version.FileSize, version.FileHash,
		nullString(version.DocumentContent), nullString(version.ChangeSummary), version.CreateTime)
	if err != nil {
		return err
	}

	// 3. 回填合同当前版本 ID
	_, err = tx.ExecContext(ctx, `
		UPDATE contract
		SET current_version_id = ?
		WHERE id = ?
	`, version.ID, contract.ID)
	if err != nil {
		return err
	}

	// 4. 写审计日志
	_, err = tx.ExecContext(ctx, `
		INSERT INTO contract_audit_log (
			id, contract_id, user_id, collaborator_id,
			operator_name, operation_type, operation_desc,
			version_id, ip_address, user_agent,
			extra_data, create_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, audit.ID, audit.ContractID, audit.UserID, audit.CollaboratorID,
		nullString(audit.OperatorName), audit.OperationType, nullString(audit.OperationDesc),
		audit.VersionID, nullString(audit.IPAddress), nullString(audit.UserAgent),
		nil, audit.CreateTime)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// ContractListFilter 合同列表查询过滤条件。
type ContractListFilter struct {
	OwnerUserID  int64
	CustomerID   *int64
	Status       *int8
	Keyword      string
	CustomerName string
	Limit        int
	Offset       int
}

// CountContracts 统计符合条件的合同数量，用于分页。
func (r *ContractRepository) CountContracts(ctx context.Context, filter ContractListFilter) (int64, error) {
	where, args := buildContractWhere(filter)

	var total int64
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM contract "+where, args...).Scan(&total)
	if err != nil {
		return 0, err
	}
	return total, nil
}

// ListContracts 分页查询当前用户的合同列表。
func (r *ContractRepository) ListContracts(ctx context.Context, filter ContractListFilter) ([]model.Contract, error) {
	where, args := buildContractWhere(filter)
	args = append(args, filter.Limit, filter.Offset)

	query := `
		SELECT id, contract_no, contract_name, owner_user_id,
		       customer_name, customer_contact, customer_phone,
		       status, current_version_id, current_version_no,
		       description, confirmed_time, completed_time,
		       create_time, update_time
		FROM contract ` + where + `
		ORDER BY create_time DESC, id DESC
		LIMIT ? OFFSET ?`

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	contracts := make([]model.Contract, 0)
	for rows.Next() {
		var c model.Contract
		var (
			customerName    sql.NullString
			customerContact sql.NullString
			customerPhone   sql.NullString
			description     sql.NullString
			confirmedTime   sql.NullTime
			completedTime   sql.NullTime
		)

		err := rows.Scan(
			&c.ID, &c.ContractNo, &c.ContractName, &c.OwnerUserID,
			&customerName, &customerContact, &customerPhone,
			&c.Status, &c.CurrentVersionID, &c.CurrentVersionNo,
			&description, &confirmedTime, &completedTime,
			&c.CreateTime, &c.UpdateTime,
		)
		if err != nil {
			return nil, err
		}

		c.CustomerName = customerName.String
		c.CustomerContact = customerContact.String
		c.CustomerPhone = customerPhone.String
		c.Description = description.String
		if confirmedTime.Valid {
			t := confirmedTime.Time
			c.ConfirmedTime = &t
		}
		if completedTime.Valid {
			t := completedTime.Time
			c.CompletedTime = &t
		}

		contracts = append(contracts, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return contracts, nil
}

// UpdateContractStatus 更新合同状态。
func (r *ContractRepository) UpdateContractStatus(ctx context.Context, contractID int64, status int8) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE contract
		SET status = ?
		WHERE id = ?
	`, status, contractID)
	return err
}

// UpdateContractNameByOwner 更新当前用户名下合同名称。
func (r *ContractRepository) UpdateContractNameByOwner(ctx context.Context, contractID, ownerUserID int64, name string) (int64, error) {
	res, err := r.db.ExecContext(ctx, `
		UPDATE contract
		SET contract_name = ?
		WHERE id = ? AND owner_user_id = ?
	`, name, contractID, ownerUserID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// InsertAuditLog 写入单条合同审计日志。
func (r *ContractRepository) InsertAuditLog(ctx context.Context, audit *model.ContractAuditLog) error {
	if audit == nil {
		return nil
	}
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO contract_audit_log (
			id, contract_id, user_id, collaborator_id,
			operator_name, operation_type, operation_desc,
			version_id, ip_address, user_agent,
			extra_data, create_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, audit.ID, audit.ContractID, audit.UserID, audit.CollaboratorID,
		nullString(audit.OperatorName), audit.OperationType, nullString(audit.OperationDesc),
		audit.VersionID, nullString(audit.IPAddress), nullString(audit.UserAgent),
		nil, audit.CreateTime)
	return err
}

// DeleteContractsByOwner 在同一事务中删除当前用户拥有的合同及其业务明细。
func (r *ContractRepository) DeleteContractsByOwner(ctx context.Context, ownerUserID int64, contractIDs []int64, audits []model.ContractAuditLog) ([]string, int64, error) {
	if len(contractIDs) == 0 {
		return nil, 0, nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback()

	placeholders := buildInPlaceholders(len(contractIDs))
	queryArgs := make([]interface{}, 0, len(contractIDs)+1)
	queryArgs = append(queryArgs, ownerUserID)
	for _, id := range contractIDs {
		queryArgs = append(queryArgs, id)
	}

	// 先在事务内锁定合同主记录，确保归属校验和后续删除看到同一份数据。
	rows, err := tx.QueryContext(ctx, `
		SELECT id
		FROM contract
		WHERE owner_user_id = ? AND id IN (`+placeholders+`)
		FOR UPDATE
	`, queryArgs...)
	if err != nil {
		return nil, 0, err
	}

	ownedIDs := make(map[int64]struct{}, len(contractIDs))
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, 0, err
		}
		ownedIDs[id] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, 0, err
	}
	rows.Close()

	if len(ownedIDs) != len(contractIDs) {
		return nil, 0, nil
	}

	idArgs := int64SliceToArgs(contractIDs)
	objectKeys, err := queryContractVersionObjectKeys(ctx, tx, placeholders, idArgs)
	if err != nil {
		return nil, 0, err
	}

	deleteStatements := []string{
		"DELETE FROM contract_confirmation WHERE contract_id IN (" + placeholders + ")",
		"DELETE FROM contract_change WHERE contract_id IN (" + placeholders + ")",
		"DELETE FROM contract_share WHERE contract_id IN (" + placeholders + ")",
		"DELETE FROM contract_collaborator WHERE contract_id IN (" + placeholders + ")",
		"DELETE FROM contract_version WHERE contract_id IN (" + placeholders + ")",
	}
	for _, stmt := range deleteStatements {
		if _, err := tx.ExecContext(ctx, stmt, idArgs...); err != nil {
			return nil, 0, err
		}
	}

	result, err := tx.ExecContext(ctx, "DELETE FROM contract WHERE id IN ("+placeholders+")", idArgs...)
	if err != nil {
		return nil, 0, err
	}
	deletedCount, err := result.RowsAffected()
	if err != nil {
		return nil, 0, err
	}
	if deletedCount != int64(len(contractIDs)) {
		return nil, 0, nil
	}

	for i := range audits {
		audit := &audits[i]
		_, err = tx.ExecContext(ctx, `
			INSERT INTO contract_audit_log (
				id, contract_id, user_id, collaborator_id,
				operator_name, operation_type, operation_desc,
				version_id, ip_address, user_agent,
				extra_data, create_time
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, audit.ID, audit.ContractID, audit.UserID, audit.CollaboratorID,
			nullString(audit.OperatorName), audit.OperationType, nullString(audit.OperationDesc),
			audit.VersionID, nullString(audit.IPAddress), nullString(audit.UserAgent),
			nil, audit.CreateTime)
		if err != nil {
			return nil, 0, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, 0, err
	}

	return objectKeys, deletedCount, nil
}

// GetDetailByOwner 查询合同详情，同时校验 owner_user_id 防止越权访问。
func (r *ContractRepository) GetDetailByOwner(ctx context.Context, contractID, ownerUserID int64) (*model.ContractDetail, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT
			c.id, c.contract_no, c.contract_name, c.owner_user_id,
			c.customer_name, c.customer_contact, c.customer_phone,
			c.status, c.current_version_id, c.current_version_no,
			c.description, c.confirmed_time, c.completed_time,
			c.create_time, c.update_time,
			v.id, v.version_no, v.oss_object_key, v.oss_url,
			v.file_name, v.file_size, v.file_hash,
			v.document_content, v.change_summary,
			v.export_png_oss_prefix, v.export_png_page_count, v.export_png_hash, v.exported_at,
			v.export_pdf_oss_key, v.export_pdf_hash, v.export_pdf_page_count, v.pdf_exported_at, v.verify_code,
			v.create_time
		FROM contract c
		LEFT JOIN contract_version v ON v.id = c.current_version_id
		WHERE c.id = ? AND c.owner_user_id = ?
	`, contractID, ownerUserID)

	var (
		d               model.ContractDetail
		c               model.Contract
		v               model.ContractVersion
		customerName    sql.NullString
		customerContact sql.NullString
		customerPhone   sql.NullString
		description     sql.NullString
		confirmedTime   sql.NullTime
		completedTime   sql.NullTime
		versionID       sql.NullInt64
		versionNo       sql.NullInt64
		ossObjectKey    sql.NullString
		ossURL          sql.NullString
		fileName        sql.NullString
		fileSize        sql.NullInt64
		fileHash        sql.NullString
		documentContent sql.NullString
		changeSummary   sql.NullString
		exportPrefix    sql.NullString
		exportPageCount sql.NullInt64
		exportHash      sql.NullString
		exportedAt      sql.NullTime
		exportPdfKey    sql.NullString
		exportPdfHash   sql.NullString
		exportPdfPages  sql.NullInt64
		pdfExportedAt   sql.NullTime
		verifyCode      sql.NullString
		versionTime     sql.NullTime
	)

	err := row.Scan(
		&c.ID, &c.ContractNo, &c.ContractName, &c.OwnerUserID,
		&customerName, &customerContact, &customerPhone,
		&c.Status, &c.CurrentVersionID, &c.CurrentVersionNo,
		&description, &confirmedTime, &completedTime,
		&c.CreateTime, &c.UpdateTime,
		&versionID, &versionNo, &ossObjectKey, &ossURL,
		&fileName, &fileSize, &fileHash,
		&documentContent, &changeSummary,
		&exportPrefix, &exportPageCount, &exportHash, &exportedAt,
		&exportPdfKey, &exportPdfHash, &exportPdfPages, &pdfExportedAt, &verifyCode,
		&versionTime,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	c.CustomerName = customerName.String
	c.CustomerContact = customerContact.String
	c.CustomerPhone = customerPhone.String
	c.Description = description.String
	if confirmedTime.Valid {
		t := confirmedTime.Time
		c.ConfirmedTime = &t
	}
	if completedTime.Valid {
		t := completedTime.Time
		c.CompletedTime = &t
	}
	d.Contract = c

	// 如果有当前版本，则填充版本信息
	if versionID.Valid {
		v.ID = versionID.Int64
		v.ContractID = c.ID
		v.VersionNo = int(versionNo.Int64)
		v.OssObjectKey = ossObjectKey.String
		v.OssURL = ossURL.String
		v.FileName = fileName.String
		v.FileSize = fileSize.Int64
		v.FileHash = fileHash.String
		v.DocumentContent = documentContent.String
		v.ChangeSummary = changeSummary.String
		v.ExportPngOssPrefix = exportPrefix.String
		v.ExportPngPageCount = int(exportPageCount.Int64)
		v.ExportPngHash = exportHash.String
		if exportedAt.Valid {
			t := exportedAt.Time
			v.ExportedAt = &t
		}
		v.ExportPdfOssKey = exportPdfKey.String
		v.ExportPdfHash = exportPdfHash.String
		v.ExportPdfPageCount = int(exportPdfPages.Int64)
		if pdfExportedAt.Valid {
			t := pdfExportedAt.Time
			v.PdfExportedAt = &t
		}
		v.VerifyCode = verifyCode.String
		if versionTime.Valid {
			v.CreateTime = versionTime.Time
		}
		d.Version = &v
	}

	return &d, nil
}

// GetDetailByContractID 查询合同详情（不校验 owner，用于分享场景）。
func (r *ContractRepository) GetDetailByContractID(ctx context.Context, contractID int64) (*model.ContractDetail, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT
			c.id, c.contract_no, c.contract_name, c.owner_user_id,
			c.customer_name, c.customer_contact, c.customer_phone,
			c.status, c.current_version_id, c.current_version_no,
			c.description, c.confirmed_time, c.completed_time,
			c.create_time, c.update_time,
			v.id, v.version_no, v.oss_object_key, v.oss_url,
			v.file_name, v.file_size, v.file_hash,
			v.document_content, v.change_summary,
			v.export_png_oss_prefix, v.export_png_page_count, v.export_png_hash, v.exported_at,
			v.export_pdf_oss_key, v.export_pdf_hash, v.export_pdf_page_count, v.pdf_exported_at, v.verify_code,
			v.create_time
		FROM contract c
		LEFT JOIN contract_version v ON v.id = c.current_version_id
		WHERE c.id = ?
	`, contractID)
	return scanContractDetailRow(row)
}

// scanContractDetailRow 扫描合同详情查询结果。
func scanContractDetailRow(row *sql.Row) (*model.ContractDetail, error) {
	var (
		d               model.ContractDetail
		c               model.Contract
		v               model.ContractVersion
		customerName    sql.NullString
		customerContact sql.NullString
		customerPhone   sql.NullString
		description     sql.NullString
		confirmedTime   sql.NullTime
		completedTime   sql.NullTime
		versionID       sql.NullInt64
		versionNo       sql.NullInt64
		ossObjectKey    sql.NullString
		ossURL          sql.NullString
		fileName        sql.NullString
		fileSize        sql.NullInt64
		fileHash        sql.NullString
		documentContent sql.NullString
		changeSummary   sql.NullString
		exportPrefix    sql.NullString
		exportPageCount sql.NullInt64
		exportHash      sql.NullString
		exportedAt      sql.NullTime
		exportPdfKey    sql.NullString
		exportPdfHash   sql.NullString
		exportPdfPages  sql.NullInt64
		pdfExportedAt   sql.NullTime
		verifyCode      sql.NullString
		versionTime     sql.NullTime
	)

	err := row.Scan(
		&c.ID, &c.ContractNo, &c.ContractName, &c.OwnerUserID,
		&customerName, &customerContact, &customerPhone,
		&c.Status, &c.CurrentVersionID, &c.CurrentVersionNo,
		&description, &confirmedTime, &completedTime,
		&c.CreateTime, &c.UpdateTime,
		&versionID, &versionNo, &ossObjectKey, &ossURL,
		&fileName, &fileSize, &fileHash,
		&documentContent, &changeSummary,
		&exportPrefix, &exportPageCount, &exportHash, &exportedAt,
		&exportPdfKey, &exportPdfHash, &exportPdfPages, &pdfExportedAt, &verifyCode,
		&versionTime,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	c.CustomerName = customerName.String
	c.CustomerContact = customerContact.String
	c.CustomerPhone = customerPhone.String
	c.Description = description.String
	if confirmedTime.Valid {
		t := confirmedTime.Time
		c.ConfirmedTime = &t
	}
	if completedTime.Valid {
		t := completedTime.Time
		c.CompletedTime = &t
	}
	d.Contract = c

	if versionID.Valid {
		v.ID = versionID.Int64
		v.ContractID = c.ID
		v.VersionNo = int(versionNo.Int64)
		v.OssObjectKey = ossObjectKey.String
		v.OssURL = ossURL.String
		v.FileName = fileName.String
		v.FileSize = fileSize.Int64
		v.FileHash = fileHash.String
		v.DocumentContent = documentContent.String
		v.ChangeSummary = changeSummary.String
		v.ExportPngOssPrefix = exportPrefix.String
		v.ExportPngPageCount = int(exportPageCount.Int64)
		v.ExportPngHash = exportHash.String
		if exportedAt.Valid {
			t := exportedAt.Time
			v.ExportedAt = &t
		}
		v.ExportPdfOssKey = exportPdfKey.String
		v.ExportPdfHash = exportPdfHash.String
		v.ExportPdfPageCount = int(exportPdfPages.Int64)
		if pdfExportedAt.Valid {
			t := pdfExportedAt.Time
			v.PdfExportedAt = &t
		}
		v.VerifyCode = verifyCode.String
		if versionTime.Valid {
			v.CreateTime = versionTime.Time
		}
		d.Version = &v
	}

	return &d, nil
}

// GetFirstVersion 查询合同第一个版本（原始 DOCX 所在版本）。
func (r *ContractRepository) GetFirstVersion(ctx context.Context, contractID int64) (*model.ContractVersion, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, contract_id, version_no, created_by,
		       oss_object_key, oss_url, file_name, file_size, file_hash,
		       document_content, change_summary,
		       export_png_oss_prefix, export_png_page_count, export_png_hash, exported_at,
		       export_pdf_oss_key, export_pdf_hash, export_pdf_page_count, pdf_exported_at, verify_code,
		       create_time
		FROM contract_version
		WHERE contract_id = ? AND version_no = 1
	`, contractID)
	return scanVersion(row)
}

// GetVersionByID 查询某个合同下的指定版本。
func (r *ContractRepository) GetVersionByID(ctx context.Context, contractID, versionID int64) (*model.ContractVersion, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, contract_id, version_no, created_by,
		       oss_object_key, oss_url, file_name, file_size, file_hash,
		       document_content, change_summary,
		       export_png_oss_prefix, export_png_page_count, export_png_hash, exported_at,
		       export_pdf_oss_key, export_pdf_hash, export_pdf_page_count, pdf_exported_at, verify_code,
		       create_time
		FROM contract_version
		WHERE id = ? AND contract_id = ?
	`, versionID, contractID)
	return scanVersion(row)
}

// CountVersions 统计某合同下的版本数量。
func (r *ContractRepository) CountVersions(ctx context.Context, contractID int64) (int64, error) {
	var total int64
	err := r.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM contract_version WHERE contract_id = ?", contractID).Scan(&total)
	if err != nil {
		return 0, err
	}
	return total, nil
}

// ListVersions 分页查询某合同下的版本列表，按版本号倒序。
func (r *ContractRepository) ListVersions(ctx context.Context, contractID int64, limit, offset int) ([]model.ContractVersion, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT v.id, v.contract_id, v.version_no, v.created_by,
		       COALESCE(u.nickname, u.username, ''),
		       v.oss_object_key, v.oss_url, v.file_name, v.file_size, v.file_hash,
		       v.document_content, v.change_summary, v.create_time
		FROM contract_version v
		LEFT JOIN sys_user u ON u.id = v.created_by
		WHERE v.contract_id = ?
		ORDER BY v.version_no DESC
		LIMIT ? OFFSET ?
	`, contractID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	versions := make([]model.ContractVersion, 0)
	for rows.Next() {
		var (
			v               model.ContractVersion
			ossObjectKey    sql.NullString
			ossURL          sql.NullString
			fileName        sql.NullString
			fileSize        sql.NullInt64
			fileHash        sql.NullString
			documentContent sql.NullString
			changeSummary   sql.NullString
		)
		if err := rows.Scan(
			&v.ID, &v.ContractID, &v.VersionNo, &v.CreatedBy,
			&v.CreatedByName,
			&ossObjectKey, &ossURL, &fileName, &fileSize, &fileHash,
			&documentContent, &changeSummary, &v.CreateTime,
		); err != nil {
			return nil, err
		}
		v.OssObjectKey = ossObjectKey.String
		v.OssURL = ossURL.String
		v.FileName = fileName.String
		v.FileSize = fileSize.Int64
		v.FileHash = fileHash.String
		v.DocumentContent = documentContent.String
		v.ChangeSummary = changeSummary.String
		versions = append(versions, v)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return versions, nil
}

// CreateVersionWithChanges 在事务中创建新版本、乐观更新合同当前版本、写入变更记录和审计日志。
// expectedCurrentVersionID 为保存前所基于的当前版本 ID；0 表示合同尚无版本。
func (r *ContractRepository) CreateVersionWithChanges(
	ctx context.Context,
	contractID int64,
	version *model.ContractVersion,
	changes []model.ContractChange,
	audit *model.ContractAuditLog,
	expectedCurrentVersionID int64,
) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. 插入新版本
	_, err = tx.ExecContext(ctx, `
		INSERT INTO contract_version (
			id, contract_id, version_no, created_by,
			collaborator_id, source_version_id,
			oss_object_key, oss_url, file_name, file_size, file_hash,
			document_content, change_summary, create_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, version.ID, version.ContractID, version.VersionNo, version.CreatedBy,
		version.CollaboratorID, version.SourceVersionID,
		version.OssObjectKey, version.OssURL, version.FileName, version.FileSize, version.FileHash,
		nullString(version.DocumentContent), nullString(version.ChangeSummary), version.CreateTime)
	if err != nil {
		return err
	}

	// 2. 乐观更新合同当前版本（CAS：防止并发保存互相覆盖）
	var res sql.Result
	if expectedCurrentVersionID > 0 {
		res, err = tx.ExecContext(ctx, `
			UPDATE contract
			SET current_version_id = ?, current_version_no = ?
			WHERE id = ? AND current_version_id = ?
		`, version.ID, version.VersionNo, contractID, expectedCurrentVersionID)
	} else {
		res, err = tx.ExecContext(ctx, `
			UPDATE contract
			SET current_version_id = ?, current_version_no = ?
			WHERE id = ? AND current_version_id IS NULL
		`, version.ID, version.VersionNo, contractID)
	}
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrVersionCASFailed
	}

	// 3. 插入变更记录
	for i := range changes {
		ch := &changes[i]
		_, err = tx.ExecContext(ctx, `
			INSERT INTO contract_change (
				id, contract_id, from_version_id, to_version_id,
				operator_user_id, collaborator_id,
				change_type, block_id, clause_no,
				old_content, new_content, change_reason, create_time
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, ch.ID, ch.ContractID, ch.FromVersionID, ch.ToVersionID,
			ch.OperatorUserID, ch.CollaboratorID,
			ch.ChangeType, nullString(ch.BlockID), nullString(ch.ClauseNo),
			nullString(ch.OldContent), nullString(ch.NewContent), nullString(ch.ChangeReason), ch.CreateTime)
		if err != nil {
			return err
		}
	}

	// 4. 写审计日志
	_, err = tx.ExecContext(ctx, `
		INSERT INTO contract_audit_log (
			id, contract_id, user_id, collaborator_id,
			operator_name, operation_type, operation_desc,
			version_id, ip_address, user_agent,
			extra_data, create_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, audit.ID, audit.ContractID, audit.UserID, audit.CollaboratorID,
		nullString(audit.OperatorName), audit.OperationType, nullString(audit.OperationDesc),
		audit.VersionID, nullString(audit.IPAddress), nullString(audit.UserAgent),
		nil, audit.CreateTime)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// CountChanges 统计某合同下的变更记录数量。
func (r *ContractRepository) CountChanges(ctx context.Context, contractID int64) (int64, error) {
	var total int64
	err := r.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM contract_change WHERE contract_id = ?", contractID).Scan(&total)
	if err != nil {
		return 0, err
	}
	return total, nil
}

// ListChanges 分页查询某合同下的变更记录，带操作人姓名。
func (r *ContractRepository) ListChanges(ctx context.Context, contractID int64, limit, offset int) ([]model.ContractChange, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT ch.id, ch.contract_id, ch.from_version_id, ch.to_version_id,
		       ch.operator_user_id,
		       COALESCE(u.nickname, u.username, cc.name, ''),
		       ch.change_type, ch.block_id, ch.clause_no,
		       ch.old_content, ch.new_content, ch.change_reason, ch.create_time
		FROM contract_change ch
		LEFT JOIN sys_user u ON u.id = ch.operator_user_id
		LEFT JOIN contract_collaborator cc ON cc.id = ch.collaborator_id
		WHERE ch.contract_id = ?
		ORDER BY ch.create_time DESC, ch.id DESC
		LIMIT ? OFFSET ?
	`, contractID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	changes := make([]model.ContractChange, 0)
	for rows.Next() {
		var c model.ContractChange
		var (
			blockID      sql.NullString
			clauseNo     sql.NullString
			oldContent   sql.NullString
			newContent   sql.NullString
			changeReason sql.NullString
		)
		if err := rows.Scan(
			&c.ID, &c.ContractID, &c.FromVersionID, &c.ToVersionID,
			&c.OperatorUserID, &c.OperatorName,
			&c.ChangeType, &blockID, &clauseNo,
			&oldContent, &newContent, &changeReason, &c.CreateTime,
		); err != nil {
			return nil, err
		}
		c.BlockID = blockID.String
		c.ClauseNo = clauseNo.String
		c.OldContent = oldContent.String
		c.NewContent = newContent.String
		c.ChangeReason = changeReason.String
		changes = append(changes, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return changes, nil
}

// UpdateVersionExportPng 更新版本的 PNG 导出归档信息。
func (r *ContractRepository) UpdateVersionExportPng(
	ctx context.Context,
	versionID int64,
	prefix string,
	pageCount int,
	hash string,
	exportedAt time.Time,
) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE contract_version
		SET export_png_oss_prefix = ?, export_png_page_count = ?, export_png_hash = ?, exported_at = ?
		WHERE id = ?
	`, prefix, pageCount, hash, exportedAt, versionID)
	return err
}

// SetVersionVerifyCode 为当前版本预分配验真码（确认前生成二维码用）。
func (r *ContractRepository) SetVersionVerifyCode(ctx context.Context, versionID int64, verifyCode string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE contract_version SET verify_code = ? WHERE id = ?
	`, verifyCode, versionID)
	return err
}

// UpdateVersionExportPdf 更新版本 PDF 终稿归档信息（草稿或终稿）。
func (r *ContractRepository) UpdateVersionExportPdf(
	ctx context.Context,
	versionID int64,
	ossKey, hash string,
	pageCount int,
	exportedAt time.Time,
	verifyCode string,
) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE contract_version
		SET export_pdf_oss_key = ?, export_pdf_hash = ?, export_pdf_page_count = ?,
		    pdf_exported_at = ?, verify_code = COALESCE(NULLIF(?, ''), verify_code)
		WHERE id = ?
	`, ossKey, hash, pageCount, exportedAt, verifyCode, versionID)
	return err
}

// GetVersionByVerifyCode 通过验真码查询版本与合同信息。
func (r *ContractRepository) GetVersionByVerifyCode(ctx context.Context, verifyCode string) (*model.VerifyContractRow, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT c.id, c.contract_no, c.contract_name, c.status, c.confirmed_time,
		       v.id, v.version_no, v.export_pdf_oss_key, v.export_pdf_hash,
		       v.export_pdf_page_count, v.pdf_exported_at, v.verify_code
		FROM contract_version v
		INNER JOIN contract c ON c.id = v.contract_id
		WHERE v.verify_code = ?
	`, verifyCode)

	var item model.VerifyContractRow
	var confirmedTime sql.NullTime
	var pdfExportedAt sql.NullTime
	err := row.Scan(
		&item.ContractID, &item.ContractNo, &item.ContractName, &item.ContractStatus, &confirmedTime,
		&item.VersionID, &item.VersionNo, &item.ExportPdfOssKey, &item.ExportPdfHash,
		&item.ExportPdfPageCount, &pdfExportedAt, &item.VerifyCode,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if confirmedTime.Valid {
		t := confirmedTime.Time
		item.ConfirmedTime = &t
	}
	if pdfExportedAt.Valid {
		t := pdfExportedAt.Time
		item.PdfExportedAt = &t
	}
	return &item, nil
}

// FinalizeConfirmWithPdf 事务：写入 PDF 归档、确认记录、合同锁定。
func (r *ContractRepository) FinalizeConfirmWithPdf(
	ctx context.Context,
	versionID, contractID int64,
	ossKey, hash string,
	pageCount int,
	exportedAt time.Time,
	verifyCode string,
	confirmation *model.ContractConfirmation,
) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		UPDATE contract_version
		SET export_pdf_oss_key = ?, export_pdf_hash = ?, export_pdf_page_count = ?,
		    pdf_exported_at = ?, verify_code = ?
		WHERE id = ? AND contract_id = ?
	`, ossKey, hash, pageCount, exportedAt, verifyCode, versionID, contractID)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO contract_confirmation (
			id, contract_id, version_id, user_id, collaborator_id,
			confirmer_name, confirmer_type, confirm_status,
			confirm_ip, user_agent, confirm_time, create_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, confirmation.ID, confirmation.ContractID, confirmation.VersionID,
		confirmation.UserID, confirmation.CollaboratorID,
		nullString(confirmation.ConfirmerName), confirmation.ConfirmerType, confirmation.ConfirmStatus,
		nullString(confirmation.ConfirmIP), nullString(confirmation.UserAgent),
		confirmation.ConfirmTime, confirmation.CreateTime)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE contract SET status = 3, confirmed_time = ? WHERE id = ?
	`, exportedAt, contractID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// scanVersion 扫描一行 contract_version 数据。
func scanVersion(row *sql.Row) (*model.ContractVersion, error) {
	var (
		v               model.ContractVersion
		ossObjectKey    sql.NullString
		ossURL          sql.NullString
		fileName        sql.NullString
		fileSize        sql.NullInt64
		fileHash        sql.NullString
		documentContent sql.NullString
		changeSummary   sql.NullString
		exportPrefix    sql.NullString
		exportPageCount sql.NullInt64
		exportHash      sql.NullString
		exportedAt      sql.NullTime
		exportPdfKey    sql.NullString
		exportPdfHash   sql.NullString
		exportPdfPages  sql.NullInt64
		pdfExportedAt   sql.NullTime
		verifyCode      sql.NullString
	)
	err := row.Scan(
		&v.ID, &v.ContractID, &v.VersionNo, &v.CreatedBy,
		&ossObjectKey, &ossURL, &fileName, &fileSize, &fileHash,
		&documentContent, &changeSummary,
		&exportPrefix, &exportPageCount, &exportHash, &exportedAt,
		&exportPdfKey, &exportPdfHash, &exportPdfPages, &pdfExportedAt, &verifyCode,
		&v.CreateTime,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	v.OssObjectKey = ossObjectKey.String
	v.OssURL = ossURL.String
	v.FileName = fileName.String
	v.FileSize = fileSize.Int64
	v.FileHash = fileHash.String
	v.DocumentContent = documentContent.String
	v.ChangeSummary = changeSummary.String
	v.ExportPngOssPrefix = exportPrefix.String
	v.ExportPngPageCount = int(exportPageCount.Int64)
	v.ExportPngHash = exportHash.String
	if exportedAt.Valid {
		t := exportedAt.Time
		v.ExportedAt = &t
	}
	v.ExportPdfOssKey = exportPdfKey.String
	v.ExportPdfHash = exportPdfHash.String
	v.ExportPdfPageCount = int(exportPdfPages.Int64)
	if pdfExportedAt.Valid {
		t := pdfExportedAt.Time
		v.PdfExportedAt = &t
	}
	v.VerifyCode = verifyCode.String
	return &v, nil
}

// ListIDsByCustomerAndOwner 查询指定客户、归属当前用户的全部合同 ID。
func (r *ContractRepository) ListIDsByCustomerAndOwner(ctx context.Context, customerID, ownerUserID int64) ([]int64, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id FROM contract
		WHERE customer_id = ? AND owner_user_id = ?
		ORDER BY id ASC
	`, customerID, ownerUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// buildContractWhere 根据过滤条件拼接 WHERE 和参数，条件统一参数化，避免 SQL 注入。
func buildContractWhere(filter ContractListFilter) (string, []interface{}) {
	var sb strings.Builder
	sb.WriteString("WHERE owner_user_id = ?")
	args := []interface{}{filter.OwnerUserID}

	if filter.CustomerID != nil {
		sb.WriteString(" AND customer_id = ?")
		args = append(args, *filter.CustomerID)
	}

	if filter.Status != nil {
		sb.WriteString(" AND status = ?")
		args = append(args, *filter.Status)
	}

	if filter.Keyword != "" {
		sb.WriteString(" AND (contract_name LIKE ? OR contract_no LIKE ?)")
		like := "%" + filter.Keyword + "%"
		args = append(args, like, like)
	}

	if filter.CustomerName != "" {
		sb.WriteString(" AND customer_name LIKE ?")
		args = append(args, "%"+filter.CustomerName+"%")
	}

	return sb.String(), args
}

func queryContractVersionObjectKeys(ctx context.Context, tx *sql.Tx, placeholders string, args []interface{}) ([]string, error) {
	rows, err := tx.QueryContext(ctx, "SELECT oss_object_key FROM contract_version WHERE contract_id IN ("+placeholders+")", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	objectKeys := make([]string, 0)
	seen := make(map[string]struct{})
	for rows.Next() {
		var objectKey sql.NullString
		if err := rows.Scan(&objectKey); err != nil {
			return nil, err
		}
		if !objectKey.Valid || strings.TrimSpace(objectKey.String) == "" {
			continue
		}
		if _, exists := seen[objectKey.String]; exists {
			continue
		}
		seen[objectKey.String] = struct{}{}
		objectKeys = append(objectKeys, objectKey.String)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return objectKeys, nil
}

func buildInPlaceholders(size int) string {
	if size <= 0 {
		return ""
	}
	return strings.TrimRight(strings.Repeat("?,", size), ",")
}

func int64SliceToArgs(values []int64) []interface{} {
	args := make([]interface{}, 0, len(values))
	for _, value := range values {
		args = append(args, value)
	}
	return args
}

// StripSealsFromAllVersions 清除合同全部版本 JSON 中的 seals 字段。
func (r *ContractRepository) StripSealsFromAllVersions(ctx context.Context, contractID int64) error {
	rows, err := r.db.QueryContext(ctx, `
SELECT id, document_content FROM contract_version WHERE contract_id = ?
`, contractID)
	if err != nil {
		return err
	}
	defer rows.Close()

	type pair struct {
		id   int64
		json string
	}
	var items []pair
	for rows.Next() {
		var id int64
		var raw sql.NullString
		if err := rows.Scan(&id, &raw); err != nil {
			return err
		}
		if !raw.Valid || raw.String == "" {
			continue
		}
		items = append(items, pair{id: id, json: raw.String})
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, item := range items {
		var doc map[string]interface{}
		if err := json.Unmarshal([]byte(item.json), &doc); err != nil {
			continue
		}
		if _, ok := doc["seals"]; !ok {
			continue
		}
		delete(doc, "seals")
		next, err := json.Marshal(doc)
		if err != nil {
			continue
		}
		if _, err := r.db.ExecContext(ctx, `
UPDATE contract_version SET document_content = ? WHERE id = ? AND contract_id = ?
`, string(next), item.id, contractID); err != nil {
			return err
		}
	}
	return nil
}
