#!/bin/bash
# MySQL 容器首次初始化：建库并按序导入 schema
set -euo pipefail

SQL_DIR="/sql"

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" --default-character-set=utf8mb4 <<EOSQL
CREATE DATABASE IF NOT EXISTS contract_manager
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
EOSQL

# 在指定库中执行单个 SQL 文件
run_sql() {
  echo "Running $1 ..."
  mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" --default-character-set=utf8mb4 contract_manager < "${SQL_DIR}/$1"
}

run_sql init.sql
run_sql migrate_v2.sql
run_sql migrate_v3.sql
run_sql migrate_v4.sql
run_sql migrate_v5.sql
# 跳过 migrate_v6/v7：init.sql 已含完整 user_watermark_setting（含 density 等列）
# 跳过 migrate_v1_data.sql：空库无需旧数据迁移
run_sql migrate_v8.sql

echo "MySQL schema bootstrap done."
