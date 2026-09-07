-- V3.12：管理员角色、邀请码表、用户软删除语义扩展
-- status 既有：0禁用 1正常；新增语义 2=软删除
-- role：0普通用户 1管理员

ALTER TABLE sys_user
  ADD COLUMN role TINYINT NOT NULL DEFAULT 0 COMMENT '角色：0普通用户 1管理员' AFTER status;

CREATE TABLE IF NOT EXISTS invite_code (
  id                BIGINT       NOT NULL COMMENT '主键',
  code              VARCHAR(32)  NOT NULL COMMENT '邀请码',
  created_by        BIGINT       NOT NULL COMMENT '创建人（管理员）',
  expire_at         DATETIME     NOT NULL COMMENT '过期时间',
  used_at           DATETIME     DEFAULT NULL COMMENT '使用时间',
  used_by_user_id   BIGINT       DEFAULT NULL COMMENT '使用者用户ID',
  create_time       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_invite_code (code),
  KEY idx_expire_at (expire_at),
  KEY idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='注册邀请码';
