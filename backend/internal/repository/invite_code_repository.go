package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/lshc/contract-hub/backend/internal/model"
)

// InviteCodeRepository 邀请码数据访问。
type InviteCodeRepository struct {
	db *sql.DB
}

// NewInviteCodeRepository 创建邀请码仓库。
func NewInviteCodeRepository(db *sql.DB) *InviteCodeRepository {
	return &InviteCodeRepository{db: db}
}

// Create 插入邀请码。
func (r *InviteCodeRepository) Create(ctx context.Context, inv *model.InviteCode) error {
	_, err := r.db.ExecContext(ctx, `
INSERT INTO invite_code (id, code, created_by, expire_at, used_at, used_by_user_id, create_time)
VALUES (?, ?, ?, ?, NULL, NULL, ?)
`, inv.ID, inv.Code, inv.CreatedBy, inv.ExpireAt, inv.CreateTime)
	return err
}

// GetByCode 按邀请码查询。
func (r *InviteCodeRepository) GetByCode(ctx context.Context, code string) (*model.InviteCode, error) {
	row := r.db.QueryRowContext(ctx, `
SELECT id, code, created_by, expire_at, used_at, used_by_user_id, create_time
FROM invite_code WHERE code = ?
`, code)
	return scanInvite(row)
}

// MarkUsed 标记邀请码已使用（仅未使用时可更新）。
func (r *InviteCodeRepository) MarkUsed(ctx context.Context, tx *sql.Tx, id, userID int64, usedAt time.Time) (int64, error) {
	res, err := tx.ExecContext(ctx, `
UPDATE invite_code
SET used_at = ?, used_by_user_id = ?
WHERE id = ? AND used_at IS NULL
`, usedAt, userID, id)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// CreateUserTx 在事务中创建用户。
func (r *InviteCodeRepository) CreateUserTx(ctx context.Context, tx *sql.Tx, user *model.SysUser) error {
	_, err := tx.ExecContext(ctx, `
INSERT INTO sys_user (
id, username, password, nickname, phone, email, avatar_url,
status, role, last_login_time, last_login_ip, create_time, update_time
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, user.ID, user.Username, user.Password, nullString(user.Nickname), nullString(user.Phone), nullString(user.Email), nullString(user.AvatarURL),
		user.Status, user.Role, user.LastLoginTime, nullString(user.LastLoginIP), user.CreateTime, user.UpdateTime)
	return err
}

// BeginTx 开启事务。
func (r *InviteCodeRepository) BeginTx(ctx context.Context) (*sql.Tx, error) {
	return r.db.BeginTx(ctx, nil)
}

// ListRecent 最近邀请码列表。
func (r *InviteCodeRepository) ListRecent(ctx context.Context, limit int) ([]model.InviteCode, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := r.db.QueryContext(ctx, `
SELECT id, code, created_by, expire_at, used_at, used_by_user_id, create_time
FROM invite_code
ORDER BY create_time DESC
LIMIT ?
`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []model.InviteCode
	for rows.Next() {
		inv, err := scanInviteRows(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, *inv)
	}
	return list, rows.Err()
}

func scanInvite(row *sql.Row) (*model.InviteCode, error) {
	var (
		inv    model.InviteCode
		usedAt sql.NullTime
		usedBy sql.NullInt64
	)
	err := row.Scan(&inv.ID, &inv.Code, &inv.CreatedBy, &inv.ExpireAt, &usedAt, &usedBy, &inv.CreateTime)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if usedAt.Valid {
		t := usedAt.Time
		inv.UsedAt = &t
	}
	if usedBy.Valid {
		id := usedBy.Int64
		inv.UsedByUserID = &id
	}
	return &inv, nil
}

func scanInviteRows(rows *sql.Rows) (*model.InviteCode, error) {
	var (
		inv    model.InviteCode
		usedAt sql.NullTime
		usedBy sql.NullInt64
	)
	err := rows.Scan(&inv.ID, &inv.Code, &inv.CreatedBy, &inv.ExpireAt, &usedAt, &usedBy, &inv.CreateTime)
	if err != nil {
		return nil, err
	}
	if usedAt.Valid {
		t := usedAt.Time
		inv.UsedAt = &t
	}
	if usedBy.Valid {
		id := usedBy.Int64
		inv.UsedByUserID = &id
	}
	return &inv, nil
}
