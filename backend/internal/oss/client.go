package oss

import (
	"bytes"
	"context"
	"fmt"
	"io"

	aliyunoss "github.com/aliyun/aliyun-oss-go-sdk/oss"

	"github.com/lshc/contract-hub/backend/internal/config"
)

// Client 封装阿里云 OSS 上传能力。
type Client struct {
	bucket        *aliyunoss.Bucket
	publicBaseURL string
}

// NewClient 根据配置创建 OSS 客户端。
func NewClient(cfg *config.Config) (*Client, error) {
	client, err := aliyunoss.New(cfg.OSS.Endpoint, cfg.OSS.AccessKeyID, cfg.OSS.AccessKeySecret)
	if err != nil {
		return nil, fmt.Errorf("create oss client failed: %w", err)
	}

	bucket, err := client.Bucket(cfg.OSS.Bucket)
	if err != nil {
		return nil, fmt.Errorf("get oss bucket failed: %w", err)
	}

	return &Client{
		bucket:        bucket,
		publicBaseURL: fmt.Sprintf("https://%s.%s", cfg.OSS.Bucket, cfg.OSS.Endpoint),
	}, nil
}

// UploadBytes 将文件内容上传到指定 OSS Object，并返回可访问 URL。
func (c *Client) UploadBytes(ctx context.Context, objectKey string, data []byte, contentType string) (string, error) {
	err := c.bucket.PutObject(objectKey, bytes.NewReader(data), aliyunoss.ContentType(contentType))
	if err != nil {
		return "", fmt.Errorf("upload oss object failed: %w", err)
	}
	return fmt.Sprintf("%s/%s", c.publicBaseURL, objectKey), nil
}

// DeleteObject 删除 OSS Object，用于创建合同失败时清理已上传的孤儿文件。
func (c *Client) DeleteObject(ctx context.Context, objectKey string) error {
	return c.bucket.DeleteObject(objectKey)
}

// CopyObject 在同一 Bucket 内复制 Object（用于模板复制到合同路径）。
func (c *Client) CopyObject(ctx context.Context, srcKey, destKey string) error {
	_, err := c.bucket.CopyObject(srcKey, destKey)
	if err != nil {
		return fmt.Errorf("copy oss object failed: %w", err)
	}
	return nil
}

// SignURL 生成带过期时间的签名下载 URL。
func (c *Client) SignURL(objectKey string, expireSeconds int64) (string, error) {
	if expireSeconds <= 0 {
		expireSeconds = 900
	}
	url, err := c.bucket.SignURL(objectKey, aliyunoss.HTTPGet, expireSeconds)
	if err != nil {
		return "", fmt.Errorf("sign oss url failed: %w", err)
	}
	return url, nil
}

// PublicURL 根据 object key 生成公开访问 URL。
func (c *Client) PublicURL(objectKey string) string {
	return fmt.Sprintf("%s/%s", c.publicBaseURL, objectKey)
}

// Download 从 OSS 下载 Object 内容。
func (c *Client) Download(ctx context.Context, objectKey string) ([]byte, error) {
	body, err := c.bucket.GetObject(objectKey)
	if err != nil {
		return nil, fmt.Errorf("get oss object failed: %w", err)
	}
	defer body.Close()

	data, err := io.ReadAll(body)
	if err != nil {
		return nil, err
	}
	return data, nil
}
