const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

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

// 视频目录
const VIDEOS_DIR = process.env.VIDEOS_DIR || path.join(__dirname, '../videos');

// 计算文件哈希
function calculateFileHash(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

// 获取文件大小
function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size;
}

// 解析文件名获取视频信息
function parseVideoInfo(filename) {
  // 移除 .mp4 扩展名
  const name = filename.replace(/\.mp4$/i, '');

  // 尝试匹配格式: "序号 标题" 或 "序号.子序号 标题"
  const match = name.match(/^(\d+(?:\.\d+)*(?:\.\d+)?)\s+(.+)$/);

  if (match) {
    const code = match[1];
    const title = match[2];

    // 根据 code 分解分类、章节、视频
    const parts = code.split('.');
    let categoryCode = parts[0] || '';
    let sectionCode = '';
    let videoCode = code;

    if (parts.length === 2) {
      sectionCode = code;
      videoCode = '';
    } else if (parts.length >= 3) {
      sectionCode = parts.slice(0, 2).join('.');
      videoCode = code;
    }

    return {
      code,
      title,
      categoryCode,
      sectionCode,
      videoCode
    };
  }

  // 如果无法解析，使用完整文件名
  return {
    code: name,
    title: name,
    categoryCode: '',
    sectionCode: '',
    videoCode: name
  };
}

// 扫描视频文件
function scanVideoFiles(dir) {
  const videos = [];

  function scanDirectory(currentDir) {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (item.toLowerCase().endsWith('.mp4')) {
        const relativePath = path.relative(dir, fullPath);
        const hash = calculateFileHash(fullPath);
        const size = getFileSize(fullPath);
        const info = parseVideoInfo(item);

        videos.push({
          filename: item,
          relativePath,
          fullPath,
          hash,
          size,
          ...info
        });
      }
    }
  }

  scanDirectory(dir);
  return videos;
}

// 导入视频到数据库
async function importVideos() {
  try {
    console.log('扫描视频文件...');
    const videos = scanVideoFiles(VIDEOS_DIR);

    if (videos.length === 0) {
      console.log('未找到视频文件');
      return;
    }

    console.log(`找到 ${videos.length} 个视频文件`);

    // 查询或创建分类和章节
    const categoryMap = new Map();
    const sectionMap = new Map();

    for (const video of videos) {
      // 查询分类
      if (video.categoryCode && !categoryMap.has(video.categoryCode)) {
        const categoryResult = await pool.query(
          'SELECT id FROM video_categories WHERE code = $1',
          [video.categoryCode]
        );

        if (categoryResult.rows.length > 0) {
          categoryMap.set(video.categoryCode, categoryResult.rows[0].id);
        }
      }

      // 查询章节
      if (video.sectionCode && !sectionMap.has(video.sectionCode)) {
        const sectionResult = await pool.query(
          'SELECT id FROM video_sections WHERE code = $1',
          [video.sectionCode]
        );

        if (sectionResult.rows.length > 0) {
          sectionMap.set(video.sectionCode, sectionResult.rows[0].id);
        }
      }
    }

    // 导入视频
    let imported = 0;
    let skipped = 0;

    for (const video of videos) {
      const sectionId = sectionMap.get(video.sectionCode);
      const code = video.videoCode || video.code;

      // 检查是否已存在
      const existingResult = await pool.query(
        'SELECT id FROM videos WHERE file_hash = $1',
        [video.hash]
      );

      if (existingResult.rows.length > 0) {
        console.log(`跳过: ${video.filename} (已存在)`);
        skipped++;
        continue;
      }

      // 插入视频记录
      const insertResult = await pool.query(
        `INSERT INTO videos (section_id, code, title, original_filename, file_hash, cos_key, file_size, mime_type, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
         ON CONFLICT (section_id, code) DO UPDATE
         SET file_hash = EXCLUDED.file_hash,
             cos_key = EXCLUDED.cos_key,
             file_size = EXCLUDED.file_size,
             original_filename = EXCLUDED.original_filename,
             updated_at = now()
         RETURNING id, code, title`,
        [
          sectionId || null,
          code,
          video.title,
          video.filename,
          video.hash,
          `videos/${video.hash}`,
          video.size,
          'video/mp4'
        ]
      );

      console.log(`导入: ${video.filename} -> ${code}: ${video.title}`);
      imported++;
    }

    console.log(`\n导入完成!`);
    console.log(`成功导入: ${imported}`);
    console.log(`跳过: ${skipped}`);

  } catch (error) {
    console.error('导入失败:', error);
  } finally {
    await pool.end();
  }
}

// 执行导入
importVideos();
