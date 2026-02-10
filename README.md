# 胃肠镜教育助手（GI Edu）

本仓库已整合 Web 前端 + 业务后端 + AI Agent，目标是为胃肠镜患者提供术前教育、术后支持与随访。

## 目录结构
```
GI/
  app.html / app.js / styles.css     # 前端（问答/学习中心/用户资料）
  server/                            # Node.js + PostgreSQL 接口（用户/随访问卷）
  agent/                             # Python FastAPI + Qwen（AI Agent）
    app/                             # API、检索、提示词
    scripts/                         # 数据处理脚本
  static/                            # 静态资源
    data/                            # 知识库原始数据与术语
    images/                          # 存储静态图片
    videos/                          # 存储静态视频
```

## 系统架构与数据流
1. Web 端登录/资料/随访信息 -> 存入 PostgreSQL
2. 用户提问时，Web 端把 `user/profile/survey` 一并发送到 `agent /v1/chat`
3. Agent 端执行：红线优先拦截 -> FAQ 检索 -> Qwen 生成
4. Web 端渲染 Markdown 回复

## 环境准备
1. Node.js（建议 18+）
2. Python（建议 3.11 或 3.12）
3. PostgreSQL

## 本地运行（完整流程）
### 静态数据准备
#### 1. 下载静态数据压缩包, 分享在群里了(目前采用这个方式)
#### 2. 解压静态数据在GI目录下, 文件夹名称为static, 内部直接包含 data, images, videos文件夹, 用于存储学习中心要用的视频和图片.

### 1) 初始化数据库（Web 端依赖）
```bash
# 需将<superuser>替换为数据库超级用户名, 默认为 postgres

# 创建 gi_edu 数据库
psql "postgresql://<superuser>@127.0.0.1:5432/postgres" -c "CREATE DATABASE gi_edu;"

# 数据库安装拓展
psql "postgresql://<superuser>@127.0.0.1:5432/gi_edu" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# 创建 app_user 用户, 密码为 huaxi
psql "postgresql://<superuser>@127.0.0.1:5432/gi_edu" -c "CREATE USER app_user WITH PASSWORD 'huaxi';"

# 赋予 app_user 权限
psql "postgresql://<superuser>@127.0.0.1:5432/gi_edu" -c "GRANT ALL ON SCHEMA public TO app_user;"
psql "postgresql://<superuser>@127.0.0.1:5432/gi_edu" -c "GRANT ALL PRIVILEGES ON DATABASE gi_edu TO app_user;"

# 初始化数据库
psql "postgresql://app_user:huaxi@127.0.0.1:5432/gi_edu" -f server/db/init.sql
```

### 2) 构建 Agent 知识库
```bash
cd agent
python3 scripts/build_data.py
```

### 3) 安装 Agent 依赖

#### 1. 创建虚拟环境
```bash
cd agent
python3 -m venv .venv
```

#### 2. 激活环境
```bash
# Windows
.venv\Scripts\activate

# Linux
source .venv/bin/activate
```

#### 3. 安装依赖
```bash
python -m pip install -r requirements.txt
```

### 4) 启动 Agent（端口 8000）
```bash
cd agent
source .venv/bin/activate

# Windows
$env:QWEN_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
$env:QWEN_API_KEY="你的API_KEY"
$env:QWEN_MODEL="qwen3-max"

# macOS, Linux
export QWEN_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export QWEN_API_KEY="你的API_KEY"
export QWEN_MODEL=qwen3-max

uvicorn app.main:app --reload --port 8000
```

### 5) 启动 Web 服务（端口 3000）
#### 1.新开一个终端, 设置环境变量
```bash
# Windows
$env:DATABASE_URL="postgresql://app_user:huaxi@127.0.0.1:5432/gi_edu"
$env:JWT_SECRET="请换成足够随机的字符串"

# macOS, Linux
export DATABASE_URL="postgresql://app_user:huaxi@127.0.0.1:5432/gi_edu"
export JWT_SECRET="请换成足够随机的字符串"
```
#### 2.启动服务
```bash
cd ..
npm install
npm run start
```
访问：`http://localhost:3000`

## 快速测试
```bash
curl http://127.0.0.1:8000/v1/health
```
```bash
curl -X POST http://127.0.0.1:8000/v1/chat   -H "Content-Type: application/json"   -d '{"question":"做无痛胃肠镜检查，吃喝怎么准备？"}'
```

## Agent 接入后开发路线
1. **术语解释**：接入 `agent/data/专有名词/` 作为术语库，先规则解释，再由 LLM 复述为患者语言。
2. **提示词版本化**：增加 `PROMPT_VERSION` 与 v1/v2/v3 切换，支持 A/B 测试。
3. **RAG 升级**：由当前轻量检索升级到混合检索（BM25 + 向量），并引入重排。
4. **安全拦截**：红线规则优先，新增“高危药物/并发症”兜底模板。
5. **个性化分层**：按教育程度、年龄、病史、随访结果输出不同深度解释。
6. **动态学习**：对高频问题与低满意度问题做追踪与内容优化。
7. **可观测性**：记录命中率、红线触发率、满意度等指标，支持版本对比。

## 评测方法
**目标**：避免红线漏报、保证核心 FAQ 命中、提升满意度。

1. 回归评测集：使用 `agent/data/评测集/*.xlsx` 作为问题集，统计指标包括红线命中率、召回率、低风险错误率。
2. 人工抽检：每次更新提示词或知识库后，随机抽样 20-50 条对话评估正确性。
3. 线上反馈：结合 `survey_responses` 的满意度/理解度指标做版本对比。

## 常见问题
- `pip install` 报 PEP 668：必须使用虚拟环境
- `uvicorn` 看起来卡住：正常，服务在前台运行
- 前端 404：确认 `/v1/chat` 指向 8000
- 浏览器 CORS：默认允许 `http://localhost:3000` / `http://127.0.0.1:3000`，可用 `CORS_ORIGINS` 覆盖

---
如需分支协作，请优先修改 `agent/` 或 `server/` 下对应模块，并在 PR 中附带评测结果摘要。
