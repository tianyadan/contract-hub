package auth

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math/big"
	"strings"
	"sync"
	"time"

	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

// CaptchaPayload 下发给前端的验证码数据。
type CaptchaPayload struct {
	CaptchaID  string `json:"captcha_id"`
	ImageBase64 string `json:"image_base64"` // data:image/png;base64,...
}

type captchaEntry struct {
	code      string
	expiresAt time.Time
}

// CaptchaStore 进程内图形验证码存储。
type CaptchaStore struct {
	mu      sync.Mutex
	entries map[string]captchaEntry
	ttl     time.Duration
}

// NewCaptchaStore 创建验证码存储，默认 5 分钟有效。
func NewCaptchaStore() *CaptchaStore {
	return &CaptchaStore{
		entries: make(map[string]captchaEntry),
		ttl:     5 * time.Minute,
	}
}

// Generate 生成图形验证码。
func (s *CaptchaStore) Generate() (*CaptchaPayload, error) {
	code, err := randomDigits(4)
	if err != nil {
		return nil, err
	}
	id, err := randomID(16)
	if err != nil {
		return nil, err
	}
	imgB64, err := renderCaptchaPNG(code)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.cleanupLocked()
	s.entries[id] = captchaEntry{code: code, expiresAt: time.Now().Add(s.ttl)}
	s.mu.Unlock()

	return &CaptchaPayload{
		CaptchaID:   id,
		ImageBase64: "data:image/png;base64," + imgB64,
	}, nil
}

// Verify 校验并消费验证码（一次性）。
func (s *CaptchaStore) Verify(id, code string) bool {
	id = strings.TrimSpace(id)
	code = strings.TrimSpace(code)
	if id == "" || code == "" {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupLocked()
	entry, ok := s.entries[id]
	if !ok || time.Now().After(entry.expiresAt) {
		delete(s.entries, id)
		return false
	}
	delete(s.entries, id)
	return strings.EqualFold(entry.code, code)
}

func (s *CaptchaStore) cleanupLocked() {
	now := time.Now()
	for k, v := range s.entries {
		if now.After(v.expiresAt) {
			delete(s.entries, k)
		}
	}
}

// LoginFailStore 登录失败计数（username+IP）。
type LoginFailStore struct {
	mu      sync.Mutex
	counts  map[string]int
	ttl     time.Duration
	expires map[string]time.Time
}

// NewLoginFailStore 创建失败计数器。
func NewLoginFailStore() *LoginFailStore {
	return &LoginFailStore{
		counts:  make(map[string]int),
		expires: make(map[string]time.Time),
		ttl:     30 * time.Minute,
	}
}

func failKey(username, ip string) string {
	return strings.ToLower(strings.TrimSpace(username)) + "|" + strings.TrimSpace(ip)
}

// Get 获取当前失败次数。
func (s *LoginFailStore) Get(username, ip string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupLocked()
	return s.counts[failKey(username, ip)]
}

// Incr 失败次数 +1，返回最新值。
func (s *LoginFailStore) Incr(username, ip string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupLocked()
	k := failKey(username, ip)
	s.counts[k]++
	s.expires[k] = time.Now().Add(s.ttl)
	return s.counts[k]
}

// Reset 登录成功后清零。
func (s *LoginFailStore) Reset(username, ip string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := failKey(username, ip)
	delete(s.counts, k)
	delete(s.expires, k)
}

func (s *LoginFailStore) cleanupLocked() {
	now := time.Now()
	for k, exp := range s.expires {
		if now.After(exp) {
			delete(s.expires, k)
			delete(s.counts, k)
		}
	}
}

func randomDigits(n int) (string, error) {
	const digits = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	b := make([]byte, n)
	for i := 0; i < n; i++ {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(digits))))
		if err != nil {
			return "", err
		}
		b[i] = digits[idx.Int64()]
	}
	return string(b), nil
}

func randomID(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", b), nil
}

// renderCaptchaPNG 用内置字体绘制简单验证码图。
func renderCaptchaPNG(code string) (string, error) {
	const w, h = 140, 48
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.RGBA{R: 245, G: 247, B: 250, A: 255}}, image.Point{}, draw.Src)

	// 干扰线
	for i := 0; i < 4; i++ {
		y := 8 + i*10
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: 200, G: 210, B: 220, A: 255})
		}
	}

	d := &font.Drawer{
		Dst:  img,
		Src:  image.NewUniform(color.RGBA{R: 30, G: 60, B: 120, A: 255}),
		Face: basicfont.Face7x13,
		Dot:  fixed.P(18, 30),
	}
	d.DrawString(code)

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}
