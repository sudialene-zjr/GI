const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://app_user:huaxi@127.0.0.1:5432/gi_edu';

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Please set it in .env file.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL.replace(/^postgresql\+psycopg:\/\//, 'postgresql://'),
  ssl: !/localhost|127\.0\.0\.1/.test(DATABASE_URL) ? { rejectUnauthorized: false } : false
});

// 获取最新时间戳目录
function getLatestDataDir() {
  const dataDir = path.join(__dirname, 'data');

  if (!fs.existsSync(dataDir)) {
    return null;
  }

  const dirs = fs.readdirSync(dataDir)
    .filter(d => {
      // 匹配 YYYY_MMDD_HHMM 格式
      return fs.statSync(path.join(dataDir, d)).isDirectory() &&
             d.match(/^\d{4}_\d{4}_\d{4}$/);
    });

  if (dirs.length === 0) {
    return null;
  }

  // 按目录名排序（时间戳），取最新的
  dirs.sort().reverse();
  return path.join(dataDir, dirs[0]);
}

// 检查用户是否已存在
async function userExists(account) {
  const result = await pool.query(
    'SELECT id FROM users WHERE account_lower = $1',
    [account.toLowerCase()]
  );
  return result.rows.length > 0;
}

// 检查用户资料是否已存在
async function profileExists(userId) {
  const result = await pool.query(
    'SELECT user_id FROM user_profiles WHERE user_id = $1',
    [userId]
  );
  return result.rows.length > 0;
}

// 检查问卷调查是否已存在
async function surveyExists(userId) {
  const result = await pool.query(
    'SELECT user_id FROM survey_responses WHERE user_id = $1',
    [userId]
  );
  return result.rows.length > 0;
}

async function importUserTable(tableName, dataDir) {
  const filePath = path.join(dataDir, `${tableName}.json`);

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  ${tableName}.json 不存在，跳过`);
    return { imported: 0, skipped: 0, failed: 0 };
  }

  console.log(`导入表: ${tableName}...`);

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  if (data.total_records === 0) {
    console.log(`  ⚠️  表 ${tableName} 为空`);
    return { imported: 0, skipped: 0, failed: 0 };
  }

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const record of data.records) {
    try {
      if (tableName === 'users') {
        if (await userExists(record.account)) {
          skipped++;
          continue;
        }

        await pool.query(
          `INSERT INTO users (id, name, account, account_lower, password_hash, password_salt, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [record.id, record.name, record.account, record.account_lower, record.password_hash, record.password_salt, record.created_at]
        );
        imported++;
        console.log(`    ✅ 导入用户: ${record.account}`);

      } else if (tableName === 'user_profiles') {
        if (await profileExists(record.user_id)) {
          skipped++;
          continue;
        }

        await pool.query(
          `INSERT INTO user_profiles (user_id, name, birth_month, gender, education, phone, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [record.user_id, record.name, record.birth_month, record.gender, record.education, record.phone, record.updated_at]
        );
        imported++;
        console.log(`    ✅ 导入资料: ${record.name}`);

      } else if (tableName === 'survey_responses') {
        if (await surveyExists(record.user_id)) {
          skipped++;
          continue;
        }

        await pool.query(
          `INSERT INTO survey_responses (id, user_id, satisfaction, understanding, anxiety, compliance, helpful, suggestion, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [record.id, record.user_id, record.satisfaction, record.understanding, record.anxiety, record.compliance, record.helpful, record.suggestion, record.created_at, record.updated_at]
        );
        imported++;
        console.log(`    ✅ 导入问卷: user_id=${record.user_id}`);
      }
    } catch (error) {
      failed++;
      console.error(`    ❌ 导入失败: ${error.message}`);
    }
  }

  console.log(`  ${tableName}: 导入 ${imported}, 跳过 ${skipped}, 失败 ${failed}`);
  return { imported, skipped, failed };
}

async function importUserData() {
  try {
    // 获取数据目录
    const dataDir = process.env.USER_DATA_DIR || getLatestDataDir();

    if (!dataDir) {
      console.error('未找到数据目录。请先运行 export_user_data.js 导出数据，或设置 USER_DATA_DIR 环境变量。');
      process.exit(1);
    }

    console.log(`使用数据目录: ${dataDir}\n`);

    // 读取元数据
    const metadataPath = path.join(dataDir, 'metadata.json');
    let metadata = null;
    if (fs.existsSync(metadataPath)) {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      console.log(`导出时间: ${metadata.exported_at}`);
      console.log(`总记录数: ${metadata.total_records}\n`);
    }

    const tables = ['users', 'user_profiles', 'survey_responses'];
    const results = {
      users: { imported: 0, skipped: 0, failed: 0 },
      user_profiles: { imported: 0, skipped: 0, failed: 0 },
      survey_responses: { imported: 0, skipped: 0, failed: 0 }
    };

    // 逐个导入表
    for (const tableName of tables) {
      const result = await importUserTable(tableName, dataDir);
      results[tableName] = result;
    }

    // 汇总
    const totalImported = Object.values(results).reduce((sum, r) => sum + r.imported, 0);
    const totalSkipped = Object.values(results).reduce((sum, r) => sum + r.skipped, 0);
    const totalFailed = Object.values(results).reduce((sum, r) => sum + r.failed, 0);

    console.log(`\n导入完成!`);
    console.log(`总计: 导入 ${totalImported}, 跳过 ${totalSkipped}, 失败 ${totalFailed}`);

    if (totalFailed > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error('导入失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

importUserData();
