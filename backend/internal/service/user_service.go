package service

import (
	"context"
	"crypto/rand"
	"errors"
	"math/big"
	"net/mail"
	"strings"
	"sync/atomic"
	"time"

	"github.com/lshc/contract-hub/backend/internal/auth"
	"github.com/lshc/contract-hub/backend/internal/model"
	"github.com/lshc/contract-hub/backend/internal/repository"
	"github.com/lshc/contract-hub/backend/pkg/pagination"
	"golang.org/x/crypto/bcrypt"
)

// 业务错误，handler 层根据类型转换成 HTTP 状态码。
var (
	ErrInvalidInput       = errors.New("请求参数不合法")
	ErrUserExists         = errors.New("用户名已存在")
	ErrInvalidCredentials = errors.New("用户名或密码错误")
	ErrUserDisabled       = errors.New("账号已被禁用")
	ErrUserNotFound       = errors.New("用户不存在")
	ErrInviteInvalid      = errors.New("邀请码无效或已过期")
	ErrCaptchaRequired    = errors.New("需要验证码")
	ErrCaptchaInvalid     = errors.New("验证码错误或已过期")
	ErrForbidden          = errors.New("无权限执行该操作")
	ErrCannotOperateSelf  = errors.New("不能对自己执行该操作")
	ErrLastAdmin          = errors.New("不能操作最后一个管理员")
)

// DefaultResetPassword 管理员重置后的默认密码。
const DefaultResetPassword = "12345678"

// AuthService 用户注册、登录、当前用户查询等业务逻辑。
type AuthService struct {
	users       *repository.UserRepository
	invites     *repository.InviteCodeRepository
	captcha     *auth.CaptchaStore
	loginFails  *auth.LoginFailStore
	jwtSecret   string
	tokenExpire time.Duration
}

// NewAuthService 创建认证服务。
func NewAuthService(
	users *repository.UserRepository,
	invites *repository.InviteCodeRepository,
	captcha *auth.CaptchaStore,
	loginFails *auth.LoginFailStore,
	jwtSecret string,
	tokenExpire time.Duration,
) *AuthService {
	return &AuthService{
		users:       users,
		invites:     invites,
		captcha:     captcha,
		loginFails:  loginFails,
		jwtSecret:   jwtSecret,
		tokenExpire: tokenExpire,
	}
}

// RegisterInput 注册接口入参。
type RegisterInput struct {
	Username   string
	Password   string
	Nickname   string
	Phone      string
	Email      string
	InviteCode string
}

// LoginInput 登录接口入参。
type LoginInput struct {
	Username    string
	Password    string
	CaptchaID   string
	CaptchaCode string
}

// UserVO 返回给前端的用户信息，不包含密码 Hash。
type UserVO struct {
	ID         int64     `json:"id"`
	Username   string    `json:"username"`
	Nickname   string    `json:"nickname,omitempty"`
	Phone      string    `json:"phone,omitempty"`
	Email      string    `json:"email,omitempty"`
	AvatarURL  string    `json:"avatar_url,omitempty"`
	Status     int8      `json:"status"`
	Role       int8      `json:"role"`
	CreateTime time.Time `json:"create_time"`
}

// LoginResult 登录成功返回 token 和用户信息。
type LoginResult struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	User      UserVO    `json:"user"`
}

// LoginFailInfo 登录失败附加信息。
type LoginFailInfo struct {
	FailCount       int  `json:"fail_count"`
	CaptchaRequired bool `json:"captcha_required"`
}

