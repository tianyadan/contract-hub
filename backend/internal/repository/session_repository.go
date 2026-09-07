package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/lshc/contract-hub/backend/internal/model"
)

// SessionRepository 用户会话与登录日志。
type SessionRepository struct {
	db *sql.DB
}

// NewSessionRepository 创建会话仓库。
func NewSessionRepository(db *sql.DB) *SessionRepository {
	return &SessionRepository{db: db}
}

// CreateSession 创建有效会话。
func (r *SessionRepository) CreateSession(ctx context.Context, s *model.UserSession) error {
	_, err := r.db.ExecContext(ctx, `
INSERT INTO user_session (
  id, user_id, session_token, login_ip, user_agent, device_label,
  status, login_time, last_seen_time
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`, s.ID, s.UserID, s.SessionToken, nullString(s.LoginIP), nullString(s.UserAgent), nullString(s.DeviceLabel),
		s.Status, s.LoginTime, s.LastSeenTime)
	return err
}

// RevokeActiveByUser 将该用户全部有效会话置为失效。
func (r *SessionRepository) RevokeActiveByUser(ctx context.Context, userID int64, reason string, at time.Time) error {
	_, err := r.db.ExecContext(ctx, `
UPDATE user_session
SET status = ?, revoke_time = ?, revoke_reason = ?
WHERE user_id = ? AND status = ?
`, model.SessionStatusRevoked, at, nullString(reason), userID, model.SessionStatusActive)
	return err
}

// RevokeByToken 按 session_token 注销当前会话。
func (r *SessionRepository) RevokeByToken(ctx context.Context, sessionToken, reason string, at time.Time) error {
	_, err := r.db.ExecContext(ctx, `
UPDATE user_session
SET status = ?, revoke_time = ?, revoke_reason = ?
WHERE session_token = ? AND status = ?
`, model.SessionStatusRevoked, at, nullString(reason), sessionToken, model.SessionStatusActive)
	return err
}

// IsActiveSession 判断会话是否仍有效。
func (r *SessionRepository) IsActiveSession(ctx context.Context, userID int64, sessionToken string) (bool, error) {
	var n int
	err := r.db.QueryRowContext(ctx, `
SELECT COUNT(1) FROM user_session
WHERE user_id = ? AND session_token = ? AND status = ?
`, userID, sessionToken, model.SessionStatusActive).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// InsertLoginLog 写入登录日志。
func (r *SessionRepository) InsertLoginLog(ctx context.Context, log *model.UserLoginLog) error {
	_, err := r.db.ExecContext(ctx, `
INSERT INTO user_login_log (
  id, user_id, session_id, login_ip, user_agent, device_label, login_time, result, fail_reason
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`, log.ID, log.UserID, log.SessionID, nullString(log.LoginIP), nullString(log.UserAgent), nullString(log.DeviceLabel),
		log.LoginTime, log.Result, nullString(log.FailReason))
	return err
}
