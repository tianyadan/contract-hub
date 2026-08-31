-- ============================================================
-- 心智协同 - 合同协作系统 V1
-- MySQL 8.x
-- ============================================================

-- ============================================================
-- 1. 用户表
-- ============================================================

CREATE TABLE sys_user (
    id              BIGINT          NOT NULL COMMENT '用户ID',

    username        VARCHAR(64)     NOT NULL COMMENT '登录账号',
    password        VARCHAR(255)    NOT NULL COMMENT '密码Hash',

    nickname        VARCHAR(64)     DEFAULT NULL COMMENT '用户昵称/姓名',
    phone           VARCHAR(32)     DEFAULT NULL COMMENT '手机号',
    email           VARCHAR(128)    DEFAULT NULL COMMENT '邮箱',

    avatar_url      VARCHAR(512)    DEFAULT NULL COMMENT '头像URL',

    status          TINYINT         NOT NULL DEFAULT 1 COMMENT '状态：0禁用 1正常',

    last_login_time DATETIME        DEFAULT NULL COMMENT '最后登录时间',
    last_login_ip   VARCHAR(64)     DEFAULT NULL COMMENT '最后登录IP',

    create_time     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    PRIMARY KEY (id),
    UNIQUE KEY uk_username (username),
    UNIQUE KEY uk_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统用户表';

-- ============================================================
-- 2. 合同主表
-- ============================================================

CREATE TABLE contract (
    id                  BIGINT          NOT NULL COMMENT '合同ID',

    contract_no         VARCHAR(64)     NOT NULL COMMENT '合同编号',
    contract_name       VARCHAR(255)    NOT NULL COMMENT '合同名称',

    owner_user_id       BIGINT          NOT NULL COMMENT '合同创建人/负责人ID',

    customer_name       VARCHAR(255)    DEFAULT NULL COMMENT '客户名称/公司名称',
    customer_contact    VARCHAR(64)     DEFAULT NULL COMMENT '客户联系人',
    customer_phone      VARCHAR(32)     DEFAULT NULL COMMENT '客户联系电话',

    status              TINYINT         NOT NULL DEFAULT 0
                                        COMMENT '状态：0已导入 1已分享 2协作中 3已确认 4已完成 5已取消',

    current_version_id  BIGINT          DEFAULT NULL COMMENT '当前最新合同版本ID',
    current_version_no  INT             NOT NULL DEFAULT 1 COMMENT '当前版本号',

    description         VARCHAR(1000)   DEFAULT NULL COMMENT '合同备注',

    confirmed_time      DATETIME        DEFAULT NULL COMMENT '合同确认时间',
    completed_time      DATETIME        DEFAULT NULL COMMENT '合同完成时间',

    create_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    PRIMARY KEY (id),

    UNIQUE KEY uk_contract_no (contract_no),

    KEY idx_owner_user_id (owner_user_id),
    KEY idx_status (status),
    KEY idx_customer_name (customer_name),
    KEY idx_create_time (create_time)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同主表';

-- ============================================================
-- 3. 合同版本表
--
-- 每保存一次正式修改，就生成一条新的 Version。
-- 历史版本原则上禁止修改。
-- ============================================================

CREATE TABLE contract_version (
    id                  BIGINT          NOT NULL COMMENT '合同版本ID',

    contract_id         BIGINT          NOT NULL COMMENT '合同ID',

    version_no          INT             NOT NULL COMMENT '版本号：1、2、3...',

    created_by          BIGINT          DEFAULT NULL COMMENT '版本创建人用户ID',

    collaborator_id     BIGINT          DEFAULT NULL COMMENT '如果由外部协作者创建，记录协作者ID',

    source_version_id   BIGINT          DEFAULT NULL COMMENT '基于哪个版本创建',

    -- 原始 DOCX
    oss_object_key      VARCHAR(512)    DEFAULT NULL COMMENT '阿里云OSS Object Key',
    oss_url             VARCHAR(1000)   DEFAULT NULL COMMENT 'DOCX访问地址',

    file_name           VARCHAR(255)    DEFAULT NULL COMMENT '原始文件名',
    file_size           BIGINT          DEFAULT NULL COMMENT '文件大小(Byte)',
    file_hash           VARCHAR(128)    DEFAULT NULL COMMENT '文件Hash，例如SHA256',

    -- Python 解析后的结构化内容
    document_content    LONGTEXT        DEFAULT NULL COMMENT '结构化文档JSON',

    change_summary      VARCHAR(1000)   DEFAULT NULL COMMENT '本版本变更摘要',

    create_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '版本创建时间',

    PRIMARY KEY (id),

    UNIQUE KEY uk_contract_version (contract_id, version_no),

    KEY idx_contract_id (contract_id),
    KEY idx_created_by (created_by),
    KEY idx_source_version_id (source_version_id)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同版本表';

-- ============================================================
-- 4. 合同协作者
--
-- 外部客户不要求注册账号。
-- 通过分享链接进入后填写姓名即可生成 collaborator。
-- ============================================================

CREATE TABLE contract_collaborator (
    id                  BIGINT          NOT NULL COMMENT '协作者ID',

    contract_id         BIGINT          NOT NULL COMMENT '合同ID',

    user_id             BIGINT          DEFAULT NULL COMMENT '系统用户ID，外部客户为空',

    name                VARCHAR(64)     NOT NULL COMMENT '协作者姓名',
    phone               VARCHAR(32)     DEFAULT NULL COMMENT '手机号',
    email               VARCHAR(128)    DEFAULT NULL COMMENT '邮箱',

    collaborator_type   TINYINT         NOT NULL DEFAULT 1
                                        COMMENT '协作者类型：0内部成员 1外部客户',

    permission          TINYINT         NOT NULL DEFAULT 1
                                        COMMENT '权限：0只读 1可编辑',

    status              TINYINT         NOT NULL DEFAULT 1
                                        COMMENT '状态：0禁用 1正常',

    first_access_time   DATETIME        DEFAULT NULL COMMENT '首次访问时间',
    last_access_time    DATETIME        DEFAULT NULL COMMENT '最后访问时间',

    create_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    PRIMARY KEY (id),

    KEY idx_contract_id (contract_id),
    KEY idx_user_id (user_id)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同协作者表';

-- ============================================================
-- 5. 合同分享链接
-- ============================================================

CREATE TABLE contract_share (
    id                  BIGINT          NOT NULL COMMENT '分享记录ID',

    contract_id         BIGINT          NOT NULL COMMENT '合同ID',

    creator_user_id     BIGINT          NOT NULL COMMENT '分享创建人',

    share_token         VARCHAR(128)    NOT NULL COMMENT '分享Token',

    permission          TINYINT         NOT NULL DEFAULT 1
                                        COMMENT '权限：0只读 1可编辑',

    status              TINYINT         NOT NULL DEFAULT 1
                                        COMMENT '状态：0失效 1有效',

    expire_time         DATETIME        DEFAULT NULL COMMENT '链接过期时间',

    access_count        INT             NOT NULL DEFAULT 0 COMMENT '访问次数',

    max_access_count    INT             DEFAULT NULL COMMENT '最大访问次数，NULL表示无限制',

    last_access_time    DATETIME        DEFAULT NULL COMMENT '最后访问时间',

    create_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    PRIMARY KEY (id),

    UNIQUE KEY uk_share_token (share_token),

    KEY idx_contract_id (contract_id),
    KEY idx_creator_user_id (creator_user_id),
    KEY idx_expire_time (expire_time)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同分享记录表';

-- ============================================================
-- 6. 合同变更记录
--
-- 记录 Version A -> Version B 之间发生了什么。
-- 这是整个合同 Diff 功能最核心的表之一。
-- ============================================================

CREATE TABLE contract_change (
    id                  BIGINT          NOT NULL COMMENT '变更记录ID',

    contract_id         BIGINT          NOT NULL COMMENT '合同ID',

    from_version_id     BIGINT          NOT NULL COMMENT '变更前版本ID',
    to_version_id       BIGINT          NOT NULL COMMENT '变更后版本ID',

    operator_user_id    BIGINT          DEFAULT NULL COMMENT '系统用户操作者ID',
    collaborator_id     BIGINT          DEFAULT NULL COMMENT '外部协作者ID',

    change_type         TINYINT         NOT NULL
                                        COMMENT '变更类型：0新增 1删除 2修改',

    block_id            VARCHAR(128)    DEFAULT NULL COMMENT '文档块/段落唯一标识',

    clause_no           VARCHAR(64)     DEFAULT NULL COMMENT '合同条款编号，例如3.2',

    old_content         LONGTEXT        DEFAULT NULL COMMENT '修改前内容',

    new_content         LONGTEXT        DEFAULT NULL COMMENT '修改后内容',

    change_reason       VARCHAR(1000)   DEFAULT NULL COMMENT '修改原因/说明',

    create_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    PRIMARY KEY (id),

    KEY idx_contract_id (contract_id),
    KEY idx_from_version_id (from_version_id),
    KEY idx_to_version_id (to_version_id),
    KEY idx_operator_user_id (operator_user_id),
    KEY idx_collaborator_id (collaborator_id)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同内容变更记录表';

-- ============================================================
-- 7. 合同确认记录
--
-- 谁确认了哪个版本。
-- 一个合同版本可以由内部人员 + 外部客户分别确认。
-- ============================================================

CREATE TABLE contract_confirmation (
    id                  BIGINT          NOT NULL COMMENT '确认记录ID',

    contract_id         BIGINT          NOT NULL COMMENT '合同ID',

    version_id          BIGINT          NOT NULL COMMENT '确认的合同版本ID',

    user_id             BIGINT          DEFAULT NULL COMMENT '系统用户ID',

    collaborator_id     BIGINT          DEFAULT NULL COMMENT '外部协作者ID',

    confirmer_name      VARCHAR(64)     NOT NULL COMMENT '确认人姓名',

    confirmer_type      TINYINT         NOT NULL
                                        COMMENT '确认人类型：0内部用户 1外部协作者',

    confirm_status      TINYINT         NOT NULL DEFAULT 1
                                        COMMENT '确认状态：0取消确认 1已确认',

    confirm_ip          VARCHAR(64)     DEFAULT NULL COMMENT '确认时IP',

    user_agent          VARCHAR(1000)   DEFAULT NULL COMMENT '确认设备User-Agent',

    confirm_time        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '确认时间',

    create_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    PRIMARY KEY (id),

    KEY idx_contract_id (contract_id),
    KEY idx_version_id (version_id),
    KEY idx_user_id (user_id),
    KEY idx_collaborator_id (collaborator_id)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同确认记录表';

-- ============================================================
-- 8. 合同审计日志
--
-- 与 contract_change 不同：
--
-- change = 合同内容发生了什么变化
-- audit_log = 用户在系统里做了什么
-- ============================================================

CREATE TABLE contract_audit_log (
    id                  BIGINT          NOT NULL COMMENT '审计日志ID',

    contract_id         BIGINT          NOT NULL COMMENT '合同ID',

    user_id             BIGINT          DEFAULT NULL COMMENT '系统用户ID',

    collaborator_id     BIGINT          DEFAULT NULL COMMENT '外部协作者ID',

    operator_name       VARCHAR(64)     DEFAULT NULL COMMENT '操作者名称',

    operation_type      VARCHAR(64)     NOT NULL COMMENT '操作类型',

    operation_desc      VARCHAR(1000)   DEFAULT NULL COMMENT '操作描述',

    version_id          BIGINT          DEFAULT NULL COMMENT '相关合同版本ID',

    ip_address          VARCHAR(64)     DEFAULT NULL COMMENT '操作IP',

    user_agent          VARCHAR(1000)   DEFAULT NULL COMMENT '浏览器User-Agent',

    extra_data          JSON            DEFAULT NULL COMMENT '额外审计信息',

    create_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',

    PRIMARY KEY (id),

    KEY idx_contract_id (contract_id),
    KEY idx_user_id (user_id),
    KEY idx_collaborator_id (collaborator_id),
    KEY idx_operation_type (operation_type),
    KEY idx_create_time (create_time)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同操作审计日志表';