package service

import (
	"context"

	"github.com/lshc/contract-hub/backend/internal/model"
	"github.com/lshc/contract-hub/backend/internal/repository"
)

// inheritVersionFileMeta 将上一版本的 DOCX 归档元数据复制到新版本。
func inheritVersionFileMeta(version *model.ContractVersion, from *model.ContractVersion) {
	if version == nil || from == nil {
		return
	}
	version.OssObjectKey = from.OssObjectKey
	version.OssURL = from.OssURL
	version.FileName = from.FileName
	version.FileSize = from.FileSize
	version.FileHash = from.FileHash
}

// resolvePreviewDocxSource 解析可用于预览的 DOCX OSS 路径（当前版本优先，否则回退 V1）。
func resolvePreviewDocxSource(
	ctx context.Context,
	contracts *repository.ContractRepository,
	contractID int64,
	current *model.ContractVersion,
) (objectKey, fileName string) {
	if current != nil && current.OssObjectKey != "" {
		return current.OssObjectKey, current.FileName
	}
	first, err := contracts.GetFirstVersion(ctx, contractID)
	if err != nil || first == nil || first.OssObjectKey == "" {
		return "", ""
	}
	return first.OssObjectKey, first.FileName
}
