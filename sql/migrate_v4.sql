-- V3.3：PDF 终稿归档与扫码验真
-- 执行前请确认已执行 migrate_v3.sql

ALTER TABLE contract_version
  ADD COLUMN export_pdf_oss_key    VARCHAR(500) DEFAULT NULL COMMENT '终稿 PDF 在 OSS 上的 object key',
  ADD COLUMN export_pdf_hash       VARCHAR(64)  DEFAULT NULL COMMENT 'PDF 文件 SHA256',
  ADD COLUMN export_pdf_page_count INT NOT NULL DEFAULT 0 COMMENT 'PDF 页数',
  ADD COLUMN pdf_exported_at       DATETIME     DEFAULT NULL COMMENT 'PDF 归档时间',
  ADD COLUMN verify_code           VARCHAR(32)  DEFAULT NULL COMMENT '扫码验真短码（唯一）',
  ADD UNIQUE KEY uk_verify_code (verify_code);
