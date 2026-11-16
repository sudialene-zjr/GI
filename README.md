# 胃肠镜教育助手（GI Edu）

本仓库已整合 Web 前端 + 业务后端 + AI Agent，目标是为胃肠镜患者提供术前教育、术后支持与随访。

## 目录结构
```
GI/
    app.html / app.js / styles.css     # 前端（问答/学习中心/用户资料）

    server/                            # Node.js + PostgreSQL 接口（用户/随访问卷）
        db/                             # sql程序
        scripts_users/                  # 用户数据的导出/导入脚本
        scripts_video/                  # 视频元数据的导出/导入脚本

    agent/                             # Python FastAPI + Qwen（AI Agent）
        app/                             # API、检索、提示词
        scripts/                         # 数据处理脚本
        
    agent/data/                        # 知识库原始表格（7 类场景问答，Excel）
    data/processed/                    # 由 build_data.py 生成的检索数据（运行时产物）
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

### 1) 初始化数据库（Web 端依赖）
```bash
# 需将<superuser>替换为数据库超级用户名, 默认为 postgres

# 创建 gi_edu 数据库
psql "postgresql://<superuser>@127.0.0.1:5432/postgres" -c "CREATE DATABASE gi_edu;"

# 数据库安装拓展
psql "postgresql://<superuser>@127.0.0.1:5432/gi_edu" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# 创建 app_user 用户（示例密码 change_me_local，请自行替换为你的本地密码）
psql "postgresql://<superuser>@127.0.0.1:5432/gi_edu" -c "CREATE USER app_user WITH PASSWORD 'change_me_local';";

# 赋予 app_user 权限
psql "postgresql://<superuser>@127.0.0.1:5432/gi_edu" -c "GRANT ALL ON SCHEMA public TO app_user;"
psql "postgresql://<superuser>@127.0.0.1:5432/gi_edu" -c "GRANT ALL PRIVILEGES ON DATABASE gi_edu TO app_user;"

# 初始化数据库
psql "postgresql://app_user:change_me_local@127.0.0.1:5432/gi_edu" -f server/db/init.sql
psql "postgresql://app_user:change_me_local@127.0.0.1:5432/gi_edu" -f server/db/video_tables.sql
psql "postgresql://app_user:change_me_local@127.0.0.1:5432/gi_edu" -f server/db/gi_messages.sql

# 向视频表单中导入已有的视频元数据
node server/scripts/import_videos.js
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
$env:COS_SECRET_ID="你的API_ID"
$env:COS_SECRET_KEY="你的API_KEY"
$env:COS_BUCKET="你的对象存储桶名称"
$env:COS_REGION="对象存储桶所在的区域"
$env:COS_VIDEO_PREFIX="videos/" # 视频索引

# macOS, Linux
export DATABASE_URL="postgresql://app_user:huaxi@127.0.0.1:5432/gi_edu"
export JWT_SECRET="请换成足够随机的字符串"
export COS_SECRET_ID="你的API_ID"
export COS_SECRET_KEY="你的API_KEY"
export COS_BUCKET="你的对象存储桶名称"
export COS_REGION="对象存储桶所在的区域"
export COS_VIDEO_PREFIX="videos/" # 视频索引

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

1. 回归评测集：使用 `agent/auto_eval.py` 批量跑评测问题，统计指标包括红线命中率、召回率、低风险错误率。
2. 人工抽检：每次更新提示词或知识库后，随机抽样 20-50 条对话评估正确性。
3. 线上反馈：结合 `survey_responses` 的满意度/理解度指标做版本对比。

## 开源说明

### 许可证

本仓库代码以 [MIT License](LICENSE) 发布。

`agent/data/` 下的医学知识库表格为项目自建的示范内容，随仓库一并提供，供学习与二次开发参考；其医学结论不能替代执业医师的判断。

### 免责声明

本项目为**患者教育**用途的技术演示，**不是医疗器械，也不构成诊疗建议**。

- 若用于任何真实医疗场景，必须由具备资质的医疗机构完成内容审核、风险分级与合规评估；
- `agent/app/` 内的提示词与知识库内容均未经过临床验证；
- 使用者因直接或间接采用本项目内容所产生的任何后果，作者不承担责任。

### 数据与隐私

- 仓库内**不包含任何真实患者信息**：`server/data/`、`server/scripts_users/data/`、`server/scripts_video/data/` 等运行时目录均已在 `.gitignore` 中排除；
- 视频元数据仅含分类与标题，不含访问地址或个人信息；
- 提交代码前请确认未携带 `.env`、密钥文件或导出的用户数据；本地变量参考 `agent/.env.example` 与 `server/.env.example`。

## 常见问题
- `pip install` 报 PEP 668：必须使用虚拟环境
- `uvicorn` 看起来卡住：正常，服务在前台运行
- 前端 404：确认 `/v1/chat` 指向 8000
- 浏览器 CORS：默认允许 `http://localhost:3000` / `http://127.0.0.1:3000`，可用 `CORS_ORIGINS` 覆盖

---
如需分支协作，请优先修改 `agent/` 或 `server/` 下对应模块，并在 PR 中附带评测结果摘要。
