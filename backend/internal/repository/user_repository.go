package repository

import (
	"context"
	"database/sql"
	"errors"
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
status, last_login_time, last_login_ip, create_time, update_time
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, user.ID, user.Username, user.Password, nullString(user.Nickname), nullString(user.Phone), nullString(user.Email), nullString(user.AvatarURL),
		user.Status, user.LastLoginTime, nullString(user.LastLoginIP), user.CreateTime, user.UpdateTime)
	return err
}

// GetByUsername 根据用户名查询用户，常用于登录和注册查重。
func (r *UserRepository) GetByUsername(ctx context.Context, username string) (*model.SysUser, error) {
	row := r.db.QueryRowContext(ctx, `
SELECT id, username, password, nickname, phone, email, avatar_url,
       status, last_login_time, last_login_ip, create_time, update_time
FROM sys_user
WHERE username = ?
`, username)
	return scanUser(row)
}

// GetByID 根据用户 ID 查询用户，用于 JWT 鉴权后获取当前用户信息。
func (r *UserRepository) GetByID(ctx context.Context, id int64) (*model.SysUser, error) {
	row := r.db.QueryRowContext(ctx, `
SELECT id, username, password, nickname, phone, email, avatar_url,
       status, last_login_time, last_login_ip, create_time, update_time
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

// nullString 把空字符串转成 NULL，避免可空字段被写入空字符串导致唯一索引冲突。
func nullString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// scanUser 扫描一行 sys_user 数据到 model.SysUser。
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
		&u.Status, &lastLoginTime, &lastLoginIP,
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
