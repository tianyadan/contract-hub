package auth

import "errors"

// 会话相关错误（供中间件 errors.Is 判断）。
var (
	ErrSessionReplaced = errors.New("账号已在其他设备登录")
	ErrSessionInvalid  = errors.New("登录会话已失效，请重新登录")
)
