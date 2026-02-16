const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const COS = require('cos-nodejs-sdk-v5');

// 从 .env 文件加载环境变量
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0 && !line.startsWith('#')) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

// 环境变量配置
const {
  COS_SECRET_ID,
  COS_SECRET_KEY,
  COS_BUCKET,
  COS_REGION = 'ap-guangzhou',
  COS_VIDEO_PREFIX = 'videos/',
  DATABASE_URL,
  VIDEOS_DIR = './static/videos'
} = process.env;

// 初始化数据库连接
const pool = new Pool({ connectionString: DATABASE_URL });

// 初始化 COS 客户端
const cos = new COS({
  SecretId: COS_SECRET_ID,
  SecretKey: COS_SECRET_KEY,
});

/**
 * 计算文件的 SHA256 哈希
 */
async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * 解析视频目录结构
 * 支持两种格式:
 * 1. 三层结构: 章编号. 标题/节编号. 标题/视频编号 标题.mp4
 * 2. 两层结构: 章编号. 标题/视频编号 标题.mp4 (用于单独的视频)
 */
function parseVideoPath(relativePath) {
  const parts = relativePath.split('/');
  if (!parts[parts.length - 1].endsWith('.mp4')) {
    return null;
  }

  const videoFile = parts[parts.length - 1];

  // 解析视频: "1.1.1胃镜、肠镜检查的区别.mp4" 或 "1.1.1 胃镜、肠镜检查的区别.mp4"
  const videoMatch = videoFile.match(/^(\d+(?:\.\d+)*)\s*(.+)\.mp4$/);
  if (!videoMatch) return null;

  const videoCode = videoMatch[1];
  const videoTitle = videoMatch[2];

  // 三层结构: 章/节/视频
  if (parts.length === 3) {
    const [categoryStr, sectionStr] = parts;

    // 解析章: "1. 无痛消化内镜诊疗概述"
    const categoryMatch = categoryStr.match(/^(\d+)\.\s*(.+)$/);
    if (!categoryMatch) return null;

    // 解析节: "1.1 概念界定与术式区分"
    const sectionMatch = sectionStr.match(/^(\d+\.\d+)\s*(.+)$/);
    if (!sectionMatch) return null;

    return {
      categoryCode: categoryMatch[1],
      categoryTitle: categoryMatch[2],
      sectionCode: sectionMatch[1],
      sectionTitle: sectionMatch[2],
      videoCode,
      videoTitle,
      originalFilename: videoFile
    };
  }

  // 两层结构: 章/视频 (直接在章目录下的视频)
  if (parts.length === 2) {
    const [categoryStr] = parts;

    // 解析章: "4. 麻醉流程与术中监护"
    const categoryMatch = categoryStr.match(/^(\d+)\.\s*(.+)$/);
    if (!categoryMatch) return null;

    // 创建一个默认的节
    const sectionCode = videoCode.split('.').slice(0, 2).join('.');
    const sectionTitle = '概述';

    return {
      categoryCode: categoryMatch[1],
      categoryTitle: categoryMatch[2],
      sectionCode,
      sectionTitle,
      videoCode,
      videoTitle,
      originalFilename: videoFile
    };
  }

  return null;
}

/**
 * 递归查找所有视频文件
 */
function findVideoFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...findVideoFiles(fullPath));
    } else if (item.isFile() && item.name.endsWith('.mp4')) {
      const relativePath = path.relative(process.env.VIDEOS_DIR, fullPath).replace(/\\/g, '/');
      files.push({ fullPath, relativePath });
    }
  }

  return files;
}

/**
 * 上传单个视频到 COS
 */
async function uploadToCos(filePath, fileHash) {
  const cosKey = `${process.env.COS_VIDEO_PREFIX || 'videos/'}${fileHash}`;

  return new Promise((resolve, reject) => {
    cos.uploadFile({
      Bucket: process.env.COS_BUCKET,
      Region: process.env.COS_REGION || 'ap-guangzhou',
      Key: cosKey,
      FilePath: filePath,
      onProgress: (progressData) => {
        const percent = Math.round(progressData.percent * 100);
        process.stdout.write(`\r上传进度: ${percent}%`);
      }
    }, (err, data) => {
      if (err) reject(err);
      else resolve({ cosKey, Location: data.Location });
    });
  });
}

/**
 * 创建或获取视频分类
 */
