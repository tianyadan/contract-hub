-- V3.5：高保真阅览快照（预览 PDF + 文档 JSON 快照）
-- 执行前请确认已执行 migrate_v4.sql

CREATE TABLE IF NOT EXISTS fidelity_snapshot (
  id                     BIGINT PRIMARY KEY,
  entity_type            TINYINT NOT NULL COMMENT '0=contract 1=template',
  entity_id              BIGINT NOT NULL COMMENT 'contract_id 或 template_id',
  snapshot_no            INT NOT NULL COMMENT '实体内的快照序号，从 1 递增',
  source_version_no      INT NOT NULL COMMENT '生成时绑定的内容版本号',
  document_content       LONGTEXT NOT NULL COMMENT '生成时刻 JSON 快照，供回退',
  preview_pdf_oss_key    VARCHAR(500) NOT NULL,
  preview_pdf_hash       VARCHAR(64) NOT NULL,
  preview_pdf_page_count INT NOT NULL DEFAULT 0,
  created_by_user_id     BIGINT DEFAULT NULL COMMENT '内部用户 ID',
  created_by_name        VARCHAR(64) NOT NULL COMMENT '展示用操作人姓名',
  create_time            DATETIME NOT NULL,
  UNIQUE KEY uk_entity_snapshot (entity_type, entity_id, snapshot_no),
  KEY idx_entity_time (entity_type, entity_id, create_time)
) COMMENT='高保真阅览快照（预览 PDF + 文档 JSON）';
