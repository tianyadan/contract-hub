package service

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

const verifyCodeAlphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// generateVerifyCode 生成扫码验真短码。
func generateVerifyCode(length int) (string, error) {
	if length <= 0 {
		length = 20
	}
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, length)
	for i, b := range buf {
		out[i] = verifyCodeAlphabet[int(b)%len(verifyCodeAlphabet)]
	}
	return string(out), nil
}

// sha256Hex 计算文件 SHA256 十六进制。
func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// matchFileHash 校验上传文件哈希（忽略大小写）。
func matchFileHash(data []byte, expected string) bool {
	expected = strings.TrimSpace(strings.ToLower(expected))
	if expected == "" {
		return false
	}
	return sha256Hex(data) == expected
}
