package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// UserClaims 是登录后 JWT 中携带的用户信息。
type UserClaims struct {
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
	Role     int8   `json:"role"`
	jwt.RegisteredClaims
}

// GenerateToken 生成 HS256 签名 JWT，返回 token 字符串和过期时间。
func GenerateToken(userID int64, username string, role int8, secret string, expire time.Duration) (string, time.Time, error) {
	now := time.Now()
	expiresAt := now.Add(expire)

	claims := UserClaims{
		UserID:   userID,
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   username,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", time.Time{}, err
	}
	return signed, expiresAt, nil
}

// ParseToken 解析并校验 JWT，同时校验签名算法必须是 HMAC。
func ParseToken(tokenString, secret string) (*UserClaims, error) {
	claims := &UserClaims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}
