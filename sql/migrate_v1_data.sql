-- ============================================================
-- V1 合同数据迁移到 V2 客户模型（可选执行）
-- 为每个合同 owner 创建「历史客户」并挂接已有合同
-- ============================================================

-- 注意：需先执行 migrate_v2.sql

-- 为每个有合同但未挂客户的 owner 创建默认客户
INSERT INTO customer (id, owner_user_id, customer_name, phone, address, business_type, status, remark, create_time, update_time)
SELECT
    CONCAT(UNIX_TIMESTAMP(NOW(3)) * 1000, FLOOR(RAND() * 1000)) AS id,
    c.owner_user_id,
    CONCAT('历史客户-', c.owner_user_id) AS customer_name,
    '00000000000' AS phone,
    NULL AS address,
    '历史迁移' AS business_type,
    1 AS status,
    'V1 合同自动迁移生成的默认客户，可后续手工整理' AS remark,
    NOW() AS create_time,
    NOW() AS update_time
FROM (
    SELECT DISTINCT owner_user_id
    FROM contract
    WHERE customer_id IS NULL
) AS c
WHERE NOT EXISTS (
    SELECT 1 FROM customer cu
    WHERE cu.owner_user_id = c.owner_user_id
      AND cu.customer_name = CONCAT('历史客户-', c.owner_user_id)
);

-- 将未挂客户的合同关联到对应 owner 的历史客户
UPDATE contract c
INNER JOIN customer cu
    ON cu.owner_user_id = c.owner_user_id
   AND cu.customer_name = CONCAT('历史客户-', c.owner_user_id)
SET c.customer_id = cu.id
WHERE c.customer_id IS NULL;
