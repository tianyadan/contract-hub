package auth

import (
	"strings"
	"unicode/utf8"
)

// DeviceLabelFromUA 从 User-Agent 粗解析设备摘要。
func DeviceLabelFromUA(ua string) string {
	ua = strings.TrimSpace(ua)
	if ua == "" {
		return "未知设备"
	}
	browser := "Browser"
	switch {
	case strings.Contains(ua, "Edg/"):
		browser = "Edge"
	case strings.Contains(ua, "Chrome/") && !strings.Contains(ua, "Edg/"):
		browser = "Chrome"
	case strings.Contains(ua, "Firefox/"):
		browser = "Firefox"
	case strings.Contains(ua, "Safari/") && !strings.Contains(ua, "Chrome/"):
		browser = "Safari"
	case strings.Contains(ua, "MicroMessenger"):
		browser = "微信"
	}

	osName := "Unknown"
	switch {
	case strings.Contains(ua, "iPhone"):
		osName = "iPhone"
	case strings.Contains(ua, "iPad"):
		osName = "iPad"
	case strings.Contains(ua, "Android"):
		osName = "Android"
	case strings.Contains(ua, "Windows"):
		osName = "Windows"
	case strings.Contains(ua, "Mac OS X"):
		osName = "macOS"
	case strings.Contains(ua, "Linux"):
		osName = "Linux"
	}

	label := browser + " / " + osName
	if utf8.RuneCountInString(label) > 64 {
		runes := []rune(label)
		return string(runes[:64])
	}
	return label
}
