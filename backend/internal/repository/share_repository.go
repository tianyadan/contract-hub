package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/lshc/contract-hub/backend/internal/model"
)

// ShareRepository 负责分享链接、外部协作者和确认记录的数据访问。
type ShareRepository struct {
	db *sql.DB
}

// NewShareRepository 创建分享仓库。
func NewShareRepository(db *sql.DB) *ShareRepository {
	return &ShareRepository{db: db}
}

// CreateShare 创建分享链接。
func (r *ShareRepository) CreateShare(ctx context.Context, share *model.ContractShare) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO contract_share (
			id, contract_id, creator_user_id, share_token,
			permission, status, expire_time,
			access_count, max_access_count, last_access_time,
			create_time, update_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, share.ID, share.ContractID, share.CreatorUserID, share.ShareToken,
		share.Permission, share.Status, share.ExpireTime,
		share.AccessCount, share.MaxAccessCount, share.LastAccessTime,
		share.CreateTime, share.UpdateTime)
	return err
}

// GetShareByToken 根据 token 查询分享链接。
func (r *ShareRepository) GetShareByToken(ctx context.Context, token string) (*model.ContractShare, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, contract_id, creator_user_id, share_token,
		       permission, status, expire_time,
		       access_count, max_access_count, last_access_time,
		       create_time, update_time
		FROM contract_share
		WHERE share_token = ?
	`, token)
	return scanShare(row)
}

// UpdateShareAccess 增加访问次数并更新最后访问时间。
func (r *ShareRepository) UpdateShareAccess(ctx context.Context, shareID int64, accessTime time.Time) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE contract_share
		SET access_count = access_count + 1, last_access_time = ?
		WHERE id = ?
	`, accessTime, shareID)
	return err
}

// DisableShare 将分享链接置为失效。
func (r *ShareRepository) DisableShare(ctx context.Context, shareID, contractID int64) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE contract_share
		SET status = 0
		WHERE id = ? AND contract_id = ?
	`, shareID, contractID)
	return err
}

// GetContractByID 根据 ID 查询合同（不校验 owner，用于分享场景）。
func (r *ShareRepository) GetContractByID(ctx context.Context, contractID int64) (*model.Contract, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, contract_no, contract_name, owner_user_id,
		       customer_name, customer_contact, customer_phone,
		       status, current_version_id, current_version_no,
		       description, confirmed_time, completed_time,
		       create_time, update_time
		FROM contract
		WHERE id = ?
	`, contractID)
	return scanContract(row)
}

// CreateCollaborator 创建外部协作者。
func (r *ShareRepository) CreateCollaborator(ctx context.Context, c *model.ContractCollaborator) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO contract_collaborator (
			id, contract_id, user_id, name, phone, email,
			collaborator_type, permission, status,
			first_access_time, last_access_time,
			create_time, update_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, c.ID, c.ContractID, c.UserID, c.Name, nullString(c.Phone), nullString(c.Email),
		c.CollaboratorType, c.Permission, c.Status,
		c.FirstAccessTime, c.LastAccessTime,
		c.CreateTime, c.UpdateTime)
	return err
}

// GetCollaboratorByContractAndName 根据合同和姓名查询协作者。
func (r *ShareRepository) GetCollaboratorByContractAndName(ctx context.Context, contractID int64, name string) (*model.ContractCollaborator, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, contract_id, user_id, name, phone, email,
		       collaborator_type, permission, status,
		       first_access_time, last_access_time,
		       create_time, update_time
		FROM contract_collaborator
		WHERE contract_id = ? AND name = ? AND status = 1
	`, contractID, name)
	return scanCollaborator(row)
}

// UpdateCollaboratorAccess 更新协作者最后访问时间。
func (r *ShareRepository) UpdateCollaboratorAccess(ctx context.Context, collaboratorID int64, accessTime time.Time) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE contract_collaborator
		SET last_access_time = ?
		WHERE id = ?
	`, accessTime, collaboratorID)
	return err
}

// CreateConfirmation 创建确认记录。
func (r *ShareRepository) CreateConfirmation(ctx context.Context, c *model.ContractConfirmation) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO contract_confirmation (
			id, contract_id, version_id, user_id, collaborator_id,
			confirmer_name, confirmer_type, confirm_status,
			confirm_ip, user_agent, confirm_time, create_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, c.ID, c.ContractID, c.VersionID, c.UserID, c.CollaboratorID,
		c.ConfirmerName, c.ConfirmerType, c.ConfirmStatus,
		nullString(c.ConfirmIP), nullString(c.UserAgent), c.ConfirmTime, c.CreateTime)
	return err
}

