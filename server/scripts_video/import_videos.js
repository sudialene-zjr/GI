const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// 数据库配置
const RAW_DATABASE_URL = process.env.DATABASE_URL || '';
const DATABASE_URL = RAW_DATABASE_URL.replace(/^postgresql\+psycopg:\/\//, 'postgresql://');

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Please set it in .env file.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: !/localhost|127\.0\.0\.1/.test(DATABASE_URL) ? { rejectUnauthorized: false } : false
});

// JSON 数据文件路径
function getLatestDataFile() {
  const dataDir = path.join(__dirname, 'data');

  if (!fs.existsSync(dataDir)) {
    return null;
  }

  const files = fs.readdirSync(dataDir)
    .filter(f => f.match(/^\d{4}_\d{4}_\d{4}\.json$/));

  if (files.length === 0) {
    return null;
  }

  // 按文件名排序（时间戳），取最新的
  files.sort().reverse();
  return path.join(dataDir, files[0]);
}

const DATA_FILE = process.env.VIDEO_DATA_FILE || getLatestDataFile();

if (!DATA_FILE) {
  console.error('未找到数据文件。请先运行 export_video_data.js 导出数据，或设置 VIDEO_DATA_FILE 环境变量。');
  process.exit(1);
}

console.log(`使用数据文件: ${DATA_FILE}`);

// 导入视频到数据库
async function importVideosFromJSON() {
  try {
    console.log('读取视频数据文件...');
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    if (!data.categories || data.categories.length === 0) {
      console.log('未找到分类数据');
      return;
    }

    console.log(`找到 ${data.categories.length} 个分类, ${data.total_videos} 个视频`);

    let importedCategories = 0;
    let importedSections = 0;
    let importedVideos = 0;
    let skippedCategories = 0;
    let skippedSections = 0;
    let skippedVideos = 0;

    // 遍历所有分类
    for (const category of data.categories) {
      // 检查分类是否已存在
      const categoryResult = await pool.query(
        'SELECT id FROM video_categories WHERE code = $1',
        [category.category_code]
      );

      let categoryId;

      if (categoryResult.rows.length > 0) {
        categoryId = categoryResult.rows[0].id;
        skippedCategories++;
        console.log(`跳过分类: ${category.category_code} - ${category.category_title}`);
      } else {
        // 插入分类
        const insertCategoryResult = await pool.query(
          `INSERT INTO video_categories (code, title, sort_order)
           VALUES ($1, $2, $3)
           ON CONFLICT (code) DO NOTHING
           RETURNING id`,
          [category.category_code, category.category_title, category.category_sort_order]
        );

        if (insertCategoryResult.rows.length > 0) {
          categoryId = insertCategoryResult.rows[0].id;
          importedCategories++;
          console.log(`导入分类: ${category.category_code} - ${category.category_title}`);
        } else {
          categoryId = (await pool.query('SELECT id FROM video_categories WHERE code = $1', [category.category_code])).rows[0].id;
          skippedCategories++;
        }
      }

      // 遍历所有章节
      if (category.sections) {
        for (const section of category.sections) {
          // 检查章节是否已存在
          const sectionResult = await pool.query(
            'SELECT id FROM video_sections WHERE code = $1',
            [section.section_code]
          );

          let sectionId;

          if (sectionResult.rows.length > 0) {
            sectionId = sectionResult.rows[0].id;
            skippedSections++;
            console.log(`  跳过章节: ${section.section_code} - ${section.section_title}`);
          } else {
            // 插入章节
            const insertSectionResult = await pool.query(
              `INSERT INTO video_sections (category_id, code, title, sort_order)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (category_id, code) DO NOTHING
               RETURNING id`,
              [categoryId, section.section_code, section.section_title, section.section_sort_order]
            );

            if (insertSectionResult.rows.length > 0) {
              sectionId = insertSectionResult.rows[0].id;
              importedSections++;
              console.log(`  导入章节: ${section.section_code} - ${section.section_title}`);
            } else {
              sectionId = (await pool.query('SELECT id FROM video_sections WHERE code = $1', [section.section_code])).rows[0].id;
              skippedSections++;
            }
          }

          // 遍历所有视频
          if (section.videos) {
            for (const video of section.videos) {
              // 检查视频是否已存在（通过 ID 或哈希）
              const videoResult = await pool.query(
                `SELECT id FROM videos WHERE id = $1 OR file_hash = $2`,
                [video.video_id, video.file_hash]
              );

              if (videoResult.rows.length > 0) {
                skippedVideos++;
                console.log(`    跳过视频: ${video.code} - ${video.title}`);
                continue;
              }

              // 插入视频
              await pool.query(
                `INSERT INTO videos (id, section_id, code, title, original_filename, file_hash, cos_key, file_size, duration, mime_type, sort_order, is_active)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                 ON CONFLICT (id) DO NOTHING`,
                [
                  video.video_id,
                  sectionId,
                  video.code,
                  video.title,
                  video.original_filename,
                  video.file_hash,
                  video.cos_key,
                  video.file_size,
                  video.duration,
                  video.mime_type,
                  video.sort_order,
                  video.is_active
                ]
              );

              importedVideos++;
              console.log(`    导入视频: ${video.code} - ${video.title}`);
            }
          }
        }
      }
    }

    console.log(`\n导入完成!`);
    console.log(`分类: 成功 ${importedCategories}, 跳过 ${skippedCategories}`);
    console.log(`章节: 成功 ${importedSections}, 跳过 ${skippedSections}`);
    console.log(`视频: 成功 ${importedVideos}, 跳过 ${skippedVideos}`);

  } catch (error) {
    console.error('导入失败:', error);
  } finally {
    await pool.end();
  }
}

// 执行导入
importVideosFromJSON();
