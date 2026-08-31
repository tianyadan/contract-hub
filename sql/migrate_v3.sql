-- V3：合同终稿 PNG 导出归档字段
-- 执行前请确认已执行 migrate_v2.sql

ALTER TABLE contract_version
  ADD COLUMN export_png_oss_prefix VARCHAR(500) DEFAULT NULL COMMENT '终稿 PNG 在 OSS 上的目录前缀',
  ADD COLUMN export_png_page_count INT NOT NULL DEFAULT 0 COMMENT 'PNG 页数',
  ADD COLUMN export_png_hash VARCHAR(64) DEFAULT NULL COMMENT 'PNG 清单哈希',
  ADD COLUMN exported_at DATETIME DEFAULT NULL COMMENT 'PNG 导出归档时间';
