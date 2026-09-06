-- V3.7.1：水印视觉参数（密度 / 字号 / 倾斜 / 透明度）
-- 执行前请确认已执行 migrate_v6.sql

ALTER TABLE user_watermark_setting
  ADD COLUMN density   TINYINT NOT NULL DEFAULT 5  COMMENT '密度 1-10' AFTER content,
  ADD COLUMN font_size TINYINT NOT NULL DEFAULT 22 COMMENT '字号 px 12-48' AFTER density,
  ADD COLUMN rotate    SMALLINT NOT NULL DEFAULT -28 COMMENT '倾斜角度 -60~0' AFTER font_size,
  ADD COLUMN opacity   TINYINT NOT NULL DEFAULT 18 COMMENT '透明度百分比 5-40' AFTER rotate;
