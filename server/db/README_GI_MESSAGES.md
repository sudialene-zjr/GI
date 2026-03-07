# 用户AI交互记录功能说明

## 功能概述

新增"用户AI交互记录"模块，用于保存和查看用户与AI助手的对话历史。该功能包括：

1. **新建 gi_messages 表**：独立于原有的 chat_messages 表，用于脱敏存储聊天记录
2. **用户清空聊天不影响 gi_messages**：用户清空本地聊天记录时，gi_messages 表中的数据不受影响
3. **访客消息也保存**：访客（未登录用户）的对话也会存储到 gi_messages 表
4. **管理端查看功能**：管理员可以在管理面板查看所有用户的AI交互记录

## 数据库结构

### gi_messages 表

```sql
CREATE TABLE IF NOT EXISTS gi_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL DEFAULT gen_random_uuid(),  -- 访客会话ID
  user_id uuid REFERENCES users(id) ON DELETE SET NULL, -- 已注册用户ID
  is_guest boolean NOT NULL DEFAULT false,              -- 是否为访客
  role text NOT NULL CHECK (role IN ('user', 'assistant')), -- 角色：用户或助手
  content text NOT NULL,                                -- 消息内容
  title text,                                           -- 消息标题
  risk_level text NOT NULL DEFAULT 'normal',           -- 风险等级
  created_at timestamptz NOT NULL DEFAULT now()        -- 创建时间
);
```

### 索引

为提高查询性能，添加了以下索引：
- `idx_gi_messages_session` - 按会话ID查询
- `idx_gi_messages_user_time` - 按用户和时间查询
- `idx_gi_messages_guest_time` - 按访客状态和时间查询

## API 接口

### 1. 保存注册用户消息

**接口**: `POST /api/chat/history`

**说明**: 在保存到 chat_messages 表的同时，自动保存到 gi_messages 表。

**认证**: 需要登录（Bearer Token）

### 2. 保存访客消息

**接口**: `POST /api/guest/message`

**请求体**:
```json
{
  "role": "user",
  "content": "用户的问题",
  "title": "标题（可选）",
  "riskLevel": "normal",
  "sessionId": "访客会话ID"
}
```

**说明**: 访客的消息会保存到 gi_messages 表，is_guest 为 true。

### 3. 获取AI交互记录（管理端）

**接口**: `GET /api/admin/messages`

**查询参数**:
- `page` - 页码（默认1）
- `pageSize` - 每页数量（默认20）
- `userId` - 用户ID（可选）
- `isGuest` - 是否为访客（可选，true/false）

**认证**: 需要管理员登录（Bearer Token）

**响应**:
```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "session_id": "uuid",
      "is_guest": false,
      "user_id": "uuid",
      "user_name": "用户名",
      "user_account": "账号",
      "role": "user",
      "content": "消息内容（已脱敏）",
      "title": "标题",
      "risk_level": "normal",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

## 部署步骤

### 1. 创建数据库表

执行以下 SQL 脚本：

```bash
# 方法1：通过 psql 执行
psql -h your-host -U your-user -d your-database -f server/db/gi_messages.sql

# 方法2：在 PostgreSQL 客户端中执行
\i server/db/gi_messages.sql
```

### 2. 重启服务

```bash
# 重启主服务
cd server
node server.js

# 重启管理服务
cd ../admin
node server.js
```

### 3. 验证功能

1. 访问 http://localhost:3000/app.html，以注册用户身份进行对话
2. 访问 http://localhost:3300/，登录管理员账号
3. 点击"用户AI交互记录"查看数据
4. 清空聊天记录，再次查看管理端，确认 gi_messages 数据仍然存在

## 使用说明

### 管理员查看AI交互记录

1. 登录管理面板：http://localhost:3300/
2. 点击左侧导航"用户AI交互记录"
3. 可通过以下方式筛选：
   - 用户类型：全部 / 已注册用户 / 访客
   - 搜索用户名或账号（需在服务端实现完整搜索功能）
4. 支持分页浏览，每页显示20条记录

### 数据脱敏

- 消息内容在管理端显示时，超过100字符的部分会被截断并显示"..."
- 用户信息包括：用户名、账号、消息内容、风险等级、时间
- 访客信息包括：会话ID、消息内容、风险等级、时间

## 技术细节

### 前端实现

1. **访客会话管理**：
   - 使用 `localStorage` 存储访客会话ID
   - 每次访客访问时会自动创建或恢复会话

2. **消息保存**：
   - 注册用户：调用 `/api/chat/history` 同时保存到两个表
   - 访客：调用 `/api/guest/message` 仅保存到 gi_messages 表

3. **本地存储**：
   - 访客聊天记录仍保存在浏览器本地 `localStorage`
   - 清空本地记录不影响 gi_messages 表

### 后端实现

1. **双重存储**：
   - handleSaveChatMessage: 保存到 chat_messages 和 gi_messages
   - handleSaveGuestMessage: 仅保存到 gi_messages

2. **错误处理**：
   - gi_messages 保存失败不影响主流程
   - 错误会记录到控制台日志

3. **性能优化**：
   - 使用索引加速查询
   - 支持分页，避免一次加载大量数据

## 注意事项

1. **数据库迁移**：首次部署时需要执行 gi_messages.sql
2. **向后兼容**：不影响现有功能，chat_messages 表继续用于用户查看
3. **数据隐私**：gi_messages 表用于管理端查看，已进行内容脱敏
4. **访客数据**：访客消息通过 session_id 关联，无法关联到具体用户
5. **风险等级**：normal（正常）、sensitive（敏感）、system（系统）

## 未来扩展

- [ ] 添加按日期范围筛选
- [ ] 添加按风险等级筛选
- [ ] 导出AI交互记录为Excel
- [ ] 添加统计分析功能（如消息数量趋势）
- [ ] 添加关键字搜索功能
