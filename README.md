# 胃肠镜教育助手（GI Edu）

面向患者的胃肠镜术前教育与术后恢复建议系统，包含注册/登录、智能问答、学习中心、用户信息与随访问卷。后端使用 PostgreSQL + JWT。

## 功能概览
- 注册 / 登录（JWT 登录态）
- 智能问答界面
- 学习中心（视频 + 文章资料）
- 用户信息与资料填写
- 术后随访问卷

## 技术栈
- 前端：原生 HTML/CSS/JS
- 后端：Node.js（内置 http）
- 数据库：PostgreSQL
- 登录态：JWT

## 目录结构
```
GI/
  app.html
  index.html
  app.js
  styles.css
  server/
    server.js
    db/
      init.sql
      migrate_users.js
```

## 本地运行
### 1. 安装依赖
```bash
cd GI
npm install
```

### 2. 初始化数据库
设置数据库与用户（如已有请跳过）：
```bash
psql "postgresql://<superuser>@127.0.0.1:5432/postgres" -c "CREATE DATABASE gi_edu;"
psql "postgresql://<superuser>@127.0.0.1:5432/gi_edu" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
psql "postgresql://<superuser>@127.0.0.1:5432/gi_edu" -c "GRANT ALL ON SCHEMA public TO app_user;"
psql "postgresql://<superuser>@127.0.0.1:5432/gi_edu" -c "GRANT ALL PRIVILEGES ON DATABASE gi_edu TO app_user;"
```

执行建表脚本：
```bash
psql "postgresql://app_user:huaxi@127.0.0.1:5432/gi_edu" -f server/db/init.sql
```

### 3. 设置环境变量
```bash
export DATABASE_URL="postgresql://app_user:huaxi@127.0.0.1:5432/gi_edu"
export JWT_SECRET="请换成足够随机的字符串"
```

### 4. 启动服务
```bash
npm run start
```

访问：
```
http://localhost:3000
```

## 数据迁移（可选）
如需将旧 `users.json` 数据迁移到 PostgreSQL：
```bash
DATABASE_URL="postgresql://app_user:huaxi@127.0.0.1:5432/gi_edu" node server/db/migrate_users.js
```

## API 概览
- `POST /api/register`
- `POST /api/login`
- `GET /api/me` （需 JWT）
- `GET /api/profile` （需 JWT）
- `POST /api/profile` （需 JWT）

## 说明
- 前端使用 `localStorage` 保存 JWT 与用户信息。
- 生产环境请替换强随机 `JWT_SECRET` 并使用 HTTPS。
