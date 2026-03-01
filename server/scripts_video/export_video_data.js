const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://app_user:huaxi@127.0.0.1:5432/gi_edu';

// 初始化数据库连接
const pool = new Pool({ connectionString: DATABASE_URL.replace(/^postgresql\+psycopg:\/\//, 'postgresql://') });

async function exportVideoData() {
  console.log('开始导出视频数据...\n');

  try {
    // 查询分类、章节、视频
    const result = await pool.query(`
      SELECT
        c.id as category_id,
        c.code as category_code,
        c.title as category_title,
        c.sort_order as category_sort_order,
        s.id as section_id,
        s.code as section_code,
        s.title as section_title,
        s.sort_order as section_sort_order,
        v.id as video_id,
        v.code as video_code,
        v.title as video_title,
        v.original_filename,
        v.file_hash,
        v.cos_key,
        v.file_size,
        v.duration,
        v.mime_type,
        v.sort_order as video_sort_order,
        v.is_active,
        v.created_at,
        v.updated_at
      FROM videos v
      JOIN video_sections s ON v.section_id = s.id
      JOIN video_categories c ON s.category_id = c.id
      ORDER BY c.sort_order, s.sort_order, v.sort_order
    `);

    // 按分类分组
    const grouped = {};
    result.rows.forEach(row => {
      const catKey = row.category_code;
      if (!grouped[catKey]) {
        grouped[catKey] = {
          category_code: row.category_code,
          category_title: row.category_title,
          category_sort_order: row.category_sort_order,
          category_id: row.category_id,
          sections: {}
        };
      }

      const secKey = row.section_code;
      if (!grouped[catKey].sections[secKey]) {
        grouped[catKey].sections[secKey] = {
          section_code: row.section_code,
          section_title: row.section_title,
          section_sort_order: row.section_sort_order,
          section_id: row.section_id,
          videos: []
        };
      }

      grouped[catKey].sections[secKey].videos.push({
        video_id: row.video_id,
        code: row.video_code,
        title: row.video_title,
        original_filename: row.original_filename,
        file_hash: row.file_hash,
        cos_key: row.cos_key,
        file_size: row.file_size,
        duration: row.duration,
        mime_type: row.mime_type,
        sort_order: row.video_sort_order,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at
      });
    });

    // 转换为数组格式
    const exportData = {
      exported_at: new Date().toISOString(),
      total_videos: result.rows.length,
      total_categories: Object.keys(grouped).length,
      categories: Object.values(grouped).map(cat => ({
        ...cat,
        sections: Object.values(cat.sections)
      }))
    };

    // 写入 JSON 文件
    const outputDir = path.join(__dirname, 'data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 生成文件名：YYYY_MMDD_HHMM.json
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const filename = `${year}_${month}${day}_${hours}${minutes}.json`;
    const outputPath = path.join(outputDir, filename);
    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');

    console.log(`✅ 导出成功!`);
    console.log(`   文件路径: ${outputPath}`);
    console.log(`   视频数量: ${exportData.total_videos}`);
    console.log(`   分类数量: ${exportData.total_categories}`);
    console.log(`   导出时间: ${exportData.exported_at}`);

    await pool.end();
  } catch (error) {
    console.error('❌ 导出失败:', error);
    process.exit(1);
  }
}

exportVideoData();
