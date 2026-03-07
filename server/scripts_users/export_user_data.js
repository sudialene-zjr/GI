const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://app_user:huaxi@127.0.0.1:5432/gi_edu';

// 初始化数据库连接
const pool = new Pool({ connectionString: DATABASE_URL.replace(/^postgresql\+psycopg:\/\//, 'postgresql://') });

// 表列表
const TABLES = ['users', 'user_profiles', 'survey_responses', 'chat_messages'];

// 脱敏字段配置
const SENSITIVE_FIELDS = {
  users: ['account', 'account_lower', 'password_hash', 'password_salt'],
  user_profiles: ['phone'],
  survey_responses: [],
  chat_messages: ['user_id']
};

// 脱敏函数
function maskValue(value, fieldName) {
  if (!value) return value;

  // 对账号进行脱敏：保留前后各1-2位，中间用*代替
  if (fieldName === 'account' || fieldName === 'account_lower') {
    const str = String(value);
    if (str.length <= 4) {
      return str[0] + '*'.repeat(str.length - 1);
    }
    return str[0] + '*'.repeat(str.length - 2) + str[str.length - 1];
  }

  // 对密码相关字段完全隐藏
  if (fieldName === 'password_hash' || fieldName === 'password_salt') {
    return '***HIDDEN***';
  }

  // 对手机号进行脱敏：保留前3位和后4位
  if (fieldName === 'phone') {
    const str = String(value);
    if (str.length === 11) {
      return str.substring(0, 3) + '****' + str.substring(7);
    }
    return '***';
  }

  // 对用户ID进行脱敏：保留前8位，中间部分替换
  if (fieldName === 'user_id') {
    const str = String(value);
    if (str.length === 36) { // UUID 格式: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      return str.substring(0, 8) + '-****-****-****-' + str.substring(24);
    }
    return '***';
  }

  return value;
}

// 对记录进行脱敏处理
function maskRecord(record, tableName) {
  const sensitiveFields = SENSITIVE_FIELDS[tableName] || [];
  const maskedRecord = { ...record };

  for (const field of sensitiveFields) {
    if (maskedRecord.hasOwnProperty(field)) {
      maskedRecord[field] = maskValue(maskedRecord[field], field);
    }
  }

  return maskedRecord;
}

// 生成时间戳目录名：YYYY_MMDD_HHMM
function generateTimestampDir() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}_${month}${day}_${hours}${minutes}`;
}

async function exportTable(tableName) {
  console.log(`导出表: ${tableName}...`);

  try {
    const result = await pool.query(`SELECT * FROM ${tableName} ORDER BY created_at ASC`);

    if (result.rows.length === 0) {
      console.log(`  ⚠️  表 ${tableName} 为空`);
      return { success: true, count: 0 };
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      table_name: tableName,
      total_records: result.rows.length,
      records: result.rows
    };

    return { success: true, count: result.rows.length };
  } catch (error) {
    console.error(`  ❌ 导出表 ${tableName} 失败:`, error.message);
    return { success: false, error: error.message };
  }
}

async function exportUserData() {
  console.log('开始导出用户数据...\n');

  try {
    // 创建时间戳目录
    const timestamp = generateTimestampDir();
    const outputDir = path.join(__dirname, 'data', timestamp);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`导出目录: ${outputDir}\n`);

    let totalRecords = 0;
    let successCount = 0;
    let failCount = 0;

    // 逐个导出表
    for (const tableName of TABLES) {
      // 不同表可能有不同的排序字段
      let orderBy = 'created_at';
      if (tableName === 'user_profiles') {
        orderBy = 'updated_at';
      } else if (tableName === 'survey_responses') {
        orderBy = 'created_at';
      }

      const result = await pool.query(`SELECT * FROM ${tableName} ORDER BY ${orderBy} ASC`);

      // 对记录进行脱敏处理
      const maskedRecords = result.rows.map(row => maskRecord(row, tableName));

      const exportData = {
        exported_at: new Date().toISOString(),
        table_name: tableName,
        total_records: result.rows.length,
        records: maskedRecords
      };

      const filePath = path.join(outputDir, `${tableName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');

      if (result.rows.length > 0) {
        console.log(`  ✅ ${tableName}: ${result.rows.length} 条记录`);
        totalRecords += result.rows.length;
        successCount++;
      } else {
        console.log(`  ⚠️  ${tableName}: 无数据`);
        successCount++;
      }
    }

    // 写入元数据文件
    const metadata = {
      exported_at: new Date().toISOString(),
      timestamp_dir: timestamp,
      tables: TABLES,
      total_tables: TABLES.length,
      total_records: totalRecords,
      tables_info: {}
    };

    for (const tableName of TABLES) {
      const filePath = path.join(outputDir, `${tableName}.json`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      metadata.tables_info[tableName] = {
        record_count: data.total_records,
        exported_at: data.exported_at
      };
    }

    const metadataPath = path.join(outputDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    console.log(`\n✅ 导出成功!`);
    console.log(`   目录: ${outputDir}`);
    console.log(`   表数量: ${successCount}/${TABLES.length}`);
    console.log(`   总记录数: ${totalRecords}`);
    console.log(`   导出时间: ${metadata.exported_at}`);

    await pool.end();
  } catch (error) {
    console.error('❌ 导出失败:', error);
    process.exit(1);
  }
}

exportUserData();
