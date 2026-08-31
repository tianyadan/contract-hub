-- ============================================================
-- 心智协同合同协作系统 V2 数据库迁移
-- 执行前请备份数据库；可在已有 V1 库上增量执行
-- ============================================================

-- 1. 客户表
CREATE TABLE IF NOT EXISTS customer (
    id              BIGINT          NOT NULL COMMENT '客户ID',
    owner_user_id   BIGINT          NOT NULL COMMENT '负责人/创建人',

    customer_name   VARCHAR(255)    NOT NULL COMMENT '客户名称',
    phone           VARCHAR(32)     NOT NULL COMMENT '联系电话',
    address         VARCHAR(500)    DEFAULT NULL COMMENT '联系地址',
    business_type   VARCHAR(128)    DEFAULT NULL COMMENT '业务类型（前期文本，后期枚举）',

    status          TINYINT         NOT NULL DEFAULT 1 COMMENT '状态：0禁用 1正常',
    remark          VARCHAR(1000)   DEFAULT NULL COMMENT '备注',

    create_time     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_owner_user_id (owner_user_id),
    KEY idx_customer_name (customer_name),
    KEY idx_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户表';

-- 2. 合同模板表
CREATE TABLE IF NOT EXISTS contract_template (
    id                  BIGINT          NOT NULL COMMENT '模板ID',
    owner_user_id       BIGINT          NOT NULL COMMENT '模板所属用户',

    template_name       VARCHAR(255)    NOT NULL COMMENT '模板名称（默认取上传文件名）',
    original_file_name  VARCHAR(255)    NOT NULL COMMENT '原始上传文件名',

    status              TINYINT         NOT NULL DEFAULT 1 COMMENT '状态：0删除 1正常',

    current_version_id  BIGINT          DEFAULT NULL COMMENT '当前模板版本ID',
    current_version_no  INT             NOT NULL DEFAULT 1 COMMENT '当前版本号',

    description         VARCHAR(1000)   DEFAULT NULL COMMENT '模板说明',

    create_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_owner_user_id (owner_user_id),
    KEY idx_template_name (template_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同模板表';

-- 3. 模板版本表
CREATE TABLE IF NOT EXISTS contract_template_version (
    id                  BIGINT          NOT NULL COMMENT '模板版本ID',
    template_id         BIGINT          NOT NULL COMMENT '模板ID',
    version_no          INT             NOT NULL COMMENT '版本号',

    created_by          BIGINT          NOT NULL COMMENT '创建人',

    oss_object_key      VARCHAR(512)    NOT NULL COMMENT 'OSS Object Key',
    oss_url             VARCHAR(1000)   DEFAULT NULL,
    file_name           VARCHAR(255)    NOT NULL,
    file_size           BIGINT          DEFAULT NULL,
    file_hash           VARCHAR(128)    DEFAULT NULL,

    document_content    LONGTEXT        DEFAULT NULL COMMENT '结构化 JSON',

    change_summary      VARCHAR(1000)   DEFAULT NULL,

    create_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_template_version (template_id, version_no),
    KEY idx_template_id (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同模板版本表';

-- 4. contract 表扩展字段（若列已存在请跳过对应语句）
-- MySQL 8.0.12+ 可用存储过程判断；此处提供标准 ALTER，重复执行会报错

ALTER TABLE contract
    ADD COLUMN customer_id BIGINT DEFAULT NULL COMMENT '客户ID' AFTER owner_user_id;

ALTER TABLE contract
    ADD COLUMN template_id BIGINT DEFAULT NULL COMMENT '来源模板ID' AFTER customer_id;

ALTER TABLE contract
    ADD COLUMN customer_address VARCHAR(500) DEFAULT NULL COMMENT '客户地址快照' AFTER customer_phone;

ALTER TABLE contract
    ADD KEY idx_customer_id (customer_id);

ALTER TABLE contract
    ADD KEY idx_template_id (template_id);