// Register 注册新用户（必须邀请码）。
func (s *AuthService) Register(ctx context.Context, input RegisterInput) (*UserVO, error) {
	input.Username = strings.TrimSpace(input.Username)
	input.Password = strings.TrimSpace(input.Password)
	input.Nickname = strings.TrimSpace(input.Nickname)
	input.Phone = strings.TrimSpace(input.Phone)
	input.Email = strings.TrimSpace(input.Email)
	input.InviteCode = strings.TrimSpace(strings.ToUpper(input.InviteCode))

	if err := validateRegisterInput(input); err != nil {
		return nil, err
	}
	if input.InviteCode == "" {
		return nil, ErrInviteInvalid
	}

	exists, err := s.users.GetByUsername(ctx, input.Username)
	if err != nil {
		return nil, err
	}
	if exists != nil && exists.Status != model.UserStatusDeleted {
		return nil, ErrUserExists
	}

	inv, err := s.invites.GetByCode(ctx, input.InviteCode)
	if err != nil {
		return nil, err
	}
	if inv == nil || inv.UsedAt != nil || time.Now().After(inv.ExpireAt) {
		return nil, ErrInviteInvalid
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	user := &model.SysUser{
		ID:         nextID(),
		Username:   input.Username,
		Password:   string(passwordHash),
		Nickname:   input.Nickname,
		Phone:      input.Phone,
		Email:      input.Email,
		Status:     model.UserStatusActive,
		Role:       model.UserRoleNormal,
		CreateTime: now,
		UpdateTime: now,
	}

	tx, err := s.invites.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	affected, err := s.invites.MarkUsed(ctx, tx, inv.ID, user.ID, now)
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		return nil, ErrInviteInvalid
	}
	if err := s.invites.CreateUserTx(ctx, tx, user); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return toUserVO(user), nil
}

// Login 校验用户名密码，成功则返回 JWT。
func (s *AuthService) Login(ctx context.Context, input LoginInput, ip string) (*LoginResult, *LoginFailInfo, error) {
	input.Username = strings.TrimSpace(input.Username)
	input.Password = strings.TrimSpace(input.Password)

	if input.Username == "" || input.Password == "" {
		return nil, nil, ErrInvalidInput
	}

	failCount := s.loginFails.Get(input.Username, ip)
	needCaptcha := failCount >= 3
	if needCaptcha {
		if !s.captcha.Verify(input.CaptchaID, input.CaptchaCode) {
			info := &LoginFailInfo{FailCount: failCount, CaptchaRequired: true}
			return nil, info, ErrCaptchaInvalid
		}
	}

	user, err := s.users.GetByUsername(ctx, input.Username)
	if err != nil {
		return nil, nil, err
	}
	if user == nil || user.Status == model.UserStatusDeleted ||
		bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)) != nil {
		newCount := s.loginFails.Incr(input.Username, ip)
		info := &LoginFailInfo{FailCount: newCount, CaptchaRequired: newCount >= 3}
		return nil, info, ErrInvalidCredentials
	}

	if user.Status == model.UserStatusBanned {
		return nil, &LoginFailInfo{FailCount: failCount, CaptchaRequired: needCaptcha}, ErrUserDisabled
	}

	s.loginFails.Reset(input.Username, ip)

	loginTime := time.Now()
	_ = s.users.UpdateLastLogin(ctx, user.ID, loginTime, ip)

	token, expiresAt, err := auth.GenerateToken(user.ID, user.Username, user.Role, s.jwtSecret, s.tokenExpire)
	if err != nil {
		return nil, nil, err
	}

	return &LoginResult{
		Token:     token,
		ExpiresAt: expiresAt,
		User:      *toUserVO(user),
	}, nil, nil
}

// CreateCaptcha 生成图形验证码。
func (s *AuthService) CreateCaptcha() (*auth.CaptchaPayload, error) {
	return s.captcha.Generate()
}

// GetFailInfo 查询当前失败次数（供前端判断是否展示验证码）。
func (s *AuthService) GetFailInfo(username, ip string) LoginFailInfo {
	n := s.loginFails.Get(username, ip)
	return LoginFailInfo{FailCount: n, CaptchaRequired: n >= 3}
}

