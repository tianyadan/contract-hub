package service

import (
	"context"
	"fmt"
	"path"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/lshc/contract-hub/backend/internal/model"
	"github.com/lshc/contract-hub/backend/internal/oss"
	"github.com/lshc/contract-hub/backend/internal/repository"
)

const (
	maxSealNameLen   = 64
	maxSealFileBytes = 2 * 1024 * 1024
	maxSealsPerUser  = 20
)

// SealAssetVO 电子章对外结构。
type SealAssetVO struct {
	ID         int64     `json:"id"`
	Name       string    `json:"name"`
	FileURL    string    `json:"file_url"`
	MimeType   string    `json:"mime_type"`
	FileSize   int       `json:"file_size"`
	WidthPx    int       `json:"width_px"`
	HeightPx   int       `json:"height_px"`
	IsDefault  bool      `json:"is_default"`
	CreateTime time.Time `json:"create_time"`
}

// SealService 用户电子章库业务。
type SealService struct {
	repo *repository.SealRepository
	oss  *oss.Client
}

// NewSealService 创建电子章服务。
func NewSealService(repo *repository.SealRepository, ossClient *oss.Client) *SealService {
	return &SealService{repo: repo, oss: ossClient}
}

// List 列出当前用户章库。
func (s *SealService) List(ctx context.Context, userID int64) ([]SealAssetVO, error) {
	rows, err := s.repo.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]SealAssetVO, 0, len(rows))
	for _, row := range rows {
		out = append(out, s.toSealVO(row))
	}
	return out, nil
}

// Upload 上传电子章到 OSS 并入库。
func (s *SealService) Upload(
	ctx context.Context,
	userID int64,
	name string,
	data []byte,
	mimeType string,
	setDefault bool,
) (*SealAssetVO, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "电子章"
	}
	if utf8.RuneCountInString(name) > maxSealNameLen {
		return nil, fmt.Errorf("%w: 印章名称不能超过 %d 字", ErrInvalidInput, maxSealNameLen)
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("%w: 请上传印章图片", ErrInvalidInput)
	}
	if len(data) > maxSealFileBytes {
		return nil, fmt.Errorf("%w: 印章图片不能超过 2MB", ErrInvalidInput)
	}
	mimeType = strings.ToLower(strings.TrimSpace(mimeType))
	if mimeType == "image/jpg" {
		mimeType = "image/jpeg"
	}
	if !isAllowedSealMime(mimeType) {
		return nil, fmt.Errorf("%w: 仅支持 PNG / JPEG / WebP", ErrInvalidInput)
	}

	count, err := s.repo.CountByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	if count >= maxSealsPerUser {
		return nil, fmt.Errorf("%w: 最多上传 %d 枚电子章", ErrInvalidInput, maxSealsPerUser)
	}

	ext := mimeToExt(mimeType)
	objectKey := fmt.Sprintf("users/%d/seals/%d%s", userID, time.Now().UnixNano(), ext)
	fileURL, err := s.oss.UploadBytes(ctx, objectKey, data, mimeType)
	if err != nil {
		return nil, err
	}

	isFirst := count == 0
	asset := &model.UserSealAsset{
		UserID:    userID,
		Name:      name,
		OssKey:    objectKey,
		FileURL:   fileURL,
		MimeType:  mimeType,
		FileSize:  len(data),
		IsDefault: setDefault || isFirst,
		Status:    1,
	}
	id, err := s.repo.Insert(ctx, asset)
	if err != nil {
		_ = s.oss.DeleteObject(ctx, objectKey)
		return nil, err
	}
	asset.ID = id

	if asset.IsDefault {
		_ = s.repo.ClearDefault(ctx, userID, id)
	}

	vo := s.toSealVO(*asset)
	return &vo, nil
}

// Update 更新名称或默认章。
func (s *SealService) Update(ctx context.Context, userID, id int64, name string, isDefault *bool) (*SealAssetVO, error) {
	existing, err := s.repo.GetByIDForUser(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, fmt.Errorf("%w: 电子章不存在", ErrInvalidInput)
	}
	newName := strings.TrimSpace(name)
	if newName == "" {
		newName = existing.Name
	}
	if utf8.RuneCountInString(newName) > maxSealNameLen {
		return nil, fmt.Errorf("%w: 印章名称不能超过 %d 字", ErrInvalidInput, maxSealNameLen)
	}
	def := existing.IsDefault
	if isDefault != nil {
		def = *isDefault
	}
	if err := s.repo.UpdateMeta(ctx, id, userID, newName, def); err != nil {
		return nil, err
	}
	if def {
		_ = s.repo.ClearDefault(ctx, userID, id)
	}
	saved, err := s.repo.GetByIDForUser(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	vo := s.toSealVO(*saved)
	return &vo, nil
}

// Delete 软删除电子章。
func (s *SealService) Delete(ctx context.Context, userID, id int64) error {
	existing, err := s.repo.GetByIDForUser(ctx, id, userID)
	if err != nil {
		return err
	}
	if existing == nil {
		return fmt.Errorf("%w: 电子章不存在", ErrInvalidInput)
	}
	return s.repo.SoftDelete(ctx, id, userID)
}

func (s *SealService) toSealVO(a model.UserSealAsset) SealAssetVO {
	return SealAssetVO{
		ID:         a.ID,
		Name:       a.Name,
		FileURL:    s.signedFileURL(a.OssKey),
		MimeType:   a.MimeType,
		FileSize:   a.FileSize,
		WidthPx:    a.WidthPx,
		HeightPx:   a.HeightPx,
		IsDefault:  a.IsDefault,
		CreateTime: a.CreateTime,
	}
}

// signedFileURL 私有桶签名访问地址（约 7 天）；失败时回退公开 URL。
func (s *SealService) signedFileURL(ossKey string) string {
	if ossKey == "" {
		return ""
	}
	url, err := s.oss.SignURL(ossKey, 7*24*3600)
	if err != nil || url == "" {
		return s.oss.PublicURL(ossKey)
	}
	return url
}

// DownloadForUser 下载用户名下某枚章的二进制（同源代理用）。
func (s *SealService) DownloadForUser(ctx context.Context, userID, id int64) (data []byte, mimeType string, err error) {
	existing, err := s.repo.GetByIDForUser(ctx, id, userID)
	if err != nil {
		return nil, "", err
	}
	if existing == nil {
		return nil, "", fmt.Errorf("%w: 电子章不存在", ErrInvalidInput)
	}
	data, err = s.oss.Download(ctx, existing.OssKey)
	if err != nil {
		return nil, "", err
	}
	mime := existing.MimeType
	if mime == "" {
		mime = "image/png"
	}
	return data, mime, nil
}

func isAllowedSealMime(mime string) bool {
	switch mime {
	case "image/png", "image/jpeg", "image/webp":
		return true
	default:
		return false
	}
}

func mimeToExt(mime string) string {
	switch mime {
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	default:
		return ".png"
	}
}

// GuessSealMime 根据文件名猜测 MIME。
func GuessSealMime(filename string) string {
	ext := strings.ToLower(path.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".png":
		return "image/png"
	default:
		return ""
	}
}
