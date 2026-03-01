const { Pool } = require('pg');

const pool = new Pool({ connectionString: 'postgresql://app_user:huaxi@127.0.0.1:5432/gi_edu' });

(async () => {
  const tables = ['users', 'user_profiles', 'survey_responses'];
  for (const table of tables) {
    const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
    console.log(`${table}: ${result.rows[0].count} 条记录`);
  }
  await pool.end();
})();