// GetUserByID 根据 ID 获取用户，用于 /api/auth/me。
func (s *AuthService) GetUserByID(ctx context.Context, id int64) (*UserVO, error) {
	user, err := s.users.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if user == nil || user.Status == model.UserStatusDeleted {
		return nil, ErrUserNotFound
	}
	return toUserVO(user), nil
}

// EnsureSeedAdmin 若无管理员则创建默认 admin / 12345678。
func (s *AuthService) EnsureSeedAdmin(ctx context.Context) error {
	n, err := s.users.CountAdmins(ctx)
	if err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	// 若已有同名用户则提升为管理员
	existing, err := s.users.GetByUsername(ctx, "admin")
	if err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(DefaultResetPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if existing != nil {
		if err := s.users.UpdatePassword(ctx, existing.ID, string(hash)); err != nil {
			return err
		}
		// 直接 SQL 更新 role/status 通过 UpdateStatus + 需要 UpdateRole
		return s.users.PromoteAdmin(ctx, existing.ID)
	}
	now := time.Now()
	admin := &model.SysUser{
		ID:         nextID(),
		Username:   "admin",
		Password:   string(hash),
		Nickname:   "系统管理员",
		Status:     model.UserStatusActive,
		Role:       model.UserRoleAdmin,
		CreateTime: now,
		UpdateTime: now,
	}
	return s.users.Create(ctx, admin)
}

// AdminService 管理员用户与邀请码业务。
type AdminService struct {
	users   *repository.UserRepository
	invites *repository.InviteCodeRepository
}

// NewAdminService 创建管理员服务。
func NewAdminService(users *repository.UserRepository, invites *repository.InviteCodeRepository) *AdminService {
	return &AdminService{users: users, invites: invites}
}

// AdminUserListQuery 用户列表查询。
type AdminUserListQuery struct {
	Keyword  string
	Status   *int8
	Page     int
	PageSize int
}

// ListUsers 管理员分页用户列表。
func (s *AdminService) ListUsers(ctx context.Context, q AdminUserListQuery) (*pagination.PageResult[UserVO], error) {
	pageQuery := &pagination.Query{Page: q.Page, PageSize: q.PageSize}
	pageQuery.Normalize()
	list, total, err := s.users.ListUsers(ctx, q.Keyword, q.Status, pageQuery.Page, pageQuery.PageSize)
	if err != nil {
		return nil, err
	}
	items := make([]UserVO, 0, len(list))
	for i := range list {
		items = append(items, *toUserVO(&list[i]))
	}
	result := pagination.NewPageResult(items, total, pageQuery.Page, pageQuery.PageSize)
	return &result, nil
}

// BanUser 封禁用户。
func (s *AdminService) BanUser(ctx context.Context, operatorID, targetID int64) error {
	return s.changeStatus(ctx, operatorID, targetID, model.UserStatusBanned)
}

// EnableUser 启用用户。
func (s *AdminService) EnableUser(ctx context.Context, operatorID, targetID int64) error {
	return s.changeStatus(ctx, operatorID, targetID, model.UserStatusActive)
}

// DeleteUser 软删除用户。
func (s *AdminService) DeleteUser(ctx context.Context, operatorID, targetID int64) error {
	return s.changeStatus(ctx, operatorID, targetID, model.UserStatusDeleted)
}

// ResetPassword 重置为默认密码 12345678。
func (s *AdminService) ResetPassword(ctx context.Context, operatorID, targetID int64) error {
	if operatorID == targetID {
		return ErrCannotOperateSelf
	}
	target, err := s.users.GetByID(ctx, targetID)
	if err != nil {
		return err
	}
	if target == nil || target.Status == model.UserStatusDeleted {
		return ErrUserNotFound
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(DefaultResetPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return s.users.UpdatePassword(ctx, targetID, string(hash))
}

func (s *AdminService) changeStatus(ctx context.Context, operatorID, targetID int64, status int8) error {
	if operatorID == targetID {
		return ErrCannotOperateSelf
	}
	target, err := s.users.GetByID(ctx, targetID)
	if err != nil {
		return err
	}
	if target == nil || target.Status == model.UserStatusDeleted {
		return ErrUserNotFound
	}
	// 封禁或删除管理员时，保证至少保留一个管理员
	if target.Role == model.UserRoleAdmin && (status == model.UserStatusBanned || status == model.UserStatusDeleted) {
		n, err := s.users.CountAdmins(ctx)
		if err != nil {
			return err
		}
		if n <= 1 {
			return ErrLastAdmin
		}
	}
	return s.users.UpdateStatus(ctx, targetID, status)
}

// InviteCodeVO 邀请码视图。
type InviteCodeVO struct {
	ID         int64      `json:"id"`
	Code       string     `json:"code"`
	ExpireAt   time.Time  `json:"expire_at"`
	UsedAt     *time.Time `json:"used_at,omitempty"`
	UsedBy     *int64     `json:"used_by_user_id,omitempty"`
	CreateTime time.Time  `json:"create_time"`
	Expired    bool       `json:"expired"`
	Used       bool       `json:"used"`
}

// CreateInviteCode 生成一次性邀请码（5 分钟有效）。
func (s *AdminService) CreateInviteCode(ctx context.Context, adminID int64) (*InviteCodeVO, error) {
	code, err := randomInviteCode(8)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	inv := &model.InviteCode{
		ID:         nextID(),
		Code:       code,
		CreatedBy:  adminID,
		ExpireAt:   now.Add(5 * time.Minute),
		CreateTime: now,
	}
	if err := s.invites.Create(ctx, inv); err != nil {
		return nil, err
	}
	return toInviteVO(inv), nil
}

// ListInviteCodes 最近邀请码。
func (s *AdminService) ListInviteCodes(ctx context.Context, limit int) ([]InviteCodeVO, error) {
	list, err := s.invites.ListRecent(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]InviteCodeVO, 0, len(list))
	for i := range list {
		out = append(out, *toInviteVO(&list[i]))
	}
	return out, nil
}

func toInviteVO(inv *model.InviteCode) *InviteCodeVO {
	return &InviteCodeVO{
		ID:         inv.ID,
		Code:       inv.Code,
		ExpireAt:   inv.ExpireAt,
		UsedAt:     inv.UsedAt,
		UsedBy:     inv.UsedByUserID,
		CreateTime: inv.CreateTime,
		Expired:    time.Now().After(inv.ExpireAt),
		Used:       inv.UsedAt != nil,
	}
}

func randomInviteCode(n int) (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, n)
	for i := 0; i < n; i++ {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			return "", err
		}
		b[i] = alphabet[idx.Int64()]
	}
	return string(b), nil
}

func validateRegisterInput(input RegisterInput) error {
	if len(input.Username) < 3 || len(input.Username) > 64 {
		return ErrInvalidInput
	}
	if len(input.Password) < 6 || len(input.Password) > 72 {
		return ErrInvalidInput
	}
	if len(input.Nickname) > 64 {
		return ErrInvalidInput
	}
	if len(input.Phone) > 32 {
		return ErrInvalidInput
	}
	if input.Email != "" {
		if len(input.Email) > 128 {
			return ErrInvalidInput
		}
		if _, err := mail.ParseAddress(input.Email); err != nil {
			return ErrInvalidInput
		}
	}
	return nil
}

func toUserVO(u *model.SysUser) *UserVO {
	return &UserVO{
		ID:         u.ID,
		Username:   u.Username,
		Nickname:   u.Nickname,
		Phone:      u.Phone,
		Email:      u.Email,
		AvatarURL:  u.AvatarURL,
		Status:     u.Status,
		Role:       u.Role,
		CreateTime: u.CreateTime,
	}
}

var idSeq uint64

func nextID() int64 {
	ts := uint64(time.Now().UnixMilli())
	seq := atomic.AddUint64(&idSeq, 1) % 1000
	return int64(ts*1000 + seq)
}
