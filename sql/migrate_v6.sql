-- V3.7：用户级导出水印设置
-- 执行前请确认已执行 migrate_v5.sql

CREATE TABLE IF NOT EXISTS user_watermark_setting (
  user_id     BIGINT       NOT NULL COMMENT '用户 ID',
  enabled     TINYINT      NOT NULL DEFAULT 0 COMMENT '是否启用：0 关 1 开',
  content     VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '水印文案',
  create_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户导出水印设置';