async function getOrCreateCategory(code, title, sortOrder) {
  const result = await pool.query(
    `INSERT INTO video_categories (code, title, sort_order)
     VALUES ($1, $2, $3)
     ON CONFLICT (code) DO UPDATE SET title = $2
     RETURNING id`,
    [code, title, sortOrder]
  );
  return result.rows[0].id;
}

/**
 * 创建或获取视频章节
 */
async function getOrCreateSection(categoryId, code, title, sortOrder) {
  const result = await pool.query(
    `INSERT INTO video_sections (category_id, code, title, sort_order)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (category_id, code) DO UPDATE SET title = $3
     RETURNING id`,
    [categoryId, code, title, sortOrder]
  );
  return result.rows[0].id;
}

/**
 * 检查视频是否已存在
 */
async function videoExists(fileHash) {
  const result = await pool.query(
    'SELECT id FROM videos WHERE file_hash = $1',
    [fileHash]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * 创建视频记录
 */
async function createVideo(sectionId, code, title, originalFilename, fileHash, cosKey, fileSize, sortOrder) {
  const result = await pool.query(
    `INSERT INTO videos (section_id, code, title, original_filename, file_hash, cos_key, file_size, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (file_hash) DO NOTHING
     RETURNING id`,
    [sectionId, code, title, originalFilename, fileHash, cosKey, fileSize, sortOrder]
  );
  return result.rows[0]?.id;
}

/**
 * 主上传流程
 */
async function main() {
  console.log('开始上传视频到 COS...');

  // 检查环境变量
  if (!process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY || !process.env.COS_BUCKET || !process.env.DATABASE_URL) {
    console.error('缺少必要的环境变量: COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, DATABASE_URL');
    process.exit(1);
  }

  // 检查视频目录
  if (!fs.existsSync(process.env.VIDEOS_DIR)) {
    console.error(`视频目录不存在: ${process.env.VIDEOS_DIR}`);
    process.exit(1);
  }

  // 查找所有视频文件
  console.log(`扫描视频目录: ${process.env.VIDEOS_DIR}`);
  const videoFiles = findVideoFiles(process.env.VIDEOS_DIR);
  console.log(`找到 ${videoFiles.length} 个视频文件\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const { fullPath, relativePath } of videoFiles) {
    try {
      const parsed = parseVideoPath(relativePath);
      if (!parsed) {
        console.warn(`\n⚠️  跳过无法解析的路径: ${relativePath}`);
        skipped++;
        continue;
      }

      console.log(`\n📁 ${parsed.videoCode} ${parsed.videoTitle}`);

      // 检查文件是否存在
      if (!fs.existsSync(fullPath)) {
        console.warn(`  ⚠️  文件不存在，跳过`);
        skipped++;
        continue;
      }

      // 计算文件哈希
      const fileStats = fs.statSync(fullPath);
      console.log(`  📊 文件大小: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);

      process.stdout.write('  🔒 计算哈希... ');
      const fileHash = await calculateFileHash(fullPath);
      console.log(`${fileHash.substring(0, 12)}...`);

      // 检查视频是否已存在
      const existingVideoId = await videoExists(fileHash);
      if (existingVideoId) {
        console.log(`  ✅ 视频已存在，跳过上传`);
        skipped++;
        continue;
      }

      // 上传到 COS
      process.stdout.write('  ☁️  上传到 COS... ');
      const { cosKey } = await uploadToCos(fullPath, fileHash);
      console.log('完成');

      // 创建分类和章节
      const categoryId = await getOrCreateCategory(parsed.categoryCode, parsed.categoryTitle, parseInt(parsed.categoryCode));
      const sectionId = await getOrCreateSection(categoryId, parsed.sectionCode, parsed.sectionTitle, 0);

      // 创建视频记录
      await createVideo(
        sectionId,
        parsed.videoCode,
        parsed.videoTitle,
        parsed.originalFilename,
        fileHash,
        cosKey,
        fileStats.size,
        0
      );

      console.log('  ✅ 数据库记录已创建');
      uploaded++;

    } catch (error) {
      console.error(`\n❌ 处理失败: ${relativePath}`);
      console.error(`   ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`上传完成!`);
  console.log(`  成功: ${uploaded}`);
  console.log(`  跳过: ${skipped}`);
  console.log(`  失败: ${failed}`);
  console.log('='.repeat(50));

  await pool.end();
}

// 运行主流程
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
