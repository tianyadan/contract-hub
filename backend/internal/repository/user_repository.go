package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/lshc/contract-hub/backend/internal/model"
)

// UserRepository 负责 sys_user 表的数据访问。
type UserRepository struct {
	db *sql.DB
}

// NewUserRepository 创建用户仓库。
func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

// Create 插入一个新用户。
func (r *UserRepository) Create(ctx context.Context, user *model.SysUser) error {
	_, err := r.db.ExecContext(ctx, `
INSERT INTO sys_user (
id, username, password, nickname, phone, email, avatar_url,
status, role, last_login_time, last_login_ip, create_time, update_time
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, user.ID, user.Username, user.Password, nullString(user.Nickname), nullString(user.Phone), nullString(user.Email), nullString(user.AvatarURL),
		user.Status, user.Role, user.LastLoginTime, nullString(user.LastLoginIP), user.CreateTime, user.UpdateTime)
	return err
}

// GetByUsername 根据用户名查询用户（含软删除，由业务层决定如何处理）。
func (r *UserRepository) GetByUsername(ctx context.Context, username string) (*model.SysUser, error) {
	row := r.db.QueryRowContext(ctx, `
SELECT id, username, password, nickname, phone, email, avatar_url,
       status, role, last_login_time, last_login_ip, create_time, update_time
FROM sys_user
WHERE username = ?
`, username)
	return scanUser(row)
}

// GetByID 根据用户 ID 查询用户。
func (r *UserRepository) GetByID(ctx context.Context, id int64) (*model.SysUser, error) {
	row := r.db.QueryRowContext(ctx, `
SELECT id, username, password, nickname, phone, email, avatar_url,
       status, role, last_login_time, last_login_ip, create_time, update_time
FROM sys_user
WHERE id = ?
`, id)
	return scanUser(row)
}

// UpdateLastLogin 更新用户最后登录时间和 IP。
func (r *UserRepository) UpdateLastLogin(ctx context.Context, userID int64, loginTime time.Time, ip string) error {
	_, err := r.db.ExecContext(ctx, `
UPDATE sys_user
SET last_login_time = ?, last_login_ip = ?
WHERE id = ?
`, loginTime, nullString(ip), userID)
	return err
}

// UpdateStatus 更新用户状态。
func (r *UserRepository) UpdateStatus(ctx context.Context, userID int64, status int8) error {
	_, err := r.db.ExecContext(ctx, `
UPDATE sys_user SET status = ?, update_time = ? WHERE id = ?
`, status, time.Now(), userID)
	return err
}

// UpdatePassword 更新用户密码 Hash。
func (r *UserRepository) UpdatePassword(ctx context.Context, userID int64, passwordHash string) error {
	_, err := r.db.ExecContext(ctx, `
UPDATE sys_user SET password = ?, update_time = ? WHERE id = ?
`, passwordHash, time.Now(), userID)
	return err
}

// PromoteAdmin 将用户提升为启用状态的管理员。
func (r *UserRepository) PromoteAdmin(ctx context.Context, userID int64) error {
	_, err := r.db.ExecContext(ctx, `
UPDATE sys_user SET role = ?, status = ?, update_time = ? WHERE id = ?
`, model.UserRoleAdmin, model.UserStatusActive, time.Now(), userID)
	return err
}

// CountAdmins 统计未软删的管理员数量。
func (r *UserRepository) CountAdmins(ctx context.Context) (int64, error) {
	var n int64
	err := r.db.QueryRowContext(ctx, `
SELECT COUNT(1) FROM sys_user WHERE role = ? AND status != ?
`, model.UserRoleAdmin, model.UserStatusDeleted).Scan(&n)
	return n, err
}

// ListUsers 分页查询用户（默认排除软删除）。
func (r *UserRepository) ListUsers(ctx context.Context, keyword string, status *int8, page, pageSize int) ([]model.SysUser, int64, error) {
	where := []string{"status != ?"}
	args := []interface{}{model.UserStatusDeleted}
	if status != nil {
		where = append(where, "status = ?")
		args = append(args, *status)
	}
	if kw := strings.TrimSpace(keyword); kw != "" {
		where = append(where, "(username LIKE ? OR nickname LIKE ? OR phone LIKE ?)")
		like := "%" + kw + "%"
		args = append(args, like, like, like)
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	countSQL := fmt.Sprintf(`SELECT COUNT(1) FROM sys_user WHERE %s`, whereSQL)
	if err := r.db.QueryRowContext(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	listSQL := fmt.Sprintf(`
SELECT id, username, password, nickname, phone, email, avatar_url,
       status, role, last_login_time, last_login_ip, create_time, update_time
FROM sys_user
WHERE %s
ORDER BY create_time DESC
LIMIT ? OFFSET ?
`, whereSQL)
	listArgs := append(append([]interface{}{}, args...), pageSize, offset)
	rows, err := r.db.QueryContext(ctx, listSQL, listArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var list []model.SysUser
	for rows.Next() {
		u, err := scanUserRows(rows)
		if err != nil {
			return nil, 0, err
		}
		list = append(list, *u)
	}
	return list, total, rows.Err()
}

// nullString 把空字符串转成 NULL。
func nullString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// scanUser 扫描一行 sys_user。
func scanUser(row *sql.Row) (*model.SysUser, error) {
	var (
		u             model.SysUser
		nickname      sql.NullString
		phone         sql.NullString
		email         sql.NullString
		avatarURL     sql.NullString
		lastLoginTime sql.NullTime
		lastLoginIP   sql.NullString
	)
	err := row.Scan(
		&u.ID, &u.Username, &u.Password,
		&nickname, &phone, &email, &avatarURL,
		&u.Status, &u.Role, &lastLoginTime, &lastLoginIP,
		&u.CreateTime, &u.UpdateTime,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	u.Nickname = nickname.String
	u.Phone = phone.String
	u.Email = email.String
	u.AvatarURL = avatarURL.String
	u.LastLoginIP = lastLoginIP.String
	if lastLoginTime.Valid {
		u.LastLoginTime = &lastLoginTime.Time
	}
	return &u, nil
}

// scanUserRows 从 Rows 扫描用户。
func scanUserRows(rows *sql.Rows) (*model.SysUser, error) {
	var (
		u             model.SysUser
		nickname      sql.NullString
		phone         sql.NullString
		email         sql.NullString
		avatarURL     sql.NullString
		lastLoginTime sql.NullTime
		lastLoginIP   sql.NullString
	)
	err := rows.Scan(
		&u.ID, &u.Username, &u.Password,
		&nickname, &phone, &email, &avatarURL,
		&u.Status, &u.Role, &lastLoginTime, &lastLoginIP,
		&u.CreateTime, &u.UpdateTime,
	)
	if err != nil {
		return nil, err
	}
	u.Nickname = nickname.String
	u.Phone = phone.String
	u.Email = email.String
	u.AvatarURL = avatarURL.String
	u.LastLoginIP = lastLoginIP.String
	if lastLoginTime.Valid {
		u.LastLoginTime = &lastLoginTime.Time
	}
	return &u, nil
}
