-- V3.12 单点登录会话 + 登录留痕
-- 执行库：contract_manager（或当前业务库）

ALTER TABLE sys_user
  ADD COLUMN last_login_device VARCHAR(128) NULL COMMENT '最后登录设备摘要' AFTER last_login_ip;

CREATE TABLE IF NOT EXISTS user_session (
  id              BIGINT       NOT NULL COMMENT '会话ID',
  user_id         BIGINT       NOT NULL COMMENT '用户ID',
  session_token   VARCHAR(64)  NOT NULL COMMENT '会话令牌(JWT sid)',
  login_ip        VARCHAR(64)  DEFAULT NULL COMMENT '登录IP',
  user_agent      VARCHAR(512) DEFAULT NULL COMMENT 'User-Agent',
  device_label    VARCHAR(128) DEFAULT NULL COMMENT '设备摘要',
  status          TINYINT      NOT NULL DEFAULT 1 COMMENT '1有效 0已失效',
  login_time      DATETIME     NOT NULL COMMENT '登录时间',
  last_seen_time  DATETIME     DEFAULT NULL COMMENT '最近活跃',
  revoke_time     DATETIME     DEFAULT NULL COMMENT '失效时间',
  revoke_reason   VARCHAR(32)  DEFAULT NULL COMMENT 'replaced|logout|ban',
  PRIMARY KEY (id),
  UNIQUE KEY uk_session_token (session_token),
  KEY idx_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户登录会话';

CREATE TABLE IF NOT EXISTS user_login_log (
  id              BIGINT       NOT NULL COMMENT '日志ID',
  user_id         BIGINT       NOT NULL COMMENT '用户ID',
  session_id      BIGINT       DEFAULT NULL COMMENT '关联会话',
  login_ip        VARCHAR(64)  DEFAULT NULL COMMENT '登录IP',
  user_agent      VARCHAR(512) DEFAULT NULL COMMENT 'User-Agent',
  device_label    VARCHAR(128) DEFAULT NULL COMMENT '设备摘要',
  login_time      DATETIME     NOT NULL COMMENT '登录时间',
  result          TINYINT      NOT NULL DEFAULT 1 COMMENT '1成功 0失败',
  fail_reason     VARCHAR(64)  DEFAULT NULL COMMENT '失败原因',
  PRIMARY KEY (id),
  KEY idx_user_time (user_id, login_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户登录日志';
