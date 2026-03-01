const fs = require('fs');
const path = require('path');

// 读取导出的视频数据
const videoDataPath = path.join(__dirname, 'video_data_export.json');
const videoData = JSON.parse(fs.readFileSync(videoDataPath, 'utf-8'));

// 构建视频编码到标题的映射
const videoMap = {};
videoData.categories.forEach(cat => {
  cat.sections.forEach(sec => {
    sec.videos.forEach(vid => {
      videoMap[vid.code] = vid.title;
    });
  });
});

// 读取 app.html
const appHtmlPath = path.join(__dirname, '..', '..', 'app.html');
let htmlContent = fs.readFileSync(appHtmlPath, 'utf-8');

// 正则匹配所有的 video-item
const videoItemRegex = /<div class="video-item" data-src="([^"]+)" data-title="([^"]+)">\s*<div class="video-link">([^<]+)<\/div>\s*<\/div>/g;

let replacements = 0;

htmlContent = htmlContent.replace(videoItemRegex, (match, src, title, linkText) => {
  replacements++;

  // 尝试从文件名提取视频编号
  // 格式: 1.1.1胃镜、肠镜检查的区别.mp4 或 1.1.1 胃镜、肠镜检查的区别.mp4
  const filenameMatch = src.match(/([^\/]+)\.mp4$/);
  if (!filenameMatch) return match;

  const filename = filenameMatch[1];
  const codeMatch = filename.match(/^(\d+(?:\.\d+)*)/);

  if (!codeMatch) return match;

  const videoCode = codeMatch[1];

  // 获取正确的标题（使用数据库中的标题）
  const videoTitle = videoMap[videoCode] || title;

  // 替换为新的格式
  return `<div class="video-item" data-video-code="${videoCode}" data-title="${videoTitle}">
                            <div class="video-link">${videoTitle}</div>
                          </div>`;
});

// 写回文件
fs.writeFileSync(appHtmlPath, htmlContent, 'utf-8');

console.log(`✅ app.html 更新完成!`);
console.log(`   替换了 ${replacements} 个视频项`);
console.log(`   文件路径: ${appHtmlPath}`);
