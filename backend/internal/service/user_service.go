package service

import (
	"context"
	"errors"
	"net/mail"
	"strings"
	"sync/atomic"
	"time"

	"github.com/lshc/contract-hub/backend/internal/auth"
	"github.com/lshc/contract-hub/backend/internal/model"
	"github.com/lshc/contract-hub/backend/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

// 业务错误，handler 层根据类型转换成 HTTP 状态码。
var (
	ErrInvalidInput       = errors.New("请求参数不合法")
	ErrUserExists         = errors.New("用户名已存在")
	ErrInvalidCredentials = errors.New("用户名或密码错误")
	ErrUserDisabled       = errors.New("账号已被禁用")
	ErrUserNotFound       = errors.New("用户不存在")
)

// AuthService 用户注册、登录、当前用户查询等业务逻辑。
type AuthService struct {
	users       *repository.UserRepository
	jwtSecret   string
	tokenExpire time.Duration
}

// NewAuthService 创建认证服务。
func NewAuthService(users *repository.UserRepository, jwtSecret string, tokenExpire time.Duration) *AuthService {
	return &AuthService{
		users:       users,
		jwtSecret:   jwtSecret,
		tokenExpire: tokenExpire,
	}
}

// RegisterInput 注册接口入参。
type RegisterInput struct {
	Username string
	Password string
	Nickname string
	Phone    string
	Email    string
}

// LoginInput 登录接口入参。
type LoginInput struct {
	Username string
	Password string
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
	CreateTime time.Time `json:"create_time"`
}

// LoginResult 登录成功返回 token 和用户信息。
type LoginResult struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	User      UserVO    `json:"user"`
}

// Register 注册新用户。
func (s *AuthService) Register(ctx context.Context, input RegisterInput) (*UserVO, error) {
	input.Username = strings.TrimSpace(input.Username)
	input.Password = strings.TrimSpace(input.Password)
	input.Nickname = strings.TrimSpace(input.Nickname)
	input.Phone = strings.TrimSpace(input.Phone)
	input.Email = strings.TrimSpace(input.Email)

	if err := validateRegisterInput(input); err != nil {
		return nil, err
	}

	// 注册前检查用户名是否已存在
	exists, err := s.users.GetByUsername(ctx, input.Username)
	if err != nil {
		return nil, err
	}
	if exists != nil {
		return nil, ErrUserExists
	}

	// 使用 bcrypt 生成密码 Hash，禁止明文保存密码
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
		Status:     1,
		CreateTime: now,
		UpdateTime: now,
	}

	if err := s.users.Create(ctx, user); err != nil {
		return nil, err
	}

	return toUserVO(user), nil
}

// Login 校验用户名密码，成功则返回 JWT。
func (s *AuthService) Login(ctx context.Context, input LoginInput, ip string) (*LoginResult, error) {
	input.Username = strings.TrimSpace(input.Username)
	input.Password = strings.TrimSpace(input.Password)

	if input.Username == "" || input.Password == "" {
		return nil, ErrInvalidInput
	}

	user, err := s.users.GetByUsername(ctx, input.Username)
	if err != nil {
		return nil, err
	}
	// 用户不存在和密码错误统一提示，避免泄露账号是否存在
	if user == nil || bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)) != nil {
		return nil, ErrInvalidCredentials
	}

	if user.Status != 1 {
		return nil, ErrUserDisabled
	}

	// 更新最后登录时间和 IP
	loginTime := time.Now()
	if err := s.users.UpdateLastLogin(ctx, user.ID, loginTime, ip); err != nil {
		// 登录主流程不应因更新失败而中断，这里先忽略该错误
		_ = err
	}

	token, expiresAt, err := auth.GenerateToken(user.ID, user.Username, s.jwtSecret, s.tokenExpire)
	if err != nil {
		return nil, err
	}

	return &LoginResult{
		Token:     token,
		ExpiresAt: expiresAt,
		User:      *toUserVO(user),
	}, nil
}

// GetUserByID 根据 ID 获取用户，用于 /api/auth/me。
func (s *AuthService) GetUserByID(ctx context.Context, id int64) (*UserVO, error) {
	user, err := s.users.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrUserNotFound
	}
	return toUserVO(user), nil
}

// validateRegisterInput 校验注册参数。
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

// toUserVO 把数据库模型转成前端可用的 VO，不暴露密码字段。
func toUserVO(u *model.SysUser) *UserVO {
	return &UserVO{
		ID:         u.ID,
		Username:   u.Username,
		Nickname:   u.Nickname,
		Phone:      u.Phone,
		Email:      u.Email,
		AvatarURL:  u.AvatarURL,
		Status:     u.Status,
		CreateTime: u.CreateTime,
	}
}

// 简单的进程内 ID 生成器：毫秒时间戳 + 自增序号。
// 本系统用户量不大，满足 V1 使用；后续可替换为雪花算法。
var idSeq uint64

func nextID() int64 {
	ts := uint64(time.Now().UnixMilli())
	seq := atomic.AddUint64(&idSeq, 1) % 1000
	return int64(ts*1000 + seq)
}
