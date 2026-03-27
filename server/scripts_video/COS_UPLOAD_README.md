# COS
scripts/
该目录用于存储关于数据库/COS交互的脚本
用于向数据库导入视频目录

# 对视频数据库的解释
视频文件在上传至腾讯云对象存储（COS, Cloud Object Storage）后，系统会根据其内容计算唯一的哈希值（如 SHA-256），该哈希值作为视频的唯一标识符（而非原始文件名），用于避免重复上传和确保数据一致性。与此同时，本地数据库中会创建一条记录，将该哈希值与视频的元信息（如上传时间、原始文件名、COS 存储路径、视频时长、标签等）关联存储。通过这种方式，系统既能高效管理海量视频资源，又能实现快速检索、去重和完整性校验。

# 关键脚本
export_video_data.js : 从本地数据库中导出视频数据, 输出: video_data_export.json

import_videos.js : 识别 video_data_export.json, 导入到本地数据库中

test_cos.js : 用于测试与 COS 服务器的连接

update_app_html.js : 将导出的视频数据写入app.html, 用于更新前端

upload_videos_to_cos.js : 将本地静态视频上传至 COS 存储, 并将视频元数据存入数据库

# 更新流程

## 1. 更新模块
```bash
npm install
```

## 2. 建表
```bash
psql "postgresql://app_user:huaxi@127.0.0.1:5432/gi_edu" -f server/db/video_tables.sql
```

## 3. 同步视频表单
将 video_data_export.json 导入 gi_edu 数据库的视频表单
```bash
node server/scripts_video/import_videos.js
```