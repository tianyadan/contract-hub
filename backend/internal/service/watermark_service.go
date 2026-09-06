package service

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/lshc/contract-hub/backend/internal/model"
	"github.com/lshc/contract-hub/backend/internal/repository"
)

const maxWatermarkContentLen = 64

// 水印视觉参数默认值与合法区间
const (
	DefaultWatermarkDensity  = 5
	DefaultWatermarkFontSize = 22
	DefaultWatermarkRotate   = -28
	DefaultWatermarkOpacity  = 18

	MinWatermarkDensity  = 1
	MaxWatermarkDensity  = 10
	MinWatermarkFontSize = 12
	MaxWatermarkFontSize = 48
	MinWatermarkRotate   = -60
	MaxWatermarkRotate   = 0
	MinWatermarkOpacity  = 5
	MaxWatermarkOpacity  = 40
)

// WatermarkSettingVO 水印设置对外返回结构。
type WatermarkSettingVO struct {
	Enabled  bool   `json:"enabled"`
	Content  string `json:"content"`
	Density  int    `json:"density"`
	FontSize int    `json:"font_size"`
	Rotate   int    `json:"rotate"`
	Opacity  int    `json:"opacity"`
}

// SaveWatermarkInput 保存水印入参。
type SaveWatermarkInput struct {
	Enabled  bool
	Content  string
	Density  int
	FontSize int
	Rotate   int
	Opacity  int
}

// WatermarkService 用户导出水印业务。
type WatermarkService struct {
	repo *repository.WatermarkRepository
}

// NewWatermarkService 创建水印服务。
func NewWatermarkService(repo *repository.WatermarkRepository) *WatermarkService {
	return &WatermarkService{repo: repo}
}

// defaultVO 无记录时的默认返回。
func defaultVO() *WatermarkSettingVO {
	return &WatermarkSettingVO{
		Enabled:  false,
		Content:  "",
		Density:  DefaultWatermarkDensity,
		FontSize: DefaultWatermarkFontSize,
		Rotate:   DefaultWatermarkRotate,
		Opacity:  DefaultWatermarkOpacity,
	}
}

// toVO 模型转 VO，并对异常值回填默认。
func toVO(row *model.UserWatermarkSetting) *WatermarkSettingVO {
	vo := &WatermarkSettingVO{
		Enabled:  row.Enabled,
		Content:  row.Content,
		Density:  row.Density,
		FontSize: row.FontSize,
		Rotate:   row.Rotate,
		Opacity:  row.Opacity,
	}
	normalizeVO(vo)
	return vo
}

// normalizeVO 将越界或零值视觉参数规范到合法区间。
func normalizeVO(vo *WatermarkSettingVO) {
	if vo.Density < MinWatermarkDensity || vo.Density > MaxWatermarkDensity {
		vo.Density = DefaultWatermarkDensity
	}
	if vo.FontSize < MinWatermarkFontSize || vo.FontSize > MaxWatermarkFontSize {
		vo.FontSize = DefaultWatermarkFontSize
	}
	if vo.Rotate < MinWatermarkRotate || vo.Rotate > MaxWatermarkRotate {
		vo.Rotate = DefaultWatermarkRotate
	}
	if vo.Opacity < MinWatermarkOpacity || vo.Opacity > MaxWatermarkOpacity {
		vo.Opacity = DefaultWatermarkOpacity
	}
}

// clampInt 将值限制在 [min, max]。
func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// Get 获取当前用户水印设置；无记录返回默认关闭。
func (s *WatermarkService) Get(ctx context.Context, userID int64) (*WatermarkSettingVO, error) {
	row, err := s.repo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return defaultVO(), nil
	}
	return toVO(row), nil
}

// Save 保存当前用户水印设置。
func (s *WatermarkService) Save(ctx context.Context, userID int64, in SaveWatermarkInput) (*WatermarkSettingVO, error) {
	content := strings.TrimSpace(in.Content)
	if utf8.RuneCountInString(content) > maxWatermarkContentLen {
		return nil, fmt.Errorf("%w: 水印内容最多 %d 个字符", ErrInvalidInput, maxWatermarkContentLen)
	}
	if in.Enabled && content == "" {
		return nil, fmt.Errorf("%w: 开启水印时内容不能为空", ErrInvalidInput)
	}

	density := clampInt(in.Density, MinWatermarkDensity, MaxWatermarkDensity)
	fontSize := clampInt(in.FontSize, MinWatermarkFontSize, MaxWatermarkFontSize)
	rotate := clampInt(in.Rotate, MinWatermarkRotate, MaxWatermarkRotate)
	opacity := clampInt(in.Opacity, MinWatermarkOpacity, MaxWatermarkOpacity)

	// 未传或传 0 时（前端老客户端）回退默认
	if in.Density == 0 {
		density = DefaultWatermarkDensity
	}
	if in.FontSize == 0 {
		fontSize = DefaultWatermarkFontSize
	}
	if in.Opacity == 0 {
		opacity = DefaultWatermarkOpacity
	}
	// rotate 合法含 0，不做零值回退

	setting := &model.UserWatermarkSetting{
		UserID:   userID,
		Enabled:  in.Enabled,
		Content:  content,
		Density:  density,
		FontSize: fontSize,
		Rotate:   rotate,
		Opacity:  opacity,
	}
	if err := s.repo.Upsert(ctx, setting); err != nil {
		return nil, err
	}
	return &WatermarkSettingVO{
		Enabled:  in.Enabled,
		Content:  content,
		Density:  density,
		FontSize: fontSize,
		Rotate:   rotate,
		Opacity:  opacity,
	}, nil
}