// ListConfirmations 查询合同的确认记录。
func (r *ShareRepository) ListConfirmations(ctx context.Context, contractID int64) ([]model.ContractConfirmation, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, contract_id, version_id, user_id, collaborator_id,
		       confirmer_name, confirmer_type, confirm_status,
		       confirm_ip, user_agent, confirm_time, create_time
		FROM contract_confirmation
		WHERE contract_id = ? AND confirm_status = 1
		ORDER BY confirm_time DESC, id DESC
	`, contractID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]model.ContractConfirmation, 0)
	for rows.Next() {
		var c model.ContractConfirmation
		var (
			userID         sql.NullInt64
			collaboratorID sql.NullInt64
			confirmIP      sql.NullString
			userAgent      sql.NullString
		)
		if err := rows.Scan(
			&c.ID, &c.ContractID, &c.VersionID, &userID, &collaboratorID,
			&c.ConfirmerName, &c.ConfirmerType, &c.ConfirmStatus,
			&confirmIP, &userAgent, &c.ConfirmTime, &c.CreateTime,
		); err != nil {
			return nil, err
		}
		if userID.Valid {
			c.UserID = &userID.Int64
		}
		if collaboratorID.Valid {
			c.CollaboratorID = &collaboratorID.Int64
		}
		c.ConfirmIP = confirmIP.String
		c.UserAgent = userAgent.String
		items = append(items, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

// scanShare 扫描 contract_share 行。
func scanShare(row *sql.Row) (*model.ContractShare, error) {
	var s model.ContractShare
	var (
		expireTime     sql.NullTime
		maxAccessCount sql.NullInt64
		lastAccessTime sql.NullTime
	)
	err := row.Scan(
		&s.ID, &s.ContractID, &s.CreatorUserID, &s.ShareToken,
		&s.Permission, &s.Status, &expireTime,
		&s.AccessCount, &maxAccessCount, &lastAccessTime,
		&s.CreateTime, &s.UpdateTime,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if expireTime.Valid {
		s.ExpireTime = &expireTime.Time
	}
	if maxAccessCount.Valid {
		n := int(maxAccessCount.Int64)
		s.MaxAccessCount = &n
	}
	if lastAccessTime.Valid {
		s.LastAccessTime = &lastAccessTime.Time
	}
	return &s, nil
}

// scanCollaborator 扫描 contract_collaborator 行。
func scanCollaborator(row *sql.Row) (*model.ContractCollaborator, error) {
	var c model.ContractCollaborator
	var (
		userID          sql.NullInt64
		phone           sql.NullString
		email           sql.NullString
		firstAccessTime sql.NullTime
		lastAccessTime  sql.NullTime
	)
	err := row.Scan(
		&c.ID, &c.ContractID, &userID, &c.Name, &phone, &email,
		&c.CollaboratorType, &c.Permission, &c.Status,
		&firstAccessTime, &lastAccessTime,
		&c.CreateTime, &c.UpdateTime,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if userID.Valid {
		c.UserID = &userID.Int64
	}
	c.Phone = phone.String
	c.Email = email.String
	if firstAccessTime.Valid {
		c.FirstAccessTime = &firstAccessTime.Time
	}
	if lastAccessTime.Valid {
		c.LastAccessTime = &lastAccessTime.Time
	}
	return &c, nil
}

// scanContract 扫描 contract 行（不含版本）。
func scanContract(row *sql.Row) (*model.Contract, error) {
	var c model.Contract
	var (
		customerName    sql.NullString
		customerContact sql.NullString
		customerPhone   sql.NullString
		description     sql.NullString
		confirmedTime   sql.NullTime
		completedTime   sql.NullTime
	)
	err := row.Scan(
		&c.ID, &c.ContractNo, &c.ContractName, &c.OwnerUserID,
		&customerName, &customerContact, &customerPhone,
		&c.Status, &c.CurrentVersionID, &c.CurrentVersionNo,
		&description, &confirmedTime, &completedTime,
		&c.CreateTime, &c.UpdateTime,
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
	return &c, nil
}
